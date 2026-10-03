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

Last rewritten on 2026-10-03, after the Renovate work (T-038 to T-040).

## Where things stand

itos is pinned at **v0.5.0**, and phases 0 to 3 are done. Dependency
updates now run:

- **From the owner's presets.** `renovate.json5` extends
  `github>donvargax/renovate-config` at a pinned tag (T-040).
- **Centrally.** Renovate runs from the owner's private
  `donvargax/github-admin` (its T-100), with the owner's GitHub App, over
  every repository that has a Renovate config. This repository's own
  `renovate.yml` idles: it runs only while the secret `RENOVATE_TOKEN` is
  set, and it is not set here.
- **Majors land on green CI,** each on a branch of its own. The exception is
  the toolchain the catalog pins together, which moves as one group.

Read the newest CI run and the newest nightly on `main` before beginning
(`gh run list --workflow ci.yml --branch main --limit 1`, and the same for
`nightly.yml`); a red nightly takes priority over new work.

## Next

1. **After Monday's first scheduled central run** (00:17 UTC), read what
   landed and what is red.
   - **Expected:**
     - the presets' pin moved to v1.1.0, which turns on a Dependency
       Dashboard issue;
     - the toolchain's majors (vite-plus 1.0, vitest 5);
     - lockfile maintenance;
     - TypeScript 7 red on its own branch.
   - **Left from the old grouping:** pull request #1 and the
     `renovate/major-npm-dependencies` branch. Renovate should close and
     prune them; if it does not, close them by hand.
2. **`p3-typescript-7`:** specify it as a task and hand it out, so
   TypeScript 7 can land.
3. **The small ideas that need no decision,** specified as tasks:
   `p2-control-regex-warning`, `p3-disable-says-why`,
   `p2-vuln-scan-negative-proof`, `p2-actionlint-binary-hash`,
   `p1-actionlint-at-commit`, `p2-no-mocks-other-libraries`,
   `p3-major-commit-subjects`. `p2-run-step-pins-updated` too: the presets
   carry `customManagers:githubActionsVersions`, and each pin needs its hash
   moved with it.
4. **When itos ships them:**
   - close `p1-scenario-moves-in-itos` when a release ships the moving rule;
   - move the ratchet's joining rule out of the scenario kind when a release
     runs a project's own range check (`p3-range-checks-outside-a-kind`);
   - specify `p2-integration-tests` when a release merges more than one kind
     of named test.

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
