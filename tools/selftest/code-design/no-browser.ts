// No browser in a slice's logic (T-036), held by lint (code-design/no-browser
// in tools/lint/code-design.ts): it refuses the browser's globals in every
// file under src/, a test or a framework's view file included, named bare or
// reached through globalThis, self or window, by member, destructuring or an
// alias; and it allows a slice handed an adapter and its test a fake, a file
// vite.config.ts's browserEdges names (that one only), src/main.ts, a name in
// a type, a local that shadows a global, the clock, and a file the ratchet
// lists under the rule.
import { readFileSync } from "node:fs";
import { parse, stringify } from "yaml";
import type { Case } from "./case.ts";

const browser = "code-design(no-browser)";
// A slice whose feature file is the given code.
const logic = (code: string) => ({ "src/alpha/alpha.ts": code });
// vite.config.ts with these files at the edge, beside src/main.ts.
const edges = (...files: string[]) => {
	const config = readFileSync("vite.config.ts", "utf8");
	const template = 'const browserEdges: string[] = ["src/main.ts"];';
	if (!config.includes(template)) throw new Error(`vite.config.ts no longer holds \`${template}\``);
	const added = files.map((file) => `\t"${file}", // the self-test's edge\n`).join("");
	return {
		"vite.config.ts": config.replace(
			template,
			`const browserEdges: string[] = [\n\t"src/main.ts",\n${added}];`,
		),
	};
};
// An infrastructure slice wrapping localStorage behind the Store its logic
// takes.
const storage = {
	"src/storage/storage.ts":
		"export interface Store {\n\tget(key: string): string | null;\n}\n\nexport const browserStore: Store = { get: (key) => localStorage.getItem(key) };\n",
};
// The ratchet's list with the alpha slice under no-browser, and its item open.
const listed = () => {
	const rules = parse(readFileSync("code-design-ratchet.yaml", "utf8")) as Record<string, unknown>;
	rules["no-browser"] = [{ file: "src/alpha/alpha.ts", item: "p9-alpha" }];
	const registry = readFileSync("tasks/work-items.yaml", "utf8");
	const [phase] = Object.keys((parse(registry) as { phases: object }).phases);
	return {
		"code-design-ratchet.yaml": stringify(rules),
		"tasks/work-items.yaml": `${registry}\n  - id: p9-alpha\n    title: The self-test's slice, off no-browser\n    phase: ${phase}\n    owner: null\n    status: todo\n    depends_on: []\n    kind: idea\n    why: The self-test's debt.\n`,
	};
};

export const cases: Case[] = [
	...[
		["document", "export const title = () => document.title;\n"],
		["window.localStorage", 'export const saved = () => window.localStorage.getItem("a");\n'],
		["globalThis.fetch", 'export const load = () => globalThis.fetch("/a");\n'],
		[
			"self.matchMedia",
			'const { matchMedia } = self;\n\nexport const dark = () => matchMedia("x");\n',
		],
		[
			"globalThis.sessionStorage",
			"const g = globalThis;\n\nexport const s = () => g.sessionStorage;\n",
		],
		["addEventListener", 'export const on = (f: () => void) => addEventListener("resize", f);\n'],
		["HTMLElement", "export const isElement = (x: unknown) => x instanceof HTMLElement;\n"],
	].map(([name, code]): Case => ({
		name: `a slice's logic uses ${name}`,
		gate: "lint",
		files: logic(code!),
		says: `${browser}: ${name} is the browser's`,
	})),
	{
		name: "a slice's test uses localStorage",
		gate: "lint",
		files: {
			...logic("export const alpha = 1;\n"),
			"src/alpha/alpha.test.ts":
				'import { expect, it } from "vite-plus/test";\n\nit("clears", () => {\n\tlocalStorage.clear();\n\texpect(1).toBe(1);\n});\n',
		},
		says: `${browser}: localStorage is the browser's`,
	},
	{
		name: "a framework's view file browserEdges does not name",
		gate: "lint",
		files: { "src/alpha/view.tsx": "export const title = () => document.title;\n" },
		says: `${browser}: document is the browser's`,
	},
	{
		name: "a framework's view file browserEdges names by its kind",
		gate: "lint",
		files: {
			"src/alpha/view.tsx": "export const title = () => document.title;\n",
			...edges("src/**/*.tsx"),
		},
	},
	{
		name: "a slice handed an adapter, its test a fake",
		gate: "lint",
		files: {
			"src/alpha/alpha.ts":
				'export interface Store {\n\tget(key: string): string | null;\n}\n\nexport const name = (store: Store) => store.get("name") ?? "world";\n',
			"src/alpha/alpha.test.ts":
				'import { expect, it } from "vite-plus/test";\nimport { name } from "./alpha.ts";\n\nit("reads the name", () => {\n\texpect(name({ get: () => "Ada" })).toBe("Ada");\n});\n',
		},
	},
	{
		name: "an infrastructure slice browserEdges names",
		gate: "lint",
		files: { ...storage, ...edges("src/storage/storage.ts") },
	},
	{
		name: "a slice browserEdges does not name, beside one it does",
		gate: "lint",
		files: {
			...storage,
			...logic("export const title = () => document.title;\n"),
			...edges("src/storage/storage.ts"),
		},
		says: `${browser}: document is the browser's`,
	},
	{
		name: "src/main.ts, the composition root",
		gate: "lint",
		files: {
			"src/main.ts":
				'import { greeting } from "./greeting/greeting.ts";\n\nconst app = document.querySelector<HTMLElement>("#app");\nwindow.addEventListener("resize", () => app?.append(greeting(localStorage.getItem("name"))));\n',
		},
	},
	{
		name: "a slice names the browser's globals in types only",
		gate: "lint",
		files: logic(
			"export const width = (e: HTMLElement, o: ResizeObserver | null): number => (o ? e.clientWidth : 0);\nexport type Doc = typeof document;\nexport type Store = typeof window.localStorage;\nexport const same = (a: unknown) => a as typeof globalThis.fetch;\n",
		),
	},
	{
		name: "a slice's local shadows a global",
		gate: "lint",
		files: logic(
			'export const title = (document: { title: string }) => document.title;\n\nexport const load = (fetch: (url: string) => string) => fetch("/a");\n',
		),
	},
	{
		name: "a slice drives the clock",
		gate: "lint",
		files: logic(
			"export const later = (f: () => void) => setTimeout(f, Date.now() % 10 + performance.now() * 0);\n",
		),
	},
	{
		name: "a file the ratchet lists under no-browser, linted",
		gate: "lint",
		files: { ...logic("export const title = () => document.title;\n"), ...listed() },
	},
	{
		name: "a file the ratchet lists under no-browser, its item open",
		gate: "static",
		files: { ...logic("export const title = () => document.title;\n"), ...listed() },
	},
];
