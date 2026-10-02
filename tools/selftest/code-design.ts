// The code design gates refuse what AGENTS.md's "Code design" forbids, let
// through what it allows, and warn where it asks a reader to look. Run in a
// scratch worktree of the current tree (uncommitted edits included), so
// nothing here touches the checkout. Each rule's cases are a file of
// code-design/, which says what they prove:
//
//   - lint (tools/lint/code-design.ts, which vite.config.ts loads and
//     `vp check` runs) refuses a slice, or src/main.ts, reaching another
//     slice's inner file (slice-boundary.ts), and any of vitest's mocks,
//     spies and stubs however `vi` is reached, the clock and a file
//     mockBoundaries names aside (no-mocks.ts), and the browser's globals in
//     a slice's logic, its tests and its view files however they are
//     reached, a file browserEdges names, src/main.ts, a type, a shadowing
//     local, the clock and a file the ratchet lists aside (no-browser.ts);
//   - lint's size tripwire warns on a file over 400 lines of code, without
//     failing, and finds none in the template's own tree (max-lines.ts);
//   - the static check (tools/code-design.ts) refuses a file directly under
//     src/ but main.ts (slice-folders.ts), and a unit test anywhere but
//     beside the file it tests, or spelled any other way vitest would run
//     (tests-beside-code.ts);
//   - the ratchet (code-design-ratchet.yaml, held by the static check) lets a
//     listed file off its rule, lint's or the static check's, and no other;
//     refuses an entry whose item is missing or done, whose file is gone or
//     no longer breaks the rule, a list that leaves out a rule the gates
//     hold, and a comment that disables a code design rule or every rule;
//     and its joining rule, in the commit-msg hook and CI's commit re-check,
//     allows the files listed by the commit that brings a rule into force and
//     refuses one a later commit adds (ratchet.ts);
//   - the pre-commit hook runs that check, and CI runs both gates as steps.
//
// A case is the files it writes over the base tree, the gate that judges
// them, and what the gate must say, refusing or warning, or must not
// (code-design/case.ts): a refusal or a warning counts only when it names
// the rule. The next code design rule adds a file of cases and joins
// `cases` below; a gate that is new adds itself to `gates`.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { cleanEnv, gitIn, plan, sh, word, worktreeOfCurrentTree, type Run } from "./cli.ts";
import type { Case, Gate } from "./code-design/case.ts";
import { cases as maxLines } from "./code-design/max-lines.ts";
import { cases as noBrowser } from "./code-design/no-browser.ts";
import { cases as noMocks } from "./code-design/no-mocks.ts";
import { cases as ratchet } from "./code-design/ratchet.ts";
import { cases as sliceBoundary } from "./code-design/slice-boundary.ts";
import { cases as sliceFolders } from "./code-design/slice-folders.ts";
import { cases as testsBesideCode } from "./code-design/tests-beside-code.ts";

const cases: Case[] = [
	...sliceBoundary,
	...noMocks,
	...noBrowser,
	...maxLines,
	...sliceFolders,
	...testsBesideCode,
	...ratchet,
];

const root = resolve(".");
const scratch = mkdtempSync(join(tmpdir(), "code-design-selftest-"));
// A commit message, kept outside the worktree so no case stages it.
const message = join(mkdtempSync(join(tmpdir(), "code-design-selftest-message-")), "message");
writeFileSync(
	message,
	"build: list the files that break a code design rule\n\nThe code design self-test's commit.\n\nTask: T-035\n",
);
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
	// The case's TypeScript files (a view's .tsx among them), or, when it
	// writes none, the whole tree.
	lint: (files) =>
		run(`vp lint --format default ${files.filter((f) => /\.tsx?$/.test(f)).join(" ")}`),
	static: () => run("node tools/code-design.ts"),
	"pre-commit": () => run("sh .vite-hooks/pre-commit"),
	"commit-msg": () => run(`tools/bin/itos hook commit-msg ${word(message)}`),
	verify: () => {
		commit(["-F", message]);
		return run("tools/bin/itos verify HEAD~1 HEAD");
	},
};

// The staged tree as a commit on HEAD, or as the root of a history of its
// own, checked out; no hook runs.
function commit(args: string[], orphan = false) {
	const parent = orphan ? "" : "-p HEAD";
	const sha = git(`commit-tree ${git("write-tree")} ${parent} ${args.map(word).join(" ")}`);
	git(`reset -q --hard ${sha}`);
}

// Files written over the tree, and staged.
function write(files: Record<string, string>) {
	for (const [file, text] of Object.entries(files)) {
		mkdirSync(dirname(join(scratch, file)), { recursive: true });
		writeFileSync(join(scratch, file), text);
	}
	git("add -A");
}

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
		(c.history ?? []).forEach((files, i) => {
			write(files);
			commit(["-m", "chore: the case's history"], c.fresh && i === 0);
		});
		write(c.files);
		const result = gates[c.gate](Object.keys(c.files));
		const refuses = c.says !== undefined && !c.warns;
		const verdict = refuses ? "refuses" : c.warns ? "warns" : "allows";
		const ok =
			(result.status !== 0) === refuses &&
			(c.says === undefined || result.output.includes(c.says)) &&
			(c.never === undefined || !result.output.includes(c.never));
		lines.push(`${ok ? "ok  " : "FAIL"} ${c.gate.padEnd(10)} ${verdict.padEnd(7)} ${c.name}`);
		if (!ok) {
			const saying = c.says === undefined ? "" : `, saying ${JSON.stringify(c.says)}`;
			const never = c.never === undefined ? "" : `, never saying ${JSON.stringify(c.never)}`;
			const verb = refuses ? "refuse" : c.warns ? "let through, warning on," : "allow";
			problems.push(`${c.gate} should ${verb} ${c.name}${saying}${never}:\n${result.output}`);
		}
	}
} finally {
	sh(`git worktree remove --force ${scratch}`, { cwd: root, env });
	rmSync(scratch, { recursive: true, force: true });
	rmSync(dirname(message), { recursive: true, force: true });
}

console.log(lines.join("\n"));
for (const problem of problems) console.error(`\nFAIL ${problem}`);
console.log(
	problems.length
		? `\n${problems.length} code design check(s) failed`
		: `\nThe code design gates refuse, warn and allow as they should (${cases.length} cases)`,
);
process.exit(problems.length ? 1 : 0);
