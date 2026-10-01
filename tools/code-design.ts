// The code design rules lint cannot hold (AGENTS.md, "Code design"): rules
// about which files exist where, and lint sees only the files it lints. Run
// by the pre-commit hook and as a CI step, over the files git tracks or has
// staged, so the hook judges what the commit carries and CI the pushed tree;
// a file left untracked is nobody's commit yet. Prints each problem and exits
// 1 when there is one. A rule is a name and a function from the file list to
// its problems: the next one is added to `rules`.
//
//   - src/ holds no file outside a slice folder but src/main.ts, the
//     composition root. (A slice reaching into another is lint's:
//     tools/lint/code-design.ts.)
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

interface Rule {
	name: string;
	problems(files: string[]): string[];
}
const rules: Rule[] = [
	{
		name: "every file under src/ is in a slice, but src/main.ts",
		problems: (files) =>
			files
				.filter((file) => /^src\/[^/]+$/.test(file) && file !== "src/main.ts")
				.map(
					(file) =>
						`${file} is outside a slice: src/ holds only src/main.ts and one folder per feature (src/<slice>/<slice>.ts and its tests)`,
				),
	},
];

const listed = spawnSync("git", ["ls-files", "-z", "--", "src"], { cwd: root, encoding: "utf8" });
if (listed.status !== 0) {
	console.error(`code design: git ls-files failed:\n${listed.stderr}`);
	process.exit(2);
}
const files = listed.stdout.split("\0").filter(Boolean);
const problems = rules.flatMap((rule) => rule.problems(files));
for (const problem of problems) console.error(`code design: ${problem}`);
if (problems.length) process.exit(1);
console.log(`code design: ${rules.map((rule) => rule.name).join("; ")}`);
