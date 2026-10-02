import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { defineConfig, type UserConfig } from "vite-plus";
import codeDesign from "./tools/lint/code-design.ts";

// What the pre-commit hook's `vp staged` formats and lints, by path.
const staged = {
	"{src,e2e,tools}/**/*.{ts,js,json,html,css}": "vp check --fix",
	"*.{md,json,yaml,ts,toml}": "vp check --fix",
	"{docs,tasks,.github}/**/*.{md,yml,yaml,json5}": "vp check --fix",
};

// The files under src/ and tools/ allowed vitest's mocks, spies and stubs,
// which code-design/no-mocks refuses everywhere else: each a true outer
// boundary no fake handed in at the edge can stand for, with a comment
// saying which, as in
//   "src/sync/sync.test.ts", // the network: the service's client cannot be handed in
// A fake handed in at the edge needs no entry: it is plain code. Empty in the
// template.
const mockBoundaries: string[] = [];

// The files under src/ allowed the browser's globals, which
// code-design/no-browser refuses everywhere else: the project's edge, where
// the page, the address, the storages and the network are reached, and the
// logic is handed what it needs. The template's is the composition root. A
// project adds its framework's view files, which render the page, as in
//   "src/**/*.tsx", // the views: React's components
//   "src/**/*.vue", // the views: Vue's single-file components
// and its infrastructure slices, each wrapping one browser API behind a small
// interface its logic is handed, and its tests hand a fake:
//   "src/storage/storage.ts", // localStorage, behind the Store the slices take
const browserEdges: string[] = ["src/main.ts"];

// The code design ratchet (code-design-ratchet.yaml): each of lint's code
// design rules is off for the files listed under it, each a debt with a work
// item, while a project adopts the rule on code that breaks it.
// tools/code-design.ts holds the list itself, and asks lint what a listed
// file still breaks with CODE_DESIGN_RATCHET=ignore, which leaves it out.
const ratchet = (
	process.env.CODE_DESIGN_RATCHET === "ignore"
		? {}
		: (parse(readFileSync(new URL("code-design-ratchet.yaml", import.meta.url), "utf8")) ?? {})
) as Record<string, unknown>;
const ratcheted = Object.keys(codeDesign.rules).flatMap((rule) => {
	const list = ratchet[rule];
	const files = (Array.isArray(list) ? list : []).flatMap((entry: { file?: unknown } | null) =>
		typeof entry?.file === "string" ? [entry.file] : [],
	);
	return files.length ? [{ files, rules: { [`code-design/${rule}`]: "off" as const } }] : [];
});

const lint: NonNullable<UserConfig["lint"]> = {
	ignorePatterns: [
		"dist/**",
		"coverage/**",
		"e2e/.features-gen/**",
		"docs/changelog/**",
		".claude/**",
	],
	jsPlugins: [
		{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
		// The code design rules lint can decide (AGENTS.md, "Code design").
		"./tools/lint/code-design.ts",
	],
	rules: {
		"vite-plus/prefer-vite-plus-imports": "error",
		// A size tripwire on every linted file, src/, e2e/ and tools/ alike: a
		// file over 400 lines is a prompt to look at its responsibilities, and
		// the answer is a split by them (under src/, into more features), or a
		// reason beside it for staying long. A warning, so it never fails a
		// commit or CI, and none in the tree, so the next one is seen. Lines of
		// code only: blank lines and comments are not counted, so the reasons
		// a file gives are never what pushes it over, nor what is cut to get
		// it under.
		"max-lines": ["warn", { max: 400, skipBlankLines: true, skipComments: true }],
	},
	overrides: [
		{
			// A slice reaches another only through that slice's feature file,
			// src/<slice>/<slice>.ts; src/main.ts is held to the same. A file
			// directly under src/ is tools/code-design.ts's, which lint cannot see.
			files: ["src/**/*.ts"],
			rules: { "code-design/slice-boundary": "error" },
		},
		{
			// A test drives the real code: no module mocks, spies or stubs on
			// vitest's `vi`, the clock's controls aside. Every module, not only the
			// test files, so a helper a test imports is held too. e2e/ drives the
			// built page in a browser, where no module can be mocked, and its fakes
			// (Playwright's page.route, page.clock) sit at the network's and the
			// clock's edge, the outer boundaries the rule allows.
			files: ["src/**/*.ts", "tools/**/*.ts"],
			rules: { "code-design/no-mocks": "error" },
		},
		{ files: mockBoundaries, rules: { "code-design/no-mocks": "off" } },
		{
			// A slice's logic never touches the browser: its globals are refused in
			// every file under src/, tests included, whatever its kind (a
			// framework's view files among them), but the edge's. The clock stays
			// outside; e2e/ drives a browser, and tools/ runs in Node.
			files: ["src/**"],
			rules: { "code-design/no-browser": "error" },
		},
		{ files: browserEdges, rules: { "code-design/no-browser": "off" } },
		...ratcheted,
		{
			// E2E tests drive the browser, never the production modules.
			files: ["e2e/**/*.ts"],
			rules: {
				"no-restricted-imports": [
					"error",
					{
						patterns: [
							{
								regex: "(^|/)src(/|$)",
								message: "E2E tests use the browser, not production modules.",
							},
						],
					},
				],
			},
		},
	],
	options: { typeAware: true, typeCheck: true },
};

const test = {
	passWithNoTests: true,
	// A unit test is <name>.test.ts beside the <name>.ts it tests, in a slice
	// under src/ or in tools/ (AGENTS.md, "Code design"); vitest runs nothing
	// else. Every other file its default would run (*.spec.ts, *.test.js,
	// *.test.tsx…) is refused by tools/code-design.ts rather than left here
	// unrun, and so is a test under e2e/, in a folder of tests or with no file
	// beside it.
	include: ["src/**/*.test.ts", "tools/**/*.test.ts"],
	// `--changed` (the git hooks) picks tests by what they import; a change to one
	// of these reruns everything instead. Written as the files themselves: the
	// defaults' `**/package.json/**` form never matches a changed file. The
	// config, the dependencies and the task tooling's config, which the tests
	// read from disk rather than import.
	forceRerunTriggers: [
		"**/package.json",
		"**/pnpm-lock.yaml",
		"**/{vitest,vite}.config.*",
		"**/itos.yaml",
	],
	// Agents' git worktrees live under .claude/worktrees/, inside this folder:
	// their tests are theirs, often half-written, and never this checkout's.
	exclude: ["**/node_modules/**", "**/dist/**", "e2e/**", ".claude/**"],
	coverage: {
		provider: "v8" as const,
		reporter: ["text", "html", "json"],
		// The slices (src/<slice>/); src/main.ts only wires them to the page,
		// and the scenarios cover it.
		include: ["src/**/*.ts"],
		exclude: ["**/*.test.ts", "src/main.ts"],
		thresholds: { statements: 90, branches: 75, functions: 90, lines: 90 },
	},
};

const fmt = {
	useTabs: true,
	ignorePatterns: [
		// The changelog, written on demand by `vp run changelog`.
		"docs/changelog/**",
		"e2e/.features-gen/**",
		"coverage/**",
		".claude/**",
	],
};

export default defineConfig({
	staged,
	lint,
	test,
	fmt,
});
