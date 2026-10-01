// The code design gates refuse what AGENTS.md's "Code design" forbids and let
// through what it allows. Run in a scratch worktree of the current tree
// (uncommitted edits included), so nothing here touches the checkout:
//
//   - lint (tools/lint/code-design.ts, which vite.config.ts loads and
//     `vp check` runs) refuses a slice, or src/main.ts, reaching another
//     slice's inner file by import, re-export, dynamic import or the folder
//     itself, and allows another slice's feature file and a slice's own files;
//     and it refuses each of vitest's mocks, spies and stubs however `vi` is
//     reached (renamed, destructured, through a namespace, a dynamic import,
//     an alias or as a global), a member of `vi` it does not know, and `vi`
//     handed on where it cannot follow, and allows the clock's controls, the
//     runner's helpers, a fake handed in at the edge, and a file
//     vite.config.ts's mockBoundaries names (that one only);
//   - the static check (tools/code-design.ts) refuses a file directly under
//     src/, of any kind, and allows src/main.ts beside the slice folders; and
//     it refuses a unit test with no file beside it, one outside a slice and
//     tools/ (directly in src/, under e2e/), any file in a folder of tests,
//     and every other spelling vitest's default include would run, and allows
//     <name>.test.ts beside <name>.ts in a slice or in tools/;
//   - the pre-commit hook runs that check, and CI runs both gates as steps.
//
// A case is the files it writes over the base tree, the gate that judges
// them, and whether the gate must refuse them, naming what (`says`): a
// refusal counts only when it names the rule. The next code design rule adds
// its cases to `cases`; a gate that is new adds itself to `gates`.
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { cleanEnv, gitIn, plan, sh, worktreeOfCurrentTree, type Run } from "./cli.ts";

type Gate = "lint" | "static" | "pre-commit";
interface Case {
	name: string;
	gate: Gate;
	files: Record<string, string>;
	// What the gate must say when it refuses; absent, the gate must allow.
	says?: string;
}

// A slice of the scratch tree: its feature file and one inner file.
const slice = (name: string, feature = `export const ${name} = 1;\n`) => ({
	[`src/${name}/${name}.ts`]: feature,
	[`src/${name}/inner.ts`]: "export const inner = 1;\n",
});
const reachesIn = "code-design(slice-boundary)";

// A slice's test file, its body after the import of `vi`.
const test = (body: string, imports = 'import { expect, it, vi } from "vite-plus/test";') => ({
	"src/alpha/alpha.ts": "export const alpha = 1;\n",
	"src/alpha/alpha.test.ts": `${imports}\n\n${body}\n`,
});
const mocks = "code-design(no-mocks)";
// What `vi` offers that replaces real code, or serves only that: each refused.
const refused = [
	"mock",
	"doMock",
	"importMock",
	"mockObject",
	"fn",
	"spyOn",
	"stubGlobal",
	"stubEnv",
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
];
// vite.config.ts with one file allowed to mock.
const allowing = (file: string) => {
	const config = readFileSync("vite.config.ts", "utf8");
	const empty = "const mockBoundaries: string[] = [];";
	if (!config.includes(empty)) throw new Error(`vite.config.ts no longer holds \`${empty}\``);
	return config.replace(
		empty,
		`const mockBoundaries: string[] = [\n\t"${file}", // the self-test's boundary\n];`,
	);
};

// A unit test that passes, importing nothing.
const unitTest =
	'import { expect, it } from "vite-plus/test";\n\nit("adds", () => {\n\texpect(1 + 1).toBe(2);\n});\n';
const beside = "code-design(tests-beside-code)";
// Every spelling vitest's default include, **/*.{test,spec}.?(c|m)[jt]s?(x),
// runs, but <name>.test.ts: each refused.
const spellings = ["test", "spec"]
	.flatMap((kind) => ["", "c", "m"].map((module) => `${kind}.${module}`))
	.flatMap((stem) => ["js", "ts"].flatMap((lang) => [`${stem}${lang}`, `${stem}${lang}x`]))
	.filter((spelling) => spelling !== "test.ts");

const cases: Case[] = [
	// The slice boundary (T-029), lint.
	{
		name: "a slice imports another slice's inner file",
		gate: "lint",
		files: {
			...slice("alpha"),
			...slice(
				"beta",
				'import { inner } from "../alpha/inner.ts";\n\nexport const beta = inner;\n',
			),
		},
		says: reachesIn,
	},
	{
		name: "a slice re-exports another slice's inner file",
		gate: "lint",
		files: {
			...slice("alpha"),
			...slice("beta", 'export { inner } from "../alpha/inner.ts";\n'),
		},
		says: reachesIn,
	},
	{
		name: "a slice imports another slice's inner file when it runs",
		gate: "lint",
		files: {
			...slice("alpha"),
			...slice("beta", 'export const beta = () => import("../alpha/inner.ts");\n'),
		},
		says: reachesIn,
	},
	{
		name: "a slice imports another slice's folder (its index file)",
		gate: "lint",
		files: {
			...slice("alpha"),
			"src/alpha/index.ts": 'export { alpha } from "./alpha.ts";\n',
			...slice("beta", 'import { alpha } from "../alpha";\n\nexport const beta = alpha;\n'),
		},
		says: reachesIn,
	},
	{
		name: "src/main.ts imports a slice's inner file",
		gate: "lint",
		files: {
			...slice("alpha"),
			"src/main.ts":
				'import { inner } from "./alpha/inner.ts";\n\ndocument.title = String(inner);\n',
		},
		says: reachesIn,
	},
	{
		name: "a slice imports another slice's feature file",
		gate: "lint",
		files: {
			...slice("alpha"),
			...slice(
				"beta",
				'import { alpha } from "../alpha/alpha.ts";\n\nexport const beta = alpha;\n',
			),
		},
	},
	{
		name: "a slice imports its own inner file",
		gate: "lint",
		files: slice("alpha", 'import { inner } from "./inner.ts";\n\nexport const alpha = inner;\n'),
	},
	{
		name: "src/main.ts imports a slice's feature file",
		gate: "lint",
		files: {
			...slice("alpha"),
			"src/main.ts":
				'import { alpha } from "./alpha/alpha.ts";\n\ndocument.title = String(alpha);\n',
		},
	},
	// No mocks (T-030), lint.
	...refused.map((name): Case => ({
		name: `a test calls vi.${name}`,
		gate: "lint",
		files: test(`it("reaches vi.${name}", () => {\n\texpect(vi.${name}).toBeDefined();\n});`),
		says: `${mocks}: vi.${name} `,
	})),
	{
		name: "a test renames vi on import",
		gate: "lint",
		files: test(
			'it("mocks", () => {\n\texpect(v.fn()).toBeDefined();\n});',
			'import { expect, it, vi as v } from "vite-plus/test";',
		),
		says: `${mocks}: vi.fn `,
	},
	{
		name: "a test destructures vi",
		gate: "lint",
		files: test(
			'const { spyOn } = vi;\n\nit("spies", () => {\n\texpect(spyOn).toBeDefined();\n});',
		),
		says: `${mocks}: vi.spyOn `,
	},
	{
		name: "a test destructures vi, renaming",
		gate: "lint",
		files: test(
			'const { stubGlobal: stub } = vi;\n\nit("stubs", () => {\n\texpect(stub).toBeDefined();\n});',
		),
		says: `${mocks}: vi.stubGlobal `,
	},
	{
		name: "a test reaches vi through an alias",
		gate: "lint",
		files: test('const v = vi;\n\nit("mocks", () => {\n\texpect(v.fn()).toBeDefined();\n});'),
		says: `${mocks}: vi.fn `,
	},
	{
		name: "a test reaches vi by a member's name in brackets",
		gate: "lint",
		files: test('it("mocks", () => {\n\texpect(vi["fn"]()).toBeDefined();\n});'),
		says: `${mocks}: vi.fn `,
	},
	{
		name: "a test reaches vi through the module's namespace",
		gate: "lint",
		files: test(
			'it("mocks", () => {\n\texpect(runner.vi.fn()).toBeDefined();\n});',
			'import * as runner from "vite-plus/test";\nimport { expect, it } from "vite-plus/test";',
		),
		says: `${mocks}: vi.fn `,
	},
	{
		name: "a test destructures vi from the module's namespace",
		gate: "lint",
		files: test(
			'const {\n\tvi: { spyOn },\n} = runner;\n\nit("spies", () => {\n\texpect(spyOn).toBeDefined();\n});',
			'import * as runner from "vite-plus/test";\nimport { expect, it } from "vite-plus/test";',
		),
		says: `${mocks}: vi.spyOn `,
	},
	{
		name: "a test imports vi when it runs",
		gate: "lint",
		files: test(
			'it("mocks", async () => {\n\tconst { vi } = await import("vite-plus/test");\n\tvi.doMock("./alpha.ts");\n\texpect(vi).toBeDefined();\n});',
			'import { expect, it } from "vite-plus/test";',
		),
		says: `${mocks}: vi.doMock `,
	},
	{
		name: "a test imports vi from vitest",
		gate: "lint",
		files: test(
			'it("mocks", () => {\n\texpect(vi.fn()).toBeDefined();\n});',
			'import { expect, it, vi } from "vitest";',
		),
		says: `${mocks}: vi.fn `,
	},
	{
		name: "a test reaches vi as a global",
		gate: "lint",
		files: test(
			'it("mocks", () => {\n\texpect(vi.fn()).toBeDefined();\n});',
			'import { expect, it } from "vite-plus/test";',
		),
		says: `${mocks}: vi.fn `,
	},
	{
		name: "a test hands vi on",
		gate: "lint",
		files: test(
			'const take = (runner: unknown) => runner;\n\nit("hands vi on", () => {\n\texpect(take(vi)).toBeDefined();\n});',
		),
		says: `${mocks}: vi is handed on`,
	},
	{
		name: "a test calls a member of vi the rule does not know",
		gate: "lint",
		files: test(
			'it("reaches a new member", () => {\n\texpect((vi as unknown as { mockAll?: () => void }).mockAll).toBeUndefined();\n});',
		),
		says: `${mocks}: vi.mockAll is none of`,
	},
	{
		name: "a helper beside the tests spies",
		gate: "lint",
		files: {
			"tools/spy.ts":
				'import { vi } from "vite-plus/test";\n\nexport const spy = (o: { f(): void }) => vi.spyOn(o, "f");\n',
		},
		says: `${mocks}: vi.spyOn `,
	},
	{
		name: "a test drives the clock and waits",
		gate: "lint",
		files: test(
			[
				'it("drives the clock", async () => {',
				"\tvi.useFakeTimers();",
				"\texpect(vi.isFakeTimers()).toBe(true);",
				'\tvi.setSystemTime(new Date("2026-01-01T00:00:00Z"));',
				"\texpect(vi.getMockedSystemTime()).not.toBeNull();",
				"\texpect(vi.getRealSystemTime()).toBeGreaterThan(0);",
				"\tlet ticks = 0;",
				"\tsetInterval(() => ticks++, 10);",
				"\tvi.advanceTimersByTime(10);",
				"\tawait vi.advanceTimersByTimeAsync(10);",
				"\tvi.advanceTimersToNextTimer();",
				"\tawait vi.advanceTimersToNextTimerAsync();",
				"\tvi.advanceTimersToNextFrame();",
				"\tvi.runOnlyPendingTimers();",
				"\tawait vi.runOnlyPendingTimersAsync();",
				"\tvi.runAllTicks();",
				"\texpect(vi.getTimerCount()).toBe(1);",
				"\tvi.clearAllTimers();",
				"\tvi.runAllTimers();",
				"\tawait vi.runAllTimersAsync();",
				'\tvi.setTimerTickMode("manual");',
				"\tvi.useRealTimers();",
				"\tawait vi.waitFor(() => expect(ticks).toBeGreaterThan(0));",
				"\tawait vi.waitUntil(() => ticks > 0);",
				"\tawait vi.dynamicImportSettled();",
				"\tvi.resetModules();",
				"\tvi.setConfig({ testTimeout: 1000 });",
				"\tvi.resetConfig();",
				"\texpect(vi.defineHelper(() => ticks)()).toBeGreaterThan(0);",
				"});",
			].join("\n"),
		),
	},
	{
		name: "a test hands in a fake at the edge",
		gate: "lint",
		files: {
			"src/alpha/alpha.ts":
				"export const stamp = (now: () => Date) => now().toISOString().slice(0, 10);\n",
			"src/alpha/alpha.test.ts":
				'import { expect, it } from "vite-plus/test";\nimport { stamp } from "./alpha.ts";\n\nit("stamps the day", () => {\n\texpect(stamp(() => new Date("2026-01-01T12:00:00Z"))).toBe("2026-01-01");\n});\n',
		},
	},
	{
		name: "a test vite.config.ts names in mockBoundaries mocks",
		gate: "lint",
		files: {
			...test('it("mocks", () => {\n\texpect(vi.fn()).toBeDefined();\n});'),
			"vite.config.ts": allowing("src/alpha/alpha.test.ts"),
		},
	},
	{
		name: "a test mockBoundaries does not name mocks, beside one it does",
		gate: "lint",
		files: {
			...test('it("mocks", () => {\n\texpect(vi.fn()).toBeDefined();\n});'),
			"src/alpha/other.test.ts":
				'import { expect, it, vi } from "vite-plus/test";\n\nit("spies", () => {\n\texpect(vi.spyOn).toBeDefined();\n});\n',
			"vite.config.ts": allowing("src/alpha/alpha.test.ts"),
		},
		says: `${mocks}: vi.spyOn `,
	},
	// What src/ holds (T-029), the static check.
	{
		name: "a module directly under src/",
		gate: "static",
		files: { "src/foo.ts": "export const foo = 1;\n" },
		says: "src/foo.ts is outside a slice",
	},
	{
		name: "a file lint never reads, directly under src/",
		gate: "static",
		files: { "src/style.css": "h1 { color: teal; }\n" },
		says: "src/style.css is outside a slice",
	},
	{
		name: "src/main.ts beside a new slice folder",
		gate: "static",
		files: slice("alpha"),
	},
	{
		name: "a module directly under src/, at commit",
		gate: "pre-commit",
		files: { "src/foo.ts": "export const foo = 1;\n" },
		says: "src/foo.ts is outside a slice",
	},
	// Unit tests beside the code they test (T-031), the static check.
	{
		name: "a test beside its file in a slice, and beside an inner file",
		gate: "static",
		files: {
			...slice("alpha"),
			"src/alpha/alpha.test.ts": unitTest,
			"src/alpha/inner.test.ts": unitTest,
		},
	},
	{
		name: "a test beside its script in tools/, at any depth",
		gate: "static",
		files: {
			"tools/thing.ts": "export const thing = 1;\n",
			"tools/thing.test.ts": unitTest,
			"tools/deep/thing.ts": "export const thing = 1;\n",
			"tools/deep/thing.test.ts": unitTest,
		},
	},
	{
		name: "a test with no file beside it, in a slice",
		gate: "static",
		files: { ...slice("alpha"), "src/alpha/beta.test.ts": unitTest },
		says: `${beside}: src/alpha/beta.test.ts has no beta.ts beside it`,
	},
	{
		name: "a test with no file beside it, in tools/",
		gate: "static",
		files: { "tools/thing.test.ts": unitTest },
		says: `${beside}: tools/thing.test.ts has no thing.ts beside it`,
	},
	{
		name: "a test whose file is in another folder",
		gate: "static",
		files: { ...slice("alpha"), "src/beta/alpha.test.ts": unitTest },
		says: `${beside}: src/beta/alpha.test.ts has no alpha.ts beside it`,
	},
	{
		name: "a test directly in src/, beside src/main.ts",
		gate: "static",
		files: { "src/main.test.ts": unitTest },
		says: `${beside}: src/main.test.ts is neither in a slice under src/ nor in tools/`,
	},
	{
		name: "a test at the root, beside its file",
		gate: "static",
		files: { "thing.ts": "export const thing = 1;\n", "thing.test.ts": unitTest },
		says: `${beside}: thing.test.ts is neither in a slice under src/ nor in tools/`,
	},
	{
		name: "a unit test under e2e/, beside its file",
		gate: "static",
		files: { "e2e/support/app.test.ts": unitTest },
		says: `${beside}: e2e/support/app.test.ts is a unit test under e2e/`,
	},
	...["__tests__", "test", "tests"].map((folder): Case => ({
		name: `a test in a ${folder}/ folder of its slice`,
		gate: "static",
		files: { ...slice("alpha"), [`src/alpha/${folder}/alpha.test.ts`]: unitTest },
		says: `${beside}: src/alpha/${folder}/alpha.test.ts is in a ${folder}/ folder`,
	})),
	{
		name: "a helper in a tests/ folder of tools/",
		gate: "static",
		files: { "tools/tests/helper.ts": "export const helper = 1;\n" },
		says: `${beside}: tools/tests/helper.ts is in a tests/ folder`,
	},
	...spellings.map((spelling): Case => ({
		name: `a test spelled *.${spelling}, beside its file`,
		gate: "static",
		files: { ...slice("alpha"), [`src/alpha/alpha.${spelling}`]: unitTest },
		says: `${beside}: src/alpha/alpha.${spelling} is spelled *.${spelling}`,
	})),
	{
		name: "a test beside its file in a slice, at commit",
		gate: "pre-commit",
		files: {
			"src/greeting/shout.ts":
				"export const shout = (text: string): string => `${text.toUpperCase()}!`;\n",
			"src/greeting/shout.test.ts":
				'import { expect, it } from "vite-plus/test";\nimport { shout } from "./shout.ts";\n\nit("shouts", () => {\n\texpect(shout("hi")).toBe("HI!");\n});\n',
		},
	},
	{
		name: "a test with no file beside it, at commit",
		gate: "pre-commit",
		files: { "src/greeting/farewell.test.ts": unitTest },
		says: `${beside}: src/greeting/farewell.test.ts has no farewell.ts beside it`,
	},
	{
		name: "a test in a __tests__/ folder, at commit",
		gate: "pre-commit",
		files: { "src/greeting/__tests__/greeting.test.ts": unitTest },
		says: `${beside}: src/greeting/__tests__/greeting.test.ts is in a __tests__/ folder`,
	},
	{
		name: "a test spelled *.spec.ts, at commit",
		gate: "pre-commit",
		files: { "src/greeting/greeting.spec.ts": unitTest },
		says: `${beside}: src/greeting/greeting.spec.ts is spelled *.spec.ts`,
	},
];

const root = resolve(".");
const scratch = mkdtempSync(join(tmpdir(), "code-design-selftest-"));
const env = Object.assign(cleanEnv(), {
	GIT_AUTHOR_NAME: "code design self-test",
	GIT_AUTHOR_EMAIL: "selftest@localhost",
	GIT_COMMITTER_NAME: "code design self-test",
	GIT_COMMITTER_EMAIL: "selftest@localhost",
});
const git = gitIn(env, scratch);
const run = (command: string) => sh(command, { cwd: scratch, env });

// How each gate judges a case's files, once they are written and staged.
// Lint's output format is pinned: left to itself, oxlint picks one by where it
// runs (GitHub's annotations on a runner, a terse one under an agent), and
// only some of them print the rule's name beside its message.
const gates: Record<Gate, (files: string[]) => Run> = {
	lint: (files) =>
		run(`vp lint --format default ${files.filter((f) => f.endsWith(".ts")).join(" ")}`),
	static: () => run("node tools/code-design.ts"),
	"pre-commit": () => run("sh .vite-hooks/pre-commit"),
};

const problems: string[] = [];
const lines: string[] = [];
try {
	worktreeOfCurrentTree(root, scratch, env);
	git("add -A");
	const base = git(`commit-tree ${git("write-tree")} -p HEAD -m "code design self-test base"`);
	git(`reset -q --hard ${base}`);

	// CI runs both gates on every push, whatever the commits name.
	const steps = plan(["--whole"], scratch).steps;
	for (const step of ["vp check", "node tools/code-design.ts"])
		if (!steps.includes(step)) problems.push(`CI no longer runs \`${step}\` on every push`);

	for (const c of cases) {
		git(`reset -q --hard ${base}`);
		git("clean -fdq -- src tools e2e");
		for (const [file, text] of Object.entries(c.files)) {
			mkdirSync(dirname(join(scratch, file)), { recursive: true });
			writeFileSync(join(scratch, file), text);
		}
		git("add -A");
		const result = gates[c.gate](Object.keys(c.files));
		const refused = result.status !== 0;
		const ok = c.says ? refused && result.output.includes(c.says) : !refused;
		lines.push(
			`${ok ? "ok  " : "FAIL"} ${c.gate.padEnd(10)} ${c.says ? "refuses" : "allows "} ${c.name}`,
		);
		if (!ok)
			problems.push(
				c.says
					? `${c.gate} should refuse ${c.name}, saying ${JSON.stringify(c.says)}:\n${result.output}`
					: `${c.gate} should allow ${c.name}:\n${result.output}`,
			);
	}
} finally {
	sh(`git worktree remove --force ${scratch}`, { cwd: root, env });
	rmSync(scratch, { recursive: true, force: true });
}

console.log(lines.join("\n"));
for (const problem of problems) console.error(`\nFAIL ${problem}`);
console.log(
	problems.length
		? `\n${problems.length} code design check(s) failed`
		: `\nThe code design gates refuse and allow what they should (${cases.length} cases)`,
);
process.exit(problems.length ? 1 : 0);
