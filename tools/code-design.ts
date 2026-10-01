// The code design rules lint cannot hold (AGENTS.md, "Code design"): rules
// about which files exist where, and lint sees only the files it lints. Run
// by the pre-commit hook and as a CI step, over the files git tracks or has
// staged, so the hook judges what the commit carries and CI the pushed tree;
// a file left untracked is nobody's commit yet. Prints each problem, named
// `code-design(<rule>)` as lint names its own, and exits 1 when there is one.
// A rule is a name and a function from the file list to its problems: the
// next one is added to `rules`.
//
//   - slice-folders: src/ holds no file outside a slice folder but
//     src/main.ts, the composition root. (A slice reaching into another is
//     lint's: tools/lint/code-design.ts.)
//   - tests-beside-code: a unit test is <name>.test.ts beside the <name>.ts it
//     tests, in a slice under src/ or in tools/; a test file anywhere else,
//     spelled any other way vitest would run, or in a folder of tests, is
//     refused.
import { spawnSync } from "node:child_process";
import { basename, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

interface Rule {
	id: string;
	name: string;
	problems(files: string[]): string[];
}

// A test file by vitest's default `include`, **/*.{test,spec}.?(c|m)[jt]s?(x):
// every spelling vitest runs when nothing says otherwise. vite.config.ts's
// `test.include` runs only <name>.test.ts under src/ and tools/, so a file of
// any other spelling would sit there never running; it is refused instead.
const testFile = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
// A folder of tests, by the names other runners and layouts give one.
const testFolder = /(?:^|\/)(__tests__|tests?)\//;
const beside =
	"a unit test is <name>.test.ts beside the <name>.ts it tests, in a slice under src/ or in tools/";

const rules: Rule[] = [
	{
		id: "slice-folders",
		name: "every file under src/ is in a slice, but src/main.ts",
		problems: (files) =>
			files
				.filter((file) => /^src\/[^/]+$/.test(file) && file !== "src/main.ts")
				.map(
					(file) =>
						`${file} is outside a slice: src/ holds only src/main.ts and one folder per feature (src/<slice>/<slice>.ts and its tests)`,
				),
	},
	{
		id: "tests-beside-code",
		name: "every unit test is beside the file it tests",
		problems: (files) => {
			const tracked = new Set(files);
			return files.flatMap((file) => {
				const folder = testFolder.exec(file)?.[1];
				if (folder)
					return [`${file} is in a ${folder}/ folder: ${beside}, never in a folder of tests`];
				const spelling = testFile.exec(file)?.[0];
				if (!spelling) return [];
				if (spelling !== ".test.ts")
					return [`${file} is spelled *${spelling}, which vitest does not run here: ${beside}`];
				if (file.startsWith("e2e/"))
					return [`${file} is a unit test under e2e/, which holds the scenarios' steps: ${beside}`];
				if (!/^(?:src\/[^/]+|tools)\/./.test(file))
					return [`${file} is neither in a slice under src/ nor in tools/: ${beside}`];
				const tested = file.slice(0, -".test.ts".length) + ".ts";
				if (!tracked.has(tested))
					return [`${file} has no ${basename(tested)} beside it to test: ${beside}`];
				return [];
			});
		},
	},
];

const listed = spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" });
if (listed.status !== 0) {
	console.error(`code design: git ls-files failed:\n${listed.stderr}`);
	process.exit(2);
}
const files = listed.stdout.split("\0").filter(Boolean);
const problems = rules.flatMap((rule) =>
	rule.problems(files).map((problem) => `code-design(${rule.id}): ${problem}`),
);
for (const problem of problems) console.error(problem);
if (problems.length) process.exit(1);
console.log(`code design: ${rules.map((rule) => rule.name).join("; ")}`);
