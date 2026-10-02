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
//
// no-browser: a slice's logic never touches the browser. It refuses the
// browser's globals (the page, the address, the storages, the network, the
// window's events and viewport, the frame clock, the observers, the DOM's
// classes) as values, whether named bare or reached through globalThis, self
// or window, by member, destructuring or an alias. It reads oxlint's scope
// analysis: only a reference the file leaves unresolved is the global, so a
// local binding that shadows one passes, and so does a name in a type, which
// names nothing at run time. globalThis and self handed on, or read by a
// computed key, pass: they are the runtime's too, and hold the clock and the
// rest the rule leaves alone. The files vite.config.ts names (`browserEdges`)
// have the rule turned off there: the browser lives at the project's edge.
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
	defs?: unknown[];
	references: { identifier: Node; isRead(): boolean }[];
}
interface Context {
	filename: string;
	report(problem: { node: Literal | Node; message: string }): void;
	sourceCode: {
		getDeclaredVariables(node: Node): Variable[];
		scopeManager: {
			globalScope: { through: { identifier: Node }[]; variables: Variable[] } | null;
		};
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

// The browser's globals, each what a page, and no other runtime, offers.
// The clock (Date, setTimeout, performance) is not among them: vitest's fake
// clock is its edge. Nor is what Node offers too (URL, fetch's Request and
// Response, Blob, TextEncoder, crypto, structuredClone, EventTarget), which
// a unit test runs as the page does; fetch itself is here, since a slice that
// calls it reaches the network, an edge handed in.
const browser = new Set([
	// The page and the address.
	"window",
	"document",
	"navigator",
	"location",
	"history",
	"customElements",
	"getSelection",
	// Storage.
	"localStorage",
	"sessionStorage",
	"indexedDB",
	"caches",
	// The network.
	"fetch",
	"XMLHttpRequest",
	"WebSocket",
	"EventSource",
	// The window's events, its dialogs and other windows.
	"addEventListener",
	"removeEventListener",
	"dispatchEvent",
	"open",
	"alert",
	"confirm",
	"prompt",
	// The viewport, its scroll and its styles.
	"innerWidth",
	"innerHeight",
	"outerWidth",
	"outerHeight",
	"devicePixelRatio",
	"screen",
	"visualViewport",
	"scrollX",
	"scrollY",
	"pageXOffset",
	"pageYOffset",
	"scroll",
	"scrollTo",
	"scrollBy",
	"getComputedStyle",
	"matchMedia",
	// The frame clock and idle time, the page's and not the timers'.
	"requestAnimationFrame",
	"cancelAnimationFrame",
	"requestIdleCallback",
	"cancelIdleCallback",
	// The observers.
	"ResizeObserver",
	"IntersectionObserver",
	"MutationObserver",
	// The DOM's classes as values (instanceof, new, extends); as types they
	// pass.
	"Node",
	"Element",
	"Document",
	"Window",
	"DOMParser",
	"Image",
	"Audio",
]);
const isBrowser = (name: string) => browser.has(name) || /^(HTML|SVG)\w*Element$/.test(name);
// The names the global object goes by, besides window, which is the
// browser's itself.
const globalObjects = new Set(["globalThis", "self"]);

// TypeScript's nodes that run: an expression with a type beside it, and the
// declarations whose bodies or values are code. Every other TS node is a
// type, and a name directly inside one names nothing at run time.
const runtimeTS = new Set([
	...wrappers,
	"TSInstantiationExpression",
	"TSEnumDeclaration",
	"TSEnumMember",
	"TSModuleDeclaration",
	"TSModuleBlock",
	"TSExportAssignment",
	"TSParameterProperty",
	"TSImportEqualsDeclaration",
	"TSExternalModuleReference",
]);
const inType = (node: Node) => {
	const type = node.parent?.type ?? "";
	return type.startsWith("TS") && !runtimeTS.has(type);
};

const edge =
	'a slice\'s logic is handed what it needs, behind an interface its tests hand a fake; the browser lives in the files vite.config.ts names in browserEdges (AGENTS.md, "Code design")';

function noBrowserIn(context: Context) {
	const report = (node: Node, what: string) =>
		context.report({ node, message: `${what} is the browser's: ${edge}` });

	// A value known to be the global object, named `via`: what the code reads
	// of it.
	const follow = (variable: Variable | undefined, via: string) => {
		for (const reference of variable?.references ?? [])
			if (reference.isRead()) use(reference.identifier, via);
	};
	const destructure = (pattern: Node, via: string, declarator: Node): void => {
		if (pattern.type === "Identifier")
			return follow(
				context.sourceCode.getDeclaredVariables(declarator).find((v) => v.name === pattern.name),
				via,
			);
		if (pattern.type === "AssignmentPattern")
			return destructure(pattern.left as Node, via, declarator);
		if (pattern.type !== "ObjectPattern") return;
		for (const property of pattern.properties as Node[]) {
			if (property.type === "RestElement") continue;
			const name = nameOf(property.key, property.computed);
			if (name === undefined) continue;
			if (isBrowser(name)) report(property, `${via}.${name}`);
			else if (globalObjects.has(name))
				destructure(property.value as Node, `${via}.${name}`, declarator);
		}
	};
	function use(node: Node, via: string): void {
		const parent = node.parent;
		if (!parent || inType(node)) return;
		if (parent.type === "MemberExpression" && parent.object === node) {
			const name = nameOf(parent.property, parent.computed);
			if (name === undefined) return;
			if (isBrowser(name)) report(parent, `${via}.${name}`);
			else if (globalObjects.has(name)) use(parent, `${via}.${name}`);
		} else if (wrappers.has(parent.type)) use(parent, via);
		else if (parent.type === "VariableDeclarator" && parent.init === node)
			destructure(parent.id as Node, via, parent);
	}

	// The references to the globals: those no binding of the file resolves,
	// and those resolved to a global the linter declares (globalThis, ES's
	// own; the browser's, where a project's lint config sets its env), which
	// the file never declares.
	const globals = () => {
		const scope = context.sourceCode.scopeManager.globalScope;
		const declared = (scope?.variables ?? []).filter((v) => !v.defs?.length);
		return [
			...(scope?.through ?? []).map((r) => r.identifier),
			...declared.flatMap((v) => v.references.map((r) => r.identifier)),
		];
	};

	return {
		"Program:exit"() {
			for (const identifier of globals()) {
				const name = identifier.name ?? "";
				if (inType(identifier)) continue;
				if (globalObjects.has(name)) {
					use(identifier, name);
					continue;
				}
				if (!isBrowser(name)) continue;
				// window.fetch is named so, window alone as itself.
				const parent = identifier.parent;
				const member =
					name === "window" && parent?.type === "MemberExpression" && parent.object === identifier
						? nameOf(parent.property, parent.computed)
						: undefined;
				if (member !== undefined && parent) report(parent, `window.${member}`);
				else report(identifier, name);
			}
		},
	};
}

const noBrowser = {
	meta: {
		type: "problem",
		docs: { description: "A slice's logic never touches the browser, which lives at the edge" },
	},
	create: noBrowserIn,
};

export default {
	meta: { name: "code-design" },
	rules: { "slice-boundary": sliceBoundary, "no-mocks": noMocks, "no-browser": noBrowser },
};
