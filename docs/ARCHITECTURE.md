# Architecture as built

How the project is put together, as it actually is. Written once and amended
when a slice changes the shape of something; what landed, and when, is the
history (`vp run changelog`), and the decisions behind it are in `PLAN.md`.

## The application

<The modules under `src/`, what each owns, and how they depend on each
other: which are pure and unit-tested, which touch the page, and the
boundaries lint holds them to.>

The template's own: `src/greeting.ts` is a pure function with its unit test
beside it (`src/greeting.test.ts`); `src/main.ts` only wires it to the page,
so the unit coverage leaves it out and the scenarios cover it. `index.html`
loads `src/main.ts`.

## The scenarios

The behaviour a user can observe is Gherkin in `features/`, run by
Playwright through playwright-bdd against what `vp build` produces, served by
`vp preview` (`playwright.config.ts`). `features/README.md` holds the
rules: the black-box boundary, the tags, the smoke set, the moving rule.

- **Two folders.** `features/`, at the root, is the specification: the
  feature files, their README and the smoke set, readable without the code
  that runs them. `e2e/` is that code, the Playwright harness: the steps, the
  page objects and the specs playwright-bdd generates into
  `e2e/.features-gen/` (ignored). The harness is TypeScript that drives a
  browser, held by lint to its boundary, and goes as one if the runner is
  replaced; the feature files stay.
- **Steps** (`e2e/steps/`) read as the scenarios do and drive **page
  objects** (`e2e/support/`, one per area of the interface), which alone
  locate elements. Lint keeps `e2e/**` from importing `src`.
- **The served port** comes from a hash of the checkout's path, so the main
  checkout and every agent's worktree serve on ports of their own;
  `E2E_PORT` overrides it.
- **In CI** a scenario runs once unrecorded and, only when it fails, once
  more with its trace and video; a scenario that fails and then passes is
  flaky, and the run stays red. Locally there is no retry and a run stops at
  the first failure.
- `@wip` scenarios are generated out of the run (`tags: "not @wip"`).

<The project's own areas and page objects, as they are added.>

## Task tooling

**itos** is the task tooling: the ledger and its checks, the commit rules,
named tests and the smoke set, the CI plan and its driver, the work registry
and the hooks, behind one command line, `tools/bin/itos` (`itos --help` lists
the commands, `itos <command> --help` each one).

- **A pinned release.** itos is a dev dependency: `package.json` names one
  release's tarball by URL, the lockfile holds its integrity, and
  `tools/bin/itos` runs the installed bin, or says to run `vp install` when
  it is missing. Its code, its licence (AGPL-3.0) and the proof of what it
  does live in its own repository; a version bump is the README's "itos,
  pinned" steps, then the release notes' upgrading steps.
- **One policy file.** `itos.yaml` at the root holds every table the tool
  reads: the ledger's layout (`ledger`), the commit types, footers, path sets
  and scopes (`commits`), the named tests and their adapters (`tests`), CI's
  steps, costs, prose shortcut, nightly and range (`ci`), the work registry
  and the people (`work`), and the hooks (`hooks`). itos rejects a key it
  does not know, naming the one it misspells; `ITOS_CONFIG` or `--config`
  names another file. A project changes its policy here, not in code.
- **What it reads.** The ledger is `tasks/phase-<n>.yaml` (`ledger.files`),
  the registry `tasks/work-items.yaml` (`work.registry`), the people
  `CONTRIBUTORS.md` (`work.people`), the smoke set `features/smoke.yaml`
  (`tests.scenario.smoke`). `itos config check` validates all of them.
- **One command line**: exit 0 on success, 1 for a policy failure (a check
  failed, a commit rejected, an unknown task), 2 for a usage or config error,
  3 for a missing environment. `--json` prints one object with
  `"schema": 1`, logs on stderr; each problem in it has a sentence, a `rule`
  id and, where one exists, a `fix`. The self-tests read what they prove
  from it (`ci plan --json`, `ci scope`, `tests smoke ids`), never from its
  modules.
- **Named tests behind an adapter.** A kind of named test (here one,
  `scenario`) says how its tests are listed and run. itos's built-in Gherkin
  adapter reads the feature files; a scenario is live when neither its tag
  line nor its file's header holds `@wip`. The kind's `run` and `recognize`
  templates are how CI reads a task check as a selection of tests and merges
  every selection into one command; nothing else knows Gherkin or
  Playwright.
- **What the project adds to itos.** Two pieces the config names and the
  package does not ship, kept as the project's own:
  - the scenario moving rule (`tools/scenario-moves.ts`, with its unit
    test), the scenario kind's range check. It reads each tree with the
    scenario kind of that tree's own `itos.yaml`, so a commit that moves the
    feature files to a new root along with the root moves every scenario
    unchanged; in a range it skips the check's `except_types` and leaves out
    `commits.since` and its ancestors, as `itos verify` does.
  - the footer rules inside commitlint (`commitlint.config.ts`). commitlint is
    the header lint (`commits.header_lint`), and with one set itos runs only
    it; so commitlint carries one `<key>-footer` rule per footer of
    `commits.footers`, each asking `itos commit check-message` under a copy
    of the policy with no header lint, written for the run.
- **The footers** (`commits.footers`): which types need each footer, which
  IDs must exist, and `read_at: commit`, which reads the IDs that exist (the
  ledger's tasks, the live scenarios) at the commit being checked.
- **The world outside the repository** is three providers: where a push's
  range starts (`ci.range`: the last green run on GitHub, a command, or
  none), who a session works for (`work.identity`: `gh api user`, a command,
  or only `--as`), and who works on the project (`work.people`).

## The gates and CI

- **The hooks** (`.vite-hooks/`): `commit-msg` and `pre-push` are one-line
  shims `itos hooks install` writes, calling `itos hook commit-msg` and
  `itos hook pre-push`; `pre-commit` is the project's own. `vp config`
  (`prepare`, on `vp install`) points git at the folder.
  - **pre-commit** runs `vp staged` (each path's command in `vite.config.ts`'s
    `staged`), then, unless every staged file is Markdown, under `tasks/` or
    a feature file, `vp test run --changed HEAD` with coverage collected but
    no thresholds, then `fallow audit` on what is new against HEAD. Vitest
    follows the imports from every changed file; `forceRerunTriggers` reruns
    everything when the config, the lockfile or `itos.yaml` changes, written
    as the files themselves, since vitest's own defaults never match a changed
    file. The audit scores changed functions by that coverage
    (`.fallowrc.json`), exact for the changed files since every test that
    runs one imports it.
  - **commit-msg** applies the type's path rules (`commits.scopes`), then
    outside `feat` and `fix` the scenario moving rule
    (`tools/scenario-moves.ts`), then the header lint: commitlint
    (`commitlint.config.ts`, `config-conventional` plus one `<key>-footer`
    rule per footer of `commits.footers`), stopping at the first that fails.
  - **pre-push** runs `hooks.pre_push`: `vp test run --changed <remote sha>`
    for each pushed ref, or the whole unit suite when there is no remote
    commit to compare with. Nothing else: the scenarios and the task checks
    are CI's.
- **CI** (`.github/workflows/ci.yml`) is one job, a thin wrapper around
  `itos ci run`, so everything it does runs locally too. A newer push
  replaces a run still waiting for the runner; a running one finishes, and
  the newest run checks every commit since the last green one. The range starts at the last
  green run on `main` (`itos ci range`, the `ci.range` provider), or at a pull
  request's base; empty means run everything. It is written to the job's
  environment once, so the scope, the commit re-check and the plan read the
  same range. `itos verify` re-checks every commit of the range with the
  commit-msg rules, so a commit made with the hooks bypassed fails CI.
  **The plan** (`itos ci plan <from> <to>` prints it, running nothing) is one sequence in cost order: the static steps of `ci.steps`
  (`vp check`, the smoke rule) and every named task check that is static (its
  own `cost: static`, else a pattern of `ci.cost.static`); then the late
  steps (the whole unit suite with the coverage thresholds, `vp build`, the
  audit, T-007); then **one Playwright run** over the smoke set, the
  scenarios the `Scenarios:` footers name and the E2E subsets of the tasks the
  `Task:` footers name; then the named tasks' late checks. A task's checks
  keep their written order. A check a step has just done is skipped
  (`ci.covers`), one in `ci.nightly_only` waits for the nightly, and a task
  whose work item is still `todo` waits (`ci.wait_on_status`). It stops at
  the first failure. A range of only `ci.prose.paths` (Markdown, `docs/**`)
  runs `ci.prose.steps` and the named tasks' static and `prose: true` checks,
  installs no browser and builds nothing.
- **The nightly** (`.github/workflows/nightly.yml`, at 11:44 UTC on `main` or
  by hand) runs `itos ci run --nightly`: the whole E2E suite, then the gates
  self-test. A red run opens one issue labelled `nightly-red`, or comments on
  the open one with the failing scenarios; a green run closes it.
- **The self-tests** (`tools/selftest/`) prove the gates rather than the code:
  `gates.ts` runs the real hooks in a scratch worktree and shows that they run
  only what a change reaches and that CI's steps catch what they leave out;
  `ci-scope.ts` and `e2e-scope.ts` prove that the project's prose paths hold
  only prose and that the plan's E2E command selects exactly what it claims,
  against Playwright's own listing. They share `cli.ts`, which asks itos's
  command line.
- **The changelog** (`tools/changelog.ts`, `cliff.toml`): git-cliff groups
  the Conventional Commits by type, each with its footers and body, into
  `docs/changelog/`, which git, the formatter, the linter and the audit
  ignore; `-- --task <id>` and `-- --scenario <id>` print one footer's
  commits.
- **Agents' worktrees** live under `.claude/worktrees/`, ignored by git, and
  left out of the unit tests, the linter and the formatter: their files are
  theirs, often half-written, and never this checkout's.
