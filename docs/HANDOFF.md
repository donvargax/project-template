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

Last rewritten on 2026-10-07, after itos 6 (T-042), the pnpm wait (T-043)
and Renovate's central run working again.

## Where things stand

itos is pinned at **v6.5.1** in `itos.yaml`, run by the launcher on the
PATH; a clone runs `itos hook install` once (README). Phases 0 to 3 are done,
and the nightly is green.

Dependency updates:

- **Run centrally** from the owner's private `donvargax/github-admin`, with
  the owner's GitHub App. Every run aborted on this repository from
  2026-10-05 until the App was given commit statuses read and write on
  2026-10-07: Renovate writes a `renovate/stability-days` status for the
  seven-day wait, and a refused write ends its run as "Repository has
  changed during renovation". github-admin's docs still say "statuses
  read"; that is its own sessions' to fix.
- **From the owner's presets,** now at v1.3.0: v1.2.0 turned on OSV
  vulnerability alerts (a direct dependency's fix lands at once, outside
  the window and the wait); v1.3.0 added `go.json` for Go repositories.
  Renovate moves this repository's pin from v1.1.0 itself.
- **A week's wait in pnpm too** (T-043): a transitive dependency's
  vulnerability fix younger than a week is a hand `build` commit
  (docs/ARCHITECTURE.md, "Dependency updates").

## Next

1. **Read what Renovate lands** on its next runs, and the Dependency
   Dashboard (#3): `workflow-actions`, `npm-dependencies`,
   `lock-file-maintenance` (re-resolved under the pnpm wait), the presets'
   pin to v1.3.0, and `major-vite-plus-toolchain` (vite-plus 1.0, vitest 5),
   which may need work of its own. Pull request #1 and the
   `renovate/major-npm-dependencies` branch, left from the old grouping,
   should close and go; close them by hand if they do not.
2. **The small ideas that need no decision,** specified as tasks:
   `p2-control-regex-warning`, `p3-disable-says-why`,
   `p2-vuln-scan-negative-proof`, `p2-actionlint-binary-hash`,
   `p1-actionlint-at-commit`, `p2-no-mocks-other-libraries`,
   `p3-major-commit-subjects`, `p3-builtin-header-lint`.
   `p2-run-step-pins-updated` too: the presets carry
   `customManagers:githubActionsVersions`, and each pin needs its hash
   moved with it.
3. **What itos now ships:**
   - `p1-scenario-moves-in-itos`: itos has a built-in moving rule since
     v0.6.0; prove it reads a moved root as `tools/scenario-moves.ts` does,
     then drop the script;
   - `p3-range-checks-outside-a-kind` and `p2-integration-tests`: check
     whether a release since v0.5.0 runs a project's own range check, or
     merges more than one kind of named test.

## User review

Not yet answered; each has a recommendation, first:

- **`p3-edge-out-of-coverage`:** leave `browserEdges` out of the unit
  coverage, as `src/main.ts` is, since the scenarios cover the edge and a
  unit test of it needs mocks. Today an infrastructure slice listed there
  fails the thresholds at 0%.
- **`p3-nightly-late-done-checks`:** run the done tasks' late checks
  nightly too, or only some.
  - A late check of T-005 was red from T-031 to T-037 unseen.
  - Every check costs a CI rerun (T-008) and a token (T-011).
  - T-038's runtime check is late too; Renovate's action moves name it, so
    CI runs it on each.
- **zizmor in CI** as a new task, replacing T-025's grep checks with its
  `unpinned-uses` audit and adding its other workflow audits.
- **T-024's check, and T-022's `grep check-message commitlint.config.ts`,**
  rewritten as checks that run something, since `tasks/README.md` says a
  check never greps a config file.
- **The check-shape rule in itos** (`itos config check` refusing a check that
  greps a tracked file, unless marked): an idea here, or an issue on
  donvargax/itos.
- **The vulnerability scan on Renovate's branches** too, so a vulnerable
  update is caught before it lands, not by the next nightly.
- `p2-mutation-testing` waits on the owner's follow-up, and
  `p2-project-generator` on a discussion of starting projects fresh.
