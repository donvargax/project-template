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

Last rewritten after phase 2 was planned: itos v0.4.0 is the next step, then
phase 2's tasks.

## Where things stand

itos is pinned at **v0.2.0**; v0.3.0 and v0.4.0 are released, and T-022
moves straight to v0.4.0 (`tasks/phase-1.yaml`), so phase 1 is open until it
lands. Phase 2, the template's code design and supply chain, is specified
(`PLAN.md`, "Phase 2"; `tasks/phase-2.yaml`): every task `todo`, owned by
donvargax, waiting on T-022. Implementing sessions now document their work
before their last push, and the coordinator checks it (`AGENTS.md`,
"Finishing"; `docs/ORCHESTRATING.md`, "Checking a result").

Read the newest CI run and the newest nightly on `main` before beginning
(`gh run list --workflow ci.yml --branch main --limit 1`, and the same for
`nightly.yml`); a red nightly takes priority over new work.

## Next

1. **T-022, itos v0.4.0.** Hand it to one agent with the brief in
   `docs/ORCHESTRATING.md`, pointing it at both releases' notes
   (`gh release view v0.3.0 -R donvargax/itos`, and `v0.4.0`), "Upgrading"
   above all; its `why` says which steps apply. The agent takes it
   (`status: doing`) in its first `docs` commit. From v0.3.0 on, a commit
   naming a `done` task runs that task's static checks in the commit-msg
   hook, so expect slow ones to be marked `cost: late`.
2. **Phase 2, one agent at a time,** in the order `tools/bin/itos work`
   proposes: T-023, T-024, T-025 and T-027 are small and independent; T-026
   follows T-025; T-028, then T-029, then T-030 and T-031. The decisions they
   build to are in `PLAN.md`'s phase 2 and each task's `why`; don't let an
   agent re-decide them.
3. Close `p1-scenario-moves-in-itos` when an itos release ships the moving
   rule, and specify `p2-integration-tests` when one merges more than one
   kind of named test (itos's `p1-several-test-kinds`).

## User review

- **T-026 needs the Renovate app** installed on the repository before its
  updates arrive; the owner does it when the task lands.
- `p2-mutation-testing` waits on the owner's follow-up, and
  `p2-project-generator` on a discussion of starting projects fresh.
