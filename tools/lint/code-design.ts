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
//
// no-mocks: a test drives the real code. It refuses what on vitest's `vi`
// replaces real code (a module, a function, a global) or serves only that,
// and allows the clock's controls and the runner's helpers; a member it does
// not know is refused too, so a release that adds a way to mock is not let
// through unread. It follows `vi` however a file reaches it: imported from
// vite-plus/test or vitest, renamed, through a namespace or a dynamic import,
// destructured, or as a global. no-restricted-properties cannot: it names an
// object by its text, so a renamed or destructured `vi` escapes it. A file
// vite.config.ts allows (`mockBoundaries`) has the rule turned off there.
import { dirname, extname, join, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const src = join(root, "src");

interface Literal {
	type: string;
	value?: unknown;
}
// The parts of oxlint's ESTree nodes and scope analysis the rules read.
interface Node {
	type: string;
	parent?: Node | null;
	value?: unknown;
	name?: string;
	[key: string]: unknown;
}
interface Variable {
	name: string;
	references: { identifier: Node; isRead(): boolean }[];
}
interface Context {
	filename: string;
	report(problem: { node: Literal | Node; message: string }): void;
	sourceCode: {
		getDeclaredVariables(node: Node): Variable[];
		scopeManager: { globalScope: { through: { identifier: Node }[] } | null };
	};
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

// What vitest's `vi` offers, by what each does to the code under test.
// Allowed: the clock's controls (time is an outer boundary every project has,
// and the fake clock is how a test hands one in), and the runner's helpers,
// which wait or configure and replace nothing.
const allowed = new Set([
	"useFakeTimers",
	"useRealTimers",
	"isFakeTimers",
	"setSystemTime",
	"getMockedSystemTime",
	"getRealSystemTime",
	"advanceTimersByTime",
	"advanceTimersByTimeAsync",
	"advanceTimersToNextTimer",
	"advanceTimersToNextTimerAsync",
	"advanceTimersToNextFrame",
	"runAllTimers",
	"runAllTimersAsync",
	"runOnlyPendingTimers",
	"runOnlyPendingTimersAsync",
	"runAllTicks",
	"getTimerCount",
	"clearAllTimers",
	"setTimerTickMode",
	"waitFor",
	"waitUntil",
	"defineHelper",
	"dynamicImportSettled",
	"resetModules",
	"setConfig",
	"resetConfig",
]);
// Refused, each with what it does.
const refused = new Map<string, string>();
const refuse = (what: string, names: string[]) => {
	for (const name of names) refused.set(name, what);
};
refuse("replaces a module, or an object, with a mock", [
	"mock",
	"doMock",
	"importMock",
	"mockObject",
]);
refuse("replaces a function, or spies on a call", ["fn", "spyOn"]);
refuse("replaces a global, or an environment variable", ["stubGlobal", "stubEnv"]);
// With nothing mocked each of these has nothing to do: importActual is then a
// plain import, hoisted feeds a mock's factory, and the rest type, recognise,
// undo or reset a mock or a stub.
refuse("serves only a mock or a stub", [
	"importActual",
	"hoisted",
	"mocked",
	"isMockFunction",
	"unmock",
	"doUnmock",
	"clearAllMocks",
	"resetAllMocks",
	"restoreAllMocks",
	"unstubAllGlobals",
	"unstubAllEnvs",
]);

// The packages a test reaches `vi` from.
const runners = new Set(["vite-plus/test", "vitest"]);
const instead =
	'a test drives the real code, and a true outer boundary takes a fake handed in at the edge, or is a file vite.config.ts names in mockBoundaries (AGENTS.md, "Code design")';

// A property's name, written plainly or as a string in brackets; undefined
// when it is computed.
function nameOf(key: unknown, computed: unknown): string | undefined {
	const node = key as Node;
	if (!computed && node.type === "Identifier") return node.name;
	return node.type === "Literal" && typeof node.value === "string" ? node.value : undefined;
}

// Nodes that hand on the value they wrap unchanged.
const wrappers = new Set([
	"AwaitExpression",
	"ParenthesizedExpression",
	"TSAsExpression",
	"TSSatisfiesExpression",
	"TSNonNullExpression",
	"TSTypeAssertion",
]);

// `vi` itself, or the module it is a member of.
type Kind = "vi" | "module";

function noMocksIn(context: Context) {
	const report = (node: Node, message: string) => context.report({ node, message });
	const judge = (name: string, node: Node) => {
		if (allowed.has(name)) return;
		const what = refused.get(name);
		report(
			node,
			what
				? `vi.${name} ${what}: ${instead}`
				: `vi.${name} is none of the clock's controls or the runner's helpers this rule knows, so it is taken for a mock; if it replaces no real code, allow it in tools/lint/code-design.ts`,
		);
	};
	const lost = (node: Node) =>
		report(
			node,
			"vi is handed on where this rule cannot follow it: call its members on it (vi.useFakeTimers()), or destructure them",
		);

	const follow = (variable: Variable | undefined, kind: Kind) => {
		for (const reference of variable?.references ?? [])
			if (reference.isRead()) use(reference.identifier, kind);
	};

	// A pattern that takes `vi`, or the module, apart.
	const destructure = (pattern: Node, kind: Kind, declarator: Node): void => {
		if (pattern.type === "Identifier")
			return follow(
				context.sourceCode.getDeclaredVariables(declarator).find((v) => v.name === pattern.name),
				kind,
			);
		if (pattern.type === "AssignmentPattern")
			return destructure(pattern.left as Node, kind, declarator);
		if (pattern.type !== "ObjectPattern") return;
		for (const property of pattern.properties as Node[]) {
			if (property.type === "RestElement") {
				if (kind === "vi") lost(property);
				else destructure(property.argument as Node, kind, declarator);
				continue;
			}
			const name = nameOf(property.key, property.computed);
			if (name === undefined) lost(property);
			else if (kind === "vi") judge(name, property);
			else if (name === "vi") destructure(property.value as Node, "vi", declarator);
		}
	};

	// What the code does with a value known to be `vi`, or the module.
	function use(node: Node, kind: Kind): void {
		const parent = node.parent;
		if (!parent) return;
		if (parent.type === "MemberExpression" && parent.object === node) {
			const name = nameOf(parent.property, parent.computed);
			if (name === undefined) lost(parent);
			else if (kind === "vi") judge(name, parent);
			else if (name === "vi") use(parent, "vi");
		} else if (wrappers.has(parent.type)) use(parent, kind);
		else if (parent.type === "VariableDeclarator" && parent.init === node)
			destructure(parent.id as Node, kind, parent);
		// A type (typeof vi.fn) runs nothing.
		else if (!parent.type.startsWith("TS")) lost(node);
	}

	const isRunner = (source: unknown) => {
		const node = source as Node | null | undefined;
		return node?.type === "Literal" && typeof node.value === "string" && runners.has(node.value);
	};

	return {
		ImportDeclaration(node: Node) {
			if (!isRunner(node.source) || node.importKind === "type") return;
			for (const specifier of node.specifiers as Node[]) {
				const [variable] = context.sourceCode.getDeclaredVariables(specifier);
				if (specifier.type === "ImportNamespaceSpecifier") follow(variable, "module");
				else if (
					specifier.type === "ImportSpecifier" &&
					specifier.importKind !== "type" &&
					nameOf(specifier.imported, false) === "vi"
				)
					follow(variable, "vi");
			}
		},
		ImportExpression(node: Node) {
			if (isRunner(node.source)) use(node, "module");
		},
		// `vi` as a global, where the runner is set to provide one.
		"Program:exit"() {
			for (const { identifier } of context.sourceCode.scopeManager.globalScope?.through ?? [])
				if (identifier.name === "vi") use(identifier, "vi");
		},
	};
}

const noMocks = {
	meta: {
		type: "problem",
		docs: { description: "A test drives the real code: no module mocks, spies or stubs" },
	},
	create: noMocksIn,
};

export default {
	meta: { name: "code-design" },
	rules: { "slice-boundary": sliceBoundary, "no-mocks": noMocks },
};
