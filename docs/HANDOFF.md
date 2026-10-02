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

Last rewritten after phase 3 landed: no task is open, and what comes next
waits on the owner's decisions below.

## Where things stand

itos is pinned at **v0.5.0**, and phases 0 to 3 are done. Phase 3 brought in
what character-editor met on 2026-10-01:

- a task's checks prove this project, never itos (`tasks/README.md`);
- a rule over several states is written once and table-tested;
- a lint warning on a file over 400 lines of code;
- the ratchet (`code-design-ratchet.yaml`) for adopting a code design rule on
  code that breaks it;
- `code-design/no-browser`, which keeps the browser in the files
  `vite.config.ts`'s `browserEdges` names;
- itos 0.5.0's nightly step, which runs every done task's static checks.

What is left is ideas in the registry (`tools/bin/itos work`).

Read the newest CI run and the newest nightly on `main` before beginning
(`gh run list --workflow ci.yml --branch main --limit 1`, and the same for
`nightly.yml`); a red nightly takes priority over new work.

## Next

1. **The owner's decisions** (below), then specify what they choose as tasks
   and hand them out one agent at a time.
2. **The small ideas that need no decision**, specified as tasks:
   `p2-control-regex-warning`, `p3-disable-says-why` (its comment reader is
   in `tools/code-design.ts`), `p2-vuln-scan-negative-proof`,
   `p2-actionlint-binary-hash`, `p1-actionlint-at-commit`,
   `p2-no-mocks-other-libraries`.
3. **When itos ships them:** close `p1-scenario-moves-in-itos` when a
   release ships the moving rule; move the ratchet's joining rule out of the
   scenario kind when one runs a project's own range check
   (`p3-range-checks-outside-a-kind`); specify `p2-integration-tests` when
   one merges more than one kind of named test.

## User review

Not yet answered; each has a recommendation, first:

- **Renovate:** the owner keeps it (preferred to GitHub's own updates), but
  has no account yet and will look deeper first, so the app stays
  uninstalled. The owner will share repos where Renovate ran fully
  automated over GitHub Actions and releases (one moved everything off the
  Node 20 runners to Node 24 on its own). Study them against
  `.github/renovate.json5` when they come. The majors question waits for
  that: approval on the Dependency Dashboard, or merged on green CI as now.
  Decide it before the app is installed, since its first run brings
  TypeScript 7, vite-plus 1.0, vitest 5 and checkout/upload-artifact v7.
- **`p3-edge-out-of-coverage`:** leave `browserEdges` out of the unit
  coverage, as `src/main.ts` is, since the scenarios cover the edge and a
  unit test of it needs mocks. Today an infrastructure slice listed there
  fails the thresholds at 0%.
- **`p3-nightly-late-done-checks`:** run the done tasks' late checks
  nightly too, or only some. A late check of T-005 was red from T-031 to
  T-037 unseen. Every check costs a CI rerun (T-008) and a token (T-011).
- **zizmor in CI** as a new task, replacing T-025's grep checks with its
  `unpinned-uses` audit and adding its other workflow audits.
- **T-024's check**, and T-022's `grep check-message commitlint.config.ts`,
  rewritten as checks that run something, since `tasks/README.md` says a
  check never greps a config file.
- **The check-shape rule in itos** (`itos config check` refusing a check that
  greps a tracked file, unless marked): an idea here, or an issue on
  donvargax/itos.
- **The vulnerability scan on Renovate's branches** too, so a vulnerable
  update is caught before it lands.
- `p2-mutation-testing` waits on the owner's follow-up, and
  `p2-project-generator` on a discussion of starting projects fresh.
