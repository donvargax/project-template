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

Last rewritten after phase 2 landed: no task is open, and what comes next
waits on the owner's decisions below.

## Where things stand

itos is pinned at **v0.4.0**, and phases 0 to 2 are done: the Node version,
stricter TypeScript, the actions pinned to commits, Renovate configured
(`.github/renovate.json5`), a nightly vulnerability scan (`tools/bin/vuln-scan`),
and the code design rules in `AGENTS.md` held by the project's lint plugin
(`tools/lint/code-design.ts`) and static check (`tools/code-design.ts`), proven
by `tools/selftest/code-design.ts`, which the nightly now runs. What is left
is ideas in the registry (`tools/bin/itos work`).

Read the newest CI run and the newest nightly on `main` before beginning
(`gh run list --workflow ci.yml --branch main --limit 1`, and the same for
`nightly.yml`); a red nightly takes priority over new work.

## Next

1. **The owner's decisions** (below), then specify what they choose as tasks
   and hand them out one agent at a time.
2. **The small ideas that need no decision**, specified as tasks:
   `p2-control-regex-warning`, `p2-vuln-scan-negative-proof`,
   `p2-actionlint-binary-hash`, `p1-actionlint-at-commit`,
   `p2-no-mocks-other-libraries`.
3. Close `p1-scenario-moves-in-itos` when an itos release ships the moving
   rule, and specify `p2-integration-tests` when one merges more than one
   kind of named test (itos's `p1-several-test-kinds`).

## User review

Asked during the phase 2 session, not yet answered; each has a
recommendation, first:

- **Renovate's majors:** wait for approval on the Dependency Dashboard
  (`dependencyDashboardApproval` for `major`), or merge themselves on green
  CI as now. Decide **before installing the Renovate app**, which the owner
  does (README, first steps); its first Monday brings TypeScript 7,
  vite-plus 1.0, vitest 5 and checkout/upload-artifact v7.
- **zizmor in CI** as a new task, replacing T-025's grep checks with its
  `unpinned-uses` audit (hash-pin for every action) and adding its other
  workflow audits.
- **T-024's check** rewritten as a must-fail `tsc` proof instead of a grep
  over `tsconfig.json`, which `tasks/README.md` says a check never is.
- **The check-shape rule in itos** (`itos config check` refusing a check that
  greps a tracked file, unless marked): an idea here, or an issue on
  donvargax/itos.
- **The vulnerability scan on Renovate's branches** too, so a vulnerable
  update is caught before it lands rather than the next morning.
- `p2-mutation-testing` waits on the owner's follow-up, and
  `p2-project-generator` on a discussion of starting projects fresh.
