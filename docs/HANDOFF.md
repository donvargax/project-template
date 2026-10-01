# Handoff

This file holds only what is ahead, for the next session to act on. It is
the coordinator's to rewrite at the end of each session, and kept short on
purpose: what was built, and why, is the history (`vp run changelog`), and
open work beyond the next few steps is `tasks/work-items.yaml`. A project
made from the template replaces it with its own first steps (README, "First
steps in the new project").

Read [AGENTS.md](../AGENTS.md), [PLAN.md](../PLAN.md),
[docs/ARCHITECTURE.md](ARCHITECTURE.md) and
[tasks/work-items.yaml](../tasks/work-items.yaml) before taking work; a
coordinator reads [docs/ORCHESTRATING.md](ORCHESTRATING.md) too.

Last rewritten after phase 1 landed: itos pinned as a release, the feature
files at the root, the work registry beside the ledger.

## Where things stand

Phases 0 and 1 are done (`docs/PHASES.md`). itos is pinned at **v0.1.0**:
`package.json` names the release tarball and the lockfile its integrity, and
`tools/bin/itos` runs it (README, "itos, pinned"). The scenarios are in
`features/`, their Playwright harness in `e2e/`; the registry is
`tasks/work-items.yaml`; a project GitHub makes from the template sets
`commits.since` in its first commit, and the setup checks name no path of
the demo.

The template carries three things only until itos does them, each an idea in
the registry:

- the pre-commit hook's `itos config check` (when `itos.yaml`, a ledger file
  or the smoke set is staged) and `itos work check` (when the registry is),
  which read the working tree (`p1-hook-checks-in-itos`);
- the footer rules inside commitlint, which ask itos through a copy of the
  policy without the header lint (`commitlint.config.ts`,
  `p1-footer-rules-in-itos`);
- the scenario moving rule, `tools/scenario-moves.ts`
  (`p1-scenario-moves-in-itos`).

Read the newest CI run and the newest nightly on `main` before beginning
(`gh run list --workflow ci.yml --branch main --limit 1`, and the same for
`nightly.yml`); a red nightly takes priority over new work.

## Next

1. **Move to each new itos release by its notes' "Upgrading" section.** Pin
   it as the README's "itos, pinned" says (the tarball checked against its
   `checksums.txt`, then its URL added), make the changes the section lists,
   and land them under a task of their own in the ledger, with
   `tools/bin/itos version --check` and `tools/bin/itos config check` among
   its checks.
2. **The next release** is expected to check the config, the ledger, the
   registry and the smoke set in itos's commit-msg hook, and to run the named
   tasks' static checks at commit. The pre-commit hook's copies of
   `config check` and `work check` then go (`p1-hook-checks-in-itos`), and
   the gates self-test's cases for them prove what the release's hook does
   instead. Close the other two ideas the same way when a release covers
   them.
3. Continue with what `tools/bin/itos work` proposes. Ideas, deferred work and
   everything further out live only in `tasks/work-items.yaml`.

## User review

Nothing waits on the user's review.
