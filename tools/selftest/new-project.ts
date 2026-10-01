// A project made from the template on GitHub is green after its first commit.
// GitHub creates it as one squashed root commit, "Initial commit", holding the
// template's tree, which no commit rule passes; the README's first steps set
// itos.yaml's `commits.since` to it in the project's first commit. In a
// scratch worktree of the current tree (uncommitted edits included), this
// makes that history and proves, through the real hooks and commands:
//
//   - verify rejects the history while commits.since is unset;
//   - the first commit the README describes passes the pre-commit and
//     commit-msg hooks (run as the scripts they are: a scratch worktree has no
//     hooks installed), which reject the same change under a header with no
//     type;
//   - then verify, the config check and the changelog (whole, and filtered by
//     the commit's task) pass.
import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { cleanEnv, gitIn, sh, worktreeOfCurrentTree } from "./cli.ts";

const root = resolve(".");
const scratch = mkdtempSync(join(tmpdir(), "new-project-selftest-"));
const messages = mkdtempSync(join(tmpdir(), "new-project-selftest-msg-"));
const message = join(messages, "COMMIT_EDITMSG");
const env: NodeJS.ProcessEnv = {
	...cleanEnv(),
	GIT_AUTHOR_NAME: "new-project self-test",
	GIT_AUTHOR_EMAIL: "selftest@localhost",
	GIT_COMMITTER_NAME: "new-project self-test",
	GIT_COMMITTER_EMAIL: "selftest@localhost",
};
const git = gitIn(env, scratch);
const run = (command: string) => sh(command, { env, cwd: scratch });

// The README's first step, as a project would write it.
const FIRST = `build: start verification after the template's initial commit

GitHub made this repository from the template as one squashed commit, which no commit rule
passes; commits.since names it, so verification and the changelog start after it.

Task: T-018
`;

try {
	worktreeOfCurrentTree(root, scratch, env);
	// GitHub's squashed commit: the template's tree, no parent, no type.
	git("add -A");
	const initial = git(`commit-tree ${git("write-tree")} -m 'Initial commit'`);
	git(`reset -q --hard ${initial}`);
	// The audit's "new" is measured against it.
	env.FALLOW_AUDIT_BASE = initial;

	let result = run('tools/bin/itos verify "" HEAD');
	assert.equal(result.status, 1, `verify passed the squashed commit:\n${result.output}`);

	// The first commit: commits.since names the squashed one, through the hooks.
	const policy = readFileSync(join(scratch, "itos.yaml"), "utf8");
	const at = /^ {2}reject_message: .*$/m;
	assert.ok(at.test(policy), "itos.yaml has no commits.reject_message to set since below");
	writeFileSync(
		join(scratch, "itos.yaml"),
		policy.replace(at, (line) => `${line}\n  since: "${initial}"`),
	);
	git("add itos.yaml");
	result = run("sh .vite-hooks/pre-commit");
	assert.equal(
		result.status,
		0,
		`pre-commit rejected the README's first commit:\n${result.output}`,
	);
	writeFileSync(message, "set commits.since\n");
	result = run(`sh .vite-hooks/commit-msg ${message}`);
	assert.notEqual(result.status, 0, `commit-msg passed a header with no type:\n${result.output}`);
	writeFileSync(message, FIRST);
	result = run(`sh .vite-hooks/commit-msg ${message}`);
	assert.equal(
		result.status,
		0,
		`commit-msg rejected the README's first commit:\n${result.output}`,
	);
	git(`reset -q --hard ${git(`commit-tree ${git("write-tree")} -p HEAD -F ${message}`)}`);

	for (const command of [
		'tools/bin/itos verify "" HEAD',
		"tools/bin/itos config check",
		"node tools/changelog.ts",
		"node tools/changelog.ts --task T-018",
	]) {
		result = run(command);
		assert.equal(
			result.status,
			0,
			`\`${command}\` failed after the first commit:\n${result.output}`,
		);
	}
	assert.ok(
		result.output.includes("Start verification after the template's initial commit"),
		`the changelog for T-018 leaves out the first commit:\n${result.output}`,
	);
} finally {
	sh(`git worktree remove --force ${scratch}`, { env, cwd: root });
	rmSync(scratch, { recursive: true, force: true });
	rmSync(messages, { recursive: true, force: true });
}

console.log(
	"new project: the squashed first commit fails verify until commits.since names it; then all pass",
);
