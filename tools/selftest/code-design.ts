// The code design gates refuse what AGENTS.md's "Code design" forbids and let
// through what it allows. Run in a scratch worktree of the current tree
// (uncommitted edits included), so nothing here touches the checkout. Each
// rule's cases are a file of code-design/, which says what they prove:
//
//   - lint (tools/lint/code-design.ts, which vite.config.ts loads and
//     `vp check` runs) refuses a slice, or src/main.ts, reaching another
//     slice's inner file (slice-boundary.ts), and any of vitest's mocks,
//     spies and stubs however `vi` is reached, the clock and a file
//     mockBoundaries names aside (no-mocks.ts);
//   - the static check (tools/code-design.ts) refuses a file directly under
//     src/ but main.ts (slice-folders.ts), and a unit test anywhere but
//     beside the file it tests, or spelled any other way vitest would run
//     (tests-beside-code.ts);
//   - the pre-commit hook runs that check, and CI runs both gates as steps.
//
// A case is the files it writes over the base tree, the gate that judges
// them, and whether the gate must refuse them, naming what
// (code-design/case.ts): a refusal counts only when it names the rule. The
// next code design rule adds a file of cases and joins `cases` below; a gate
// that is new adds itself to `gates`.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { cleanEnv, gitIn, plan, sh, worktreeOfCurrentTree, type Run } from "./cli.ts";
import type { Case, Gate } from "./code-design/case.ts";
import { cases as noMocks } from "./code-design/no-mocks.ts";
import { cases as sliceBoundary } from "./code-design/slice-boundary.ts";
import { cases as sliceFolders } from "./code-design/slice-folders.ts";
import { cases as testsBesideCode } from "./code-design/tests-beside-code.ts";

const cases: Case[] = [...sliceBoundary, ...noMocks, ...sliceFolders, ...testsBesideCode];

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
