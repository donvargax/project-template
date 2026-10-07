// The prose shortcut must cover prose and nothing else. A path that reaches
// any gate — a task, a scenario, a config, a source file — must send the push
// down the full pipeline. This holds the project's own prose paths
// (itos.yaml's `ci.prose.paths`) to that, through `itos ci scope` over
// commits made with `git commit-tree` on top of HEAD, each touching the paths
// given (objects only: no branch moves, nothing in the working tree).
//
// What a prose-only range plans (the prose steps, the named tasks' static and
// `prose: true` checks, nothing late), what waits for a task not started, and
// that a range it cannot read is never prose are the tool's behaviour,
// whatever the config: itos's own repository proves them.
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanEnv, gitIn, sh, word } from "./cli.ts";

const scratch = mkdtempSync(join(tmpdir(), "ci-scope-selftest-"));
// A scratch index, so the checkout's own is never touched.
const env = {
	...cleanEnv(),
	GIT_INDEX_FILE: join(scratch, "index"),
	GIT_AUTHOR_NAME: "ci-scope self-test",
	GIT_AUTHOR_EMAIL: "selftest@localhost",
	GIT_COMMITTER_NAME: "ci-scope self-test",
	GIT_COMMITTER_EMAIL: "selftest@localhost",
};
const git = gitIn(env);

// A commit on top of HEAD that changes (or adds) each path.
function touching(paths: string[]): string {
	git("read-tree HEAD");
	const blob = git("hash-object -w --stdin <<'EOF'\nci-scope self-test\nEOF");
	for (const path of paths) git(`update-index --add --cacheinfo 100644,${blob},${word(path)}`);
	return git(`commit-tree ${git("write-tree")} -p HEAD -m 'docs: touch paths'`);
}
const docsOnly = (paths: string[]) => {
	const run = sh(`itos ci scope HEAD ${touching(paths)}`);
	assert.equal(run.status, 0, `itos ci scope failed:\n${run.output}`);
	return run.stdout.trim() === "docs_only=true";
};

try {
	assert.equal(docsOnly(["docs/HANDOFF.md", "AGENTS.md", "PLAN.md"]), true);
	assert.equal(docsOnly(["docs/decisions/format.md"]), true);
	// The work registry is routing: taking or closing an item is a prose push.
	assert.equal(docsOnly(["tasks/work-items.yaml", "README.md"]), true);

	assert.equal(docsOnly(["AGENTS.md", "src/greeting/greeting.ts"]), false);
	assert.equal(docsOnly(["tasks/phase-0.yaml"]), false);
	assert.equal(docsOnly(["tasks/work-items.yaml", "tasks/phase-0.yaml"]), false);
	assert.equal(docsOnly(["features/app.feature"]), false);
	assert.equal(docsOnly(["package.json"]), false);
	assert.equal(docsOnly([".github/workflows/ci.yml"]), false);
} finally {
	rmSync(scratch, { recursive: true, force: true });
}

console.log("ci scope: the project's prose paths hold prose and nothing else");
