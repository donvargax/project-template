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

Last rewritten after T-021 landed: itos pinned at v0.2.0, its commit-msg hook
checking its own data from the index.

## Where things stand

Phases 0 and 1 are done (`docs/PHASES.md`). itos is pinned at **v0.2.0**
(README, "itos, pinned"); its commit-msg hook checks `itos.yaml`, the ledger,
the registry and the smoke set as staged, so the pre-commit hook no longer
does.

The template carries two things only until itos does them, each an idea in
the registry:

- the footer rules inside commitlint, which ask itos through a copy of the
  policy without the header lint (`commitlint.config.ts`,
  `p1-footer-rules-in-itos`);
- the scenario moving rule, `tools/scenario-moves.ts`
  (`p1-scenario-moves-in-itos`).

Read the newest CI run and the newest nightly on `main` before beginning
(`gh run list --workflow ci.yml --branch main --limit 1`, and the same for
`nightly.yml`); a red nightly takes priority over new work. The first nightly
after T-021 is the first to run the gates self-test's new commit-msg cases on
the runner: check it.

## Next

1. **Move to each new itos release by its notes' "Upgrading" section**, as
   T-021 did for v0.2.0: pin it as the README's "itos, pinned" says, make the
   changes the section lists, and land them under a task of their own, with
   `tools/bin/itos version --check` and `tools/bin/itos config check` among
   its checks. Write the task `todo` and let the agent take it
   (`docs/ORCHESTRATING.md`, "Lessons").
2. **Close the two ideas above** when a release covers them: its footer
   rules run beside the header lint, or it ships the moving rule as a
   built-in range check.
3. Continue with what `tools/bin/itos work` proposes. Ideas, deferred work and
   everything further out live only in `tasks/work-items.yaml`.

## User review

Nothing waits on the user's review.
