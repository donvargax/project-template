// Unit tests beside the code they test (T-031), held by the static check
// (tests-beside-code in tools/code-design.ts), which the pre-commit hook
// runs: it refuses a unit test with no file beside it, one outside a slice
// and tools/ (directly in src/, at the root, under e2e/), any file in a
// folder of tests, and every other spelling vitest's default include would
// run, and allows <name>.test.ts beside <name>.ts in a slice or in tools/.
import { slice, type Case } from "./case.ts";

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

export const cases: Case[] = [
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
			"src/alpha/alpha.ts":
				"export const alpha = (text: string): string => `${text.toUpperCase()}!`;\n",
			"src/alpha/alpha.test.ts":
				'import { expect, it } from "vite-plus/test";\nimport { alpha } from "./alpha.ts";\n\nit("shouts", () => {\n\texpect(alpha("hi")).toBe("HI!");\n});\n',
		},
	},
	{
		name: "a test with no file beside it, at commit",
		gate: "pre-commit",
		files: { ...slice("alpha"), "src/alpha/beta.test.ts": unitTest },
		says: `${beside}: src/alpha/beta.test.ts has no beta.ts beside it`,
	},
	{
		name: "a test in a __tests__/ folder, at commit",
		gate: "pre-commit",
		files: { ...slice("alpha"), "src/alpha/__tests__/alpha.test.ts": unitTest },
		says: `${beside}: src/alpha/__tests__/alpha.test.ts is in a __tests__/ folder`,
	},
	{
		name: "a test spelled *.spec.ts, at commit",
		gate: "pre-commit",
		files: { ...slice("alpha"), "src/alpha/alpha.spec.ts": unitTest },
		says: `${beside}: src/alpha/alpha.spec.ts is spelled *.spec.ts`,
	},
];
