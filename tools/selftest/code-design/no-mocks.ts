// No mocks (T-030), held by lint (code-design/no-mocks in
// tools/lint/code-design.ts): it refuses each of vitest's mocks, spies and
// stubs however `vi` is reached (renamed, destructured, through a namespace,
// a dynamic import, an alias or as a global), a member of `vi` it does not
// know, and `vi` handed on where it cannot follow, in a test or a helper
// under tools/; and it allows the clock's controls, the runner's helpers, a
// fake handed in at the edge, and a file vite.config.ts's mockBoundaries
// names (that one only).
import { readFileSync } from "node:fs";
import type { Case } from "./case.ts";

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

export const cases: Case[] = [
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
];
