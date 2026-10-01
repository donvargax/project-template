import { defineConfig, type UserConfig } from "vite-plus";

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
	rules: { "vite-plus/prefer-vite-plus-imports": "error" },
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
