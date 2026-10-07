// The local gates run only what a change affects, and CI still catches what
// they leave out. Run against the real hooks in a scratch worktree of the
// current tree (uncommitted edits included), so nothing here touches the
// checkout it was started from:
//
//   - pre-commit runs exactly the unit tests a change reaches, by import or by
//     vite.config.ts's forceRerunTriggers, and fails on a change that breaks one;
//   - pre-push does the same against the remote commit it builds on, fails on
//     that broken change, and passes a prose-only push; it verifies the
//     pushed commits first, so each one here is a commit the rules pass;
//   - pre-commit runs no unit test and no audit for a commit of only docs/,
//     tasks/, Markdown and feature files;
//   - pre-push runs neither the scenarios a commit's `Scenarios:` footer names
//     nor the checks of the tasks its `Task:` footer names; CI reads those
//     footers from the pushed range and runs them;
//   - the commit-msg hook, `itos hook commit-msg` (declared in the clone's
//     git config by `itos hook install`, so run here as that command), rejects a commit whose type may not touch a staged path, a scenario
//     renamed outside feat and fix, a header commitlint rejects, a footer
//     itos's footer rules reject (each problem reported once, and beside a
//     header problem rather than hidden by it), and itos's own data broken as
//     it is staged: a ledger with a duplicate task ID (even
//     when the working tree's copy has been fixed, since the hook reads the
//     index) and a registry item waiting on one that does not exist; and it
//     lets a sound commit through;
//   - what the hooks leave out fails CI's own steps: a refactor that breaks
//     every scenario passes both hooks and fails the push's E2E step, and a
//     coverage threshold the tree misses passes pre-commit and fails
//     `vp run test:coverage`.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { e2eStep, plan, worktreeOfCurrentTree } from "./cli.ts";

const root = resolve(".");
const scratch = mkdtempSync(join(tmpdir(), "gates-selftest-"));
// Hooks export GIT_DIR and friends; the scratch tree must use its own.
const env = Object.fromEntries(
	Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_") && k !== "CI"),
) as NodeJS.ProcessEnv;
Object.assign(env, {
	GIT_AUTHOR_NAME: "gates self-test",
	GIT_AUTHOR_EMAIL: "selftest@localhost",
	GIT_COMMITTER_NAME: "gates self-test",
	GIT_COMMITTER_EMAIL: "selftest@localhost",
	// A port of its own, in case a suite is running in the checkout.
	E2E_PORT: "5284",
});

interface Run {
	status: number;
	output: string;
	seconds: number;
}
function sh(command: string, input?: string, cwd = scratch): Run {
	const started = performance.now();
	const result = spawnSync("sh", ["-c", command], {
		cwd,
		env,
		input,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});
	return {
		status: result.status ?? 1,
		output: `${result.stdout}${result.stderr}`,
		seconds: (performance.now() - started) / 1000,
	};
}
const git = (command: string, cwd = scratch) => {
	const run = sh(`git ${command}`, undefined, cwd);
	if (run.status !== 0) throw new Error(`git ${command} failed:\n${run.output}`);
	return run.output.trim();
};

const edit = (file: string, from: string, to: string) => {
	const path = join(scratch, file);
	const text = readFileSync(path, "utf8");
	if (!text.includes(from)) throw new Error(`${file} no longer contains ${JSON.stringify(from)}`);
	writeFileSync(path, text.replace(from, to));
};
const commit = (message: string) => {
	git("add -A");
	const sha = git(`commit-tree ${git("write-tree")} -p HEAD -m "${message}"`);
	git(`reset -q --hard ${sha}`);
	return sha;
};

// How many unit test files a run executed (vitest's summary line; without a
// terminal it names only the files that failed), and the ones that failed.
const plain = (output: string) => output.replace(/\x1b\[[0-9;]*m/g, "");
const ranFiles = (output: string) => Number(/Test Files .*\((\d+)\)/.exec(plain(output))?.[1] ?? 0);
const failedFiles = (output: string) =>
	new Set(
		[...plain(output).matchAll(/FAIL\s+((?:src|tools)\/[\w./-]+\.test\.ts)/g)].map((m) => m[1]!),
	);
const allTests = sh("git ls-files '*.test.ts'", undefined, root).output.split("\n").filter(Boolean);

const problems: string[] = [];
const timings: string[] = [];
const expect = (ok: boolean, problem: string) => {
	if (!ok) problems.push(problem);
};
function gate(label: string, command: string, input?: string): Run {
	const run = sh(command, input);
	timings.push(
		`${label.padEnd(58)} ${run.status === 0 ? "pass" : "FAIL"}  ${run.seconds.toFixed(1)} s`,
	);
	return run;
}
const preCommit = (label: string) => {
	git("add -A");
	return gate(`pre-commit, ${label}`, "sh .vite-hooks/pre-commit");
};
// The pre-push hook, `itos hook pre-push`, as git calls it: the remote, its URL,
// and a line per pushed ref on stdin.
const prePush = (label: string, base: string, sha: string) =>
	gate(
		`pre-push, ${label}`,
		"itos hook pre-push upstream git@example.invalid:upstream.git",
		`refs/heads/main ${sha} refs/heads/main ${base}\n`,
	);
const messages = mkdtempSync(join(tmpdir(), "gates-selftest-msg-"));
// `stage: false` checks what is already staged, whatever the working tree holds.
const commitMsg = (label: string, message: string, stage = true) => {
	if (stage) git("add -A");
	const file = join(messages, "COMMIT_EDITMSG");
	writeFileSync(file, message);
	return gate(`commit-msg, ${label}`, `itos hook commit-msg ${file}`);
};
const show = (files: Set<string>) => [...files].join(", ") || "none";

let base = "";
try {
	// The scratch tree is the current tree: HEAD plus every tracked edit and the
	// untracked files a gate could run, committed as the base the pushes build on.
	worktreeOfCurrentTree(root, scratch, env);
	base = commit("gates self-test base");
	// The audit's "new" is measured against the base, as it is against the
	// upstream branch in the checkout.
	env.FALLOW_AUDIT_BASE = base;

	const steps = plan(["--whole"]).steps;
	for (const step of ["vp run e2e", "vp run test:coverage"])
		expect(steps.includes(step), `CI no longer runs \`${step}\`, which the hooks leave to it`);

	// 1. A change to a leaf module runs the tests that reach it and not the
	// whole suite, on both gates.
	const module = "src/greeting/greeting.ts";
	const moduleTest = "src/greeting/greeting.test.ts";
	edit(
		module,
		"export function greeting",
		"// gates self-test: a harmless change\nexport function greeting",
	);
	let run = preCommit("a harmless change to a module");
	expect(run.status === 0, `pre-commit failed on a harmless change:\n${run.output}`);
	const reached = (n: number) => n >= 1 && n < allTests.length;
	expect(
		reached(ranFiles(run.output)),
		`pre-commit should run only the test files that reach ${module}, ran ${ranFiles(run.output)} of ${allTests.length}`,
	);
	let sha = commit("refactor: touch the module\n\nTask: T-007");
	run = prePush("that change as a refactor", base, sha);
	expect(run.status === 0, `pre-push failed on a harmless refactor:\n${run.output}`);
	expect(
		reached(ranFiles(run.output)),
		`pre-push should run only the test files that reach ${module}, ran ${ranFiles(run.output)} of ${allTests.length}`,
	);
	expect(!run.output.includes("$ vp run e2e"), "pre-push still runs the E2E suite for a refactor");

	// 2. The negative proof: the same file, broken, fails both gates, and fails
	// in the module's test alone.
	git(`reset -q --hard ${base}`);
	edit(module, "`Hello, ", "`Hi, ");
	run = preCommit("a change that breaks the module's test");
	expect(run.status !== 0, `pre-commit passed a change that breaks ${moduleTest}`);
	expect(
		reached(ranFiles(run.output)) &&
			failedFiles(run.output).size === 1 &&
			failedFiles(run.output).has(moduleTest),
		`pre-commit should fail in ${moduleTest} alone, failed in ${show(failedFiles(run.output))}`,
	);
	sha = commit("refactor: break the module\n\nTask: T-007");
	run = prePush("that change as a refactor", base, sha);
	expect(run.status !== 0, `pre-push passed a change that breaks ${moduleTest}`);
	expect(failedFiles(run.output).has(moduleTest), `pre-push did not fail in ${moduleTest}`);

	// 3. What the tests read from disk counts as a change they depend on
	// (forceRerunTriggers: the task tool's config reruns the whole suite).
	git(`reset -q --hard ${base}`);
	edit("itos.yaml", "version: 1", "# gates self-test: a harmless change\nversion: 1");
	run = preCommit("a change to itos.yaml");
	expect(run.status === 0, `pre-commit failed on a comment in itos.yaml:\n${run.output}`);
	expect(
		ranFiles(run.output) === allTests.length,
		`a change to itos.yaml, which the tests read from disk, should rerun all ${allTests.length} test files; ran ${ranFiles(run.output)}`,
	);

	// 4. A push that touches only prose passes pre-push.
	git(`reset -q --hard ${base}`);
	edit("README.md", "# ", "A prose edit.\n\n# ");
	sha = commit("docs: edit the readme");
	run = prePush("a prose-only push", base, sha);
	expect(run.status === 0, `pre-push failed on a prose-only push:\n${run.output}`);

	// 5. A commit of only docs/ (any file, not just Markdown) and tasks/ (the
	// ledger and the registry) runs no unit test and no audit: no unit test
	// reads them, and itos checks its own data at commit-msg (below).
	git(`reset -q --hard ${base}`);
	writeFileSync(join(scratch, "docs/gates-selftest.json"), "{}\n");
	edit("tasks/work-items.yaml", "items:", "# gates self-test: a harmless change\nitems:");
	run = preCommit("docs/ and tasks/ only");
	expect(run.status === 0, `pre-commit failed on a commit of docs/ and tasks/:\n${run.output}`);
	expect(
		!/Test Files|fallow/i.test(plain(run.output)),
		`pre-commit ran the unit tests or the audit for docs/ and tasks/:\n${run.output}`,
	);

	// A commit that names a scenario and a task leaves both to CI...
	git(`reset -q --hard ${base}`);
	edit("README.md", "# ", "A footed edit.\n\n# ");
	sha = commit("chore: name a scenario and a task\n\nScenarios: @ID-APP-01\nTask: T-007");
	run = prePush("a push naming a scenario and a task", base, sha);
	expect(run.status === 0, `pre-push failed on a footed push:\n${run.output}`);
	expect(!run.output.includes("$ vp run e2e"), "pre-push ran the scenarios a footer names");
	expect(
		!/\$ (?:vp run |itos )task\b/.test(run.output),
		"pre-push ran the checks of a task a footer names",
	);
	// ...and CI finds the task in the pushed range.
	const named = plan([base, sha], scratch).tasks;
	expect(
		named.includes("T-007"),
		`CI did not find T-007 in the pushed range: ${named.join(", ") || "none"}`,
	);

	// The commit-msg hook, as git config runs it. A docs commit may not touch src/;
	// a test commit may not rename a live scenario; commitlint rejects a header
	// without a type; itos's footer rules reject a missing footer and an
	// unknown task, once each, the second beside commitlint's report; a docs
	// commit with its footer passes.
	git(`reset -q --hard ${base}`);
	edit(
		module,
		"export function greeting",
		"// gates self-test: a docs commit\nexport function greeting",
	);
	run = commitMsg("a docs commit touching src/", "docs: touch the module\n\nTask: T-007\n");
	expect(
		run.status === 1 && run.output.includes(`docs commits may not touch ${module}`),
		`commit-msg did not reject a docs commit touching ${module}:\n${run.output}`,
	);
	git(`reset -q --hard ${base}`);
	edit(
		"features/app.feature",
		"Scenario: The page opens and greets the visitor by name",
		"Scenario: The page opens, renamed",
	);
	run = commitMsg("a test commit renaming a scenario", "test: rename a scenario\n\nTask: T-007\n");
	expect(
		run.status === 1 && run.output.includes("  - a test commit "),
		`commit-msg did not reject a test commit renaming a live scenario:\n${run.output}`,
	);
	git(`reset -q --hard ${base}`);
	edit("README.md", "# ", "A message check.\n\n# ");
	run = commitMsg("a header without a type", "update things\n");
	expect(
		run.status !== 0 && run.output.includes("[type-empty]"),
		`commit-msg did not pass the header to commitlint:\n${run.output}`,
	);
	const times = (text: string, part: string) => text.split(part).length - 1;
	run = commitMsg("a chore commit without its footer", "chore: edit the readme\n");
	expect(
		run.status === 1 && times(run.output, "[task-footer]") === 1,
		`commit-msg did not reject a missing Task: footer once:\n${run.output}`,
	);
	run = commitMsg(
		"a header without a type, naming an unknown task",
		"update things\n\nTask: T-000\n",
	);
	expect(
		run.status !== 0 &&
			run.output.includes("[type-empty]") &&
			times(run.output, "[task-footer]") === 1 &&
			run.output.includes("T-000"),
		`commit-msg did not report the header and the unknown task, the task once:\n${run.output}`,
	);
	run = commitMsg("a sound docs commit", "docs: edit the readme\n\nTask: T-007\n");
	expect(run.status === 0, `commit-msg rejected a sound docs commit:\n${run.output}`);

	// What itos reads and no unit test does, checked from the index. A staged
	// ledger with a duplicate task ID is rejected...
	git(`reset -q --hard ${base}`);
	const duplicate = "- id: T-001\n  type: build\n  title: A duplicate\n  done_when: []\n\n";
	edit("tasks/phase-0.yaml", "- id: T-002", `${duplicate}- id: T-002`);
	const ledgerMessage = "docs: duplicate a task\n\nTask: T-007\n";
	run = commitMsg("a staged ledger with a duplicate task ID", ledgerMessage);
	expect(
		run.status === 1 && run.output.includes("T-001"),
		`commit-msg passed a staged ledger with a duplicate task ID:\n${run.output}`,
	);
	// ...still when the working tree's copy has been fixed and not staged...
	edit("tasks/phase-0.yaml", duplicate, "");
	run = commitMsg("the same ledger, fixed only in the working tree", ledgerMessage, false);
	expect(
		run.status === 1 && run.output.includes("T-001"),
		`commit-msg read the working tree, not the staged ledger:\n${run.output}`,
	);
	// ...and so is a staged registry item that waits on one that does not exist.
	git(`reset -q --hard ${base}`);
	edit(
		"tasks/work-items.yaml",
		"items:",
		"items:\n  - id: p0-gates-selftest\n    title: Waits on nothing that exists\n    phase: 0\n    owner: null\n    status: todo\n    depends_on: [p0-nowhere]\n    kind: idea\n",
	);
	run = commitMsg(
		"a staged registry item waiting on an unknown one",
		"docs: add an item\n\nTask: T-007\n",
	);
	expect(
		run.status === 1 && run.output.includes("p0-nowhere"),
		`commit-msg passed a staged registry item waiting on an unknown one:\n${run.output}`,
	);

	// 6. What the hooks leave out, CI's steps catch. A refactor that changes the
	// page's heading, which every scenario reads, passes both hooks...
	git(`reset -q --hard ${base}`);
	edit("src/main.ts", '"h1"', '"h2"');
	run = preCommit("a refactor that breaks every scenario");
	expect(run.status === 0, `pre-commit should not see a broken scenario:\n${run.output}`);
	sha = commit("refactor: change the heading\n\nTask: T-007");
	run = prePush("that refactor", base, sha);
	expect(run.status === 0, `pre-push should leave the scenarios to CI:\n${run.output}`);
	// ...and fails a push's E2E step, the smoke set among it.
	const step = e2eStep(plan([base, sha], scratch)) ?? "";
	expect(step.startsWith("vp run e2e --grep"), `a push's E2E step is not a selection: ${step}`);
	run = gate("CI's E2E step for a push, same refactor", step);
	expect(run.status !== 0, "a push's E2E step passed a refactor that breaks every scenario");

	// A coverage threshold the tree misses passes pre-commit (a partial run
	// holds no threshold) and fails CI's coverage step.
	git(`reset -q --hard ${base}`);
	edit(
		module,
		"const who = name?.trim();",
		'const who = name?.trim();\n\tif (who === "gates self-test") return who;',
	);
	run = preCommit("a branch no test covers");
	expect(run.status === 0, `pre-commit should leave the thresholds to CI:\n${run.output}`);
	run = gate("CI step `vp run test:coverage`, same branch", "vp run test:coverage");
	expect(run.status !== 0, "`vp run test:coverage` passed a tree that misses its thresholds");
} finally {
	sh(`git worktree remove --force ${scratch}`, undefined, root);
	rmSync(scratch, { recursive: true, force: true });
	rmSync(messages, { recursive: true, force: true });
}

console.log(timings.join("\n"));
for (const problem of problems) console.error(`FAIL ${problem}`);
console.log(
	problems.length
		? `\n${problems.length} gate check(s) failed`
		: `\nThe hooks run what a change affects (${allTests.length} unit test files in all); CI catches the rest`,
);
process.exit(problems.length ? 1 : 0);
