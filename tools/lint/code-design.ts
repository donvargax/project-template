// The code design rules lint holds (AGENTS.md, "Code design"), as an oxlint
// JS plugin that vite.config.ts loads, so `vp check` runs them wherever it
// runs. One rule per rule of the section that lint can decide; what lint
// cannot see (a file it does not lint) is tools/code-design.ts's.
//
// slice-boundary: a slice reaches another only through that slice's feature
// file, src/<slice>/<slice>.ts, never another file of its folder; src/main.ts,
// in no slice, is held to the same. oxlint's own no-restricted-imports cannot
// say it: its `regex` has no lookahead or backreference (a pattern that uses
// one is dropped without a word), and a specifier's meaning depends on the
// file it is written in, which only a rule that resolves it knows.
import { dirname, extname, join, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const src = join(root, "src");

interface Literal {
	type: string;
	value?: unknown;
}
interface Context {
	filename: string;
	report(problem: { node: Literal; message: string }): void;
}

// Where a path falls under src/: its slice (the first folder) and the path
// inside it, "" for the folder itself. Undefined outside src/ and for a file
// directly in it: src/main.ts, or a stray file tools/code-design.ts refuses.
function place(path: string): { slice: string; inner: string } | undefined {
	const [slice, ...inner] = relative(src, path).split(sep);
	if (!slice || slice.startsWith("..") || (inner.length === 0 && extname(slice))) return undefined;
	return { slice, inner: inner.join("/") };
}

// The slice's feature file, named with its extension or without.
const isFeatureFile = ({ slice, inner }: { slice: string; inner: string }) =>
	inner.replace(/\.[jt]s$/, "") === slice;

// A relative or root-absolute specifier (Vite serves /src/… from the root),
// resolved; a package's is undefined.
function target(filename: string, specifier: string): string | undefined {
	const path = specifier.replace(/[?#].*$/, "");
	if (path.startsWith("/")) return join(root, path);
	return path.startsWith("./") || path.startsWith("../")
		? resolve(dirname(filename), path)
		: undefined;
}

function check(context: Context, source: Literal | null | undefined) {
	if (source?.type !== "Literal" || typeof source.value !== "string") return;
	const resolved = target(context.filename, source.value);
	const to = resolved === undefined ? undefined : place(resolved);
	if (!to || to.slice === place(context.filename)?.slice || isFeatureFile(to)) return;
	context.report({
		node: source,
		message: `${source.value} reaches into the ${to.slice} slice: another slice reaches it only through its feature file, src/${to.slice}/${to.slice}.ts (AGENTS.md, "Code design")`,
	});
}

interface ModuleNode {
	source?: Literal | null;
}
const sliceBoundary = {
	meta: {
		type: "problem",
		docs: { description: "A slice is reached only through its feature file" },
	},
	create(context: Context) {
		const visit = (node: ModuleNode) => check(context, node.source);
		return {
			ImportDeclaration: visit,
			ExportNamedDeclaration: visit,
			ExportAllDeclaration: visit,
			ImportExpression: visit,
		};
	},
};

export default {
	meta: { name: "code-design" },
	rules: { "slice-boundary": sliceBoundary },
};
