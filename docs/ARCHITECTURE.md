# Architecture as built

How the project is put together, as it actually is. Written once and amended
when a slice changes the shape of something; what landed, and when, is the
history (`vp run changelog`), and the decisions behind it are in `PLAN.md`.

## The application

<The modules under `src/`, what each owns, and how they depend on each
other: which are pure and unit-tested, which touch the page, and the
boundaries lint holds them to.>

The template's own, in the shape AGENTS.md's "Code design" gives a feature:

- **One slice**, `src/greeting/`: its feature file `greeting.ts`, a pure
  function, and `greeting.test.ts` beside it, examples and a fast-check
  property (whitespace around a name never changes the greeting, and a name
  is always in it). A feature that grows splits into more slices, never into
  layer folders.
- **The composition root**, `src/main.ts`, which `index.html` loads: it
  wires the slices to the page, each through its feature file, and holds
  nothing else, so the unit coverage leaves it out (`vite.config.ts`'s
  `coverage`: every module under `src/` but it) and the scenarios cover it.
  `src/` holds it and the slice folders, nothing else. It is the template's
  one browser edge (`browserEdges`, below): the page and the address are
  read there and handed to the slice, which reads neither.
- **The slice boundary**, held by two gates. Lint: `tools/lint/code-design.ts`
  is an oxlint JS plugin `vite.config.ts` loads for `src/**`, so `vp check`
  runs it wherever it runs (pre-commit, CI, the editor). Its rule
  `code-design/slice-boundary` resolves each relative or root-absolute
  specifier (import, re-export, dynamic import) against the file it is
  written in, and refuses one that lands in another slice's folder anywhere
  but on its feature file, `src/<slice>/<slice>.ts`, with or without the
  extension; a slice's own files and packages are left alone, and
  `src/main.ts` is held as a slice is. A plugin rather than
  `no-restricted-imports`, because oxlint's `regex` there has no lookahead
  or backreference (and drops a pattern that uses one without a word), and
  a specifier's meaning depends on the file it is in. The static check:
  `tools/code-design.ts` lists the files git tracks or has staged, the whole
  tree, and its rule `slice-folders` refuses one directly in `src/` but
  `main.ts`, of any kind, since lint sees only the files it lints. The
  pre-commit hook runs it after `vp staged`, and CI as a static step of its
  own, on every push. Each is a list of rules the later code design gates
  join: the plugin's `rules`, the script's `rules`, each problem printed
  under the rule's name (`code-design(<rule>)`), as lint prints its own.
- **No mocks**, held by lint: the plugin's second rule, `code-design/no-mocks`,
  which `vite.config.ts` turns on for every module under `src/` and `tools/`
  (a helper a test imports included). It judges each member of vitest's `vi`
  by what it does to the code under test: what replaces a module, a
  function, a global or an environment variable is refused, and so is what
  serves only that (`importActual`, `hoisted`, `mocked`, the unmock, clear,
  reset, restore and unstub calls); the clock's controls and the runner's
  helpers (`waitFor`, `setConfig`, `resetModules`…) are allowed, and a member
  the rule does not know is refused, so a release that adds a way to mock is
  read before it passes. It follows `vi` by oxlint's scope analysis
  (`getDeclaredVariables`, the global scope's unresolved references) from its
  import out of `vite-plus/test` or `vitest` (renamed or not, a namespace, a
  dynamic import) or the global, through aliases and destructuring, and
  refuses `vi` handed on where it cannot follow; `no-restricted-properties`
  names an object by its text, and a renamed `vi` passes it. The files allowed
  to mock are `vite.config.ts`'s `mockBoundaries`, each with a comment naming
  its boundary, which an override after the rule's turns it off for; empty in
  the template. `e2e/` is left out: it drives the built page in a browser,
  where no module can be mocked, and Playwright's fakes (`page.route`,
  `page.clock`) sit at the network's and the clock's edge.
- **No browser in a slice's logic**, held by lint: the plugin's third rule,
  `code-design/no-browser`, which `vite.config.ts` turns on for every file
  under `src/` (`src/**`, so a test and a framework's `.tsx` or `.vue` view
  file are held too) and off, in an override after it, for the files its
  `browserEdges` list names: the project's edge, `src/main.ts` in the
  template, beside which a project names its view files by glob and its
  infrastructure slices, each wrapping one browser API behind an interface
  the logic is handed. The rule's list of globals (`browser` in the plugin)
  is what a page offers and no other runtime does: the page and the
  address, the storages, the network (`fetch` among it), the window's
  events, dialogs, viewport, scroll and styles, the frame clock, the
  observers, and the DOM's classes as values (`instanceof HTMLElement`,
  `new Image()`). The clock, and what Node offers too (`URL`, `Blob`,
  `crypto`, `structuredClone`), are left out, so a unit test runs them as
  the page does. It reads oxlint's scope analysis at the end of the file:
  the global scope's unresolved references (`through`), and the references
  to a global the linter declares and the file does not (ES's `globalThis`
  is one, which oxlint resolves, and the browser's would be, under a lint
  config that sets its env). A local that shadows a global resolves to the
  local and passes; a name whose parent is a TypeScript type node (a type
  reference, `typeof document`, `typeof window.localStorage`) names nothing
  at run time and passes, while one under an `as`, `satisfies` or `!`
  expression, or an enum's or a namespace's code, is read. `globalThis` and
  `self` are followed as no-mocks follows `vi`: a member, a destructured
  property or an alias's member that is one of the globals is refused,
  named through them (`globalThis.fetch`); handed on, or read by a computed
  key, they pass, being the runtime's too. `window` is one of the globals
  itself, refused however it is used, and named with its member when it is
  read (`window.localStorage`).
- **Unit tests beside the code they test**, held by the static check's
  second rule, `tests-beside-code`. A unit test is `<name>.test.ts` beside
  the `<name>.ts` it tests, in a slice under `src/` (beside the feature file
  or an inner one) or in `tools/` at any depth, so a slice moves or splits
  with its tests. The rule refuses a `.test.ts` with no `<name>.ts` tracked
  beside it, one outside a slice and `tools/` (directly in `src/`, at the
  root), a unit test under `e2e/`, which holds the scenarios' steps, any
  file in a `__tests__/`, `test/` or `tests/` folder, and every other
  spelling vitest's default `include` (`**/*.{test,spec}.?(c|m)[jt]s?(x)`)
  would run. Both halves of the choice are taken: `vite.config.ts`'s
  `test.include` runs only `src/**/*.test.ts` and `tools/**/*.test.ts`, so
  vitest runs exactly the shape the rule allows, and the rule refuses the
  rest, which would otherwise sit in the tree never running.
- **A size tripwire**, lint's `max-lines` at `warn` (max 400) in
  `vite.config.ts`'s `lint.rules`, so it reaches every file lint reads:
  `src/`, `e2e/`, `tools/` and the root configs. A warning, which fails
  neither a commit nor CI: a long file is a prompt to look at its
  responsibilities, and may stay long with its reason beside it in a disable
  comment. Blank lines and comments are not counted, since the comments here
  carry the code's reasons, and counted they would be what pushes a file
  over and the first thing cut to get it under. The template's tree trips it
  nowhere, so the next warning is seen.
- **The ratchet**, for a rule adopted on code that breaks it.
  `code-design-ratchet.yaml` at the root maps every code design rule the
  gates hold to the files it is off for, each `{ file, item }`, the item the
  work item for its fix; empty lists in the template. `vite.config.ts`
  reads it and adds, after the overrides that turn lint's rules on, one
  that turns each plugin rule off for the files listed under it;
  `tools/code-design.ts` leaves its own rules' listed files out. The static
  check then holds the list on the tree, under `code-design(ratchet)`: its
  keys are exactly the rules the gates hold (the script's `rules` and the
  plugin's, imported), so the list says which rules are in force; an entry's
  file is tracked and still breaks its rule, which for a lint rule is asked
  of lint itself (`vp lint --format json` over the listed files, with
  `CODE_DESIGN_RATCHET=ignore` making `vite.config.ts` leave the list out,
  a switch that can only make lint stricter); and its item is in the
  registry (`work.registry`) and not `done`. It also reads every comment of
  every file lint lints, by TypeScript's parser, and refuses an
  `oxlint-disable` or `eslint-disable` (file, line, next line, block; any
  case, a JSDoc star) that names a code design rule or no rule at all, since
  either would turn a rule off past the list; a component file (`.vue`,
  `.svelte`, `.astro`) is read by its comment markers. The pure part, the
  list's reading, the joining rule and the comment reader, is
  `tools/code-design-ratchet.ts`, with its unit test. **The joining rule**
  is the script's range form: a file joins a rule's list only in the commit
  that brings the rule into force, and a rule is in force once any earlier
  commit's list named it (`git rev-list --full-history` over the list's
  versions), so taking a rule off and naming it again lets no file in.
  `node tools/code-design.ts --staged` judges HEAD against the index, and
  `node tools/code-design.ts <from> <to>` each commit of a range, a merge
  against every parent, leaving out `commits.since` and its ancestors. A
  commit whose list adds no entry is passed without reading the history.

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
  (`tests.scenario.smoke`). `itos config check` validates all of them, as a
  CI step; the commit-msg hook runs its problems over the index when one of
  them, or `itos.yaml`, is staged.
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
- **What the project adds to itos.** Two range checks the config names and
  the package does not ship, kept as the project's own. The code design
  ratchet's joining rule (`tools/code-design.ts`, under "The application")
  rides on the scenario kind for every commit type, though it is not the
  scenarios' rule: itos runs a range check only as a test kind's, in the
  commit-msg hook and in `itos verify`, which is where a commit made without
  the hooks is judged too. The scenario moving rule
  (`tools/scenario-moves.ts`, with its unit test) is the scenario kind's own
  range check. It reads each tree with the scenario kind of that tree's own
  `itos.yaml`, so a commit that moves the feature files to a new root along
  with the root moves every scenario unchanged; in a range it skips the
  check's `except_types` and leaves out `commits.since` and its ancestors, as
  `itos verify` does.
- **The header lint** (`commits.header_lint`) is commitlint
  (`commitlint.config.ts`, `config-conventional` alone), judging the header
  and the body. itos runs the footer rules itself after it, wherever it runs
  it: the commit-msg hook, `itos commit check-message -` (which is how a
  ledger check proves a footer rejected) and `itos verify`. Both report, so a
  header problem does not hide a footer problem.
- **The footers** (`commits.footers`): which types need each footer, which
  IDs must exist, and `read_at: commit`, which reads the IDs that exist (the
  ledger's tasks, the live scenarios) at the commit being checked.
- **Where verification starts** (`commits.since`): when set, the full SHA
  of the commit after which the commit rules apply. `itos verify` and the
  range checks leave it and its ancestors out, and so does the changelog
  (`tools/changelog.ts`); `itos config check` refuses a value that is not a
  commit of the repository. A project made from the template on GitHub sets
  it to the squashed "Initial commit" GitHub made, which no rule passes; a
  project adopting itos with a history of its own, to its last commit before
  the rules. The template's own history is clean and sets none.
  `tools/selftest/new-project.ts` makes a new project's history in a scratch
  worktree and proves the README's first commit turns it green.
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
    `staged`), then the code design check (`tools/code-design.ts`, under
    "The application": what `src/` holds, where a unit test sits, the
    ratchet); then, unless every staged file is Markdown, under `docs/` or
    `tasks/`, or a feature file (no unit test reads them, and itos's data
    among them is the commit-msg hook's), `vp test run --changed HEAD` with coverage
    collected but no thresholds, then `fallow audit` on what is new against
    HEAD. Vitest
    follows the imports from every changed file; `forceRerunTriggers` reruns
    everything when the config, the lockfile or `itos.yaml` changes, written
    as the files themselves, since vitest's own defaults never match a changed
    file. The audit scores changed functions by that coverage
    (`.fallowrc.json`), exact for the changed files since every test that
    runs one imports it.
  - **commit-msg** first, when `itos.yaml`, a ledger file, the registry or
    the smoke set is staged, runs `itos config check`'s problems over the
    index, so a file broken as it is staged is rejected though its copy on
    disk is sound; then it applies the type's path rules (`commits.scopes`), then
    the range checks' staged forms: outside `feat` and `fix` the scenario
    moving rule (`tools/scenario-moves.ts`), and for every type the
    ratchet's joining rule (`tools/code-design.ts --staged`); then the header lint and the footer rules,
    both reported; then the static checks of each task the `Task:` footer
    names, read from the staged ledger and run in the working tree, in
    written order up to the task's first late check (CI's cost rule), each
    capped at 60 seconds (`hooks.commit_msg.check_timeout`). A failing check
    rejects the commit when the task's work item is `done`, since a finished
    task that fails has regressed, and is only printed otherwise. It stops at
    the first rule that fails.
  - **pre-push** runs `hooks.pre_push`: `vp test run --changed <remote sha>`
    for each pushed ref, or the whole unit suite when there is no remote
    commit to compare with. Nothing else: the scenarios and the task checks
    are CI's.
- **The Node version** is written once, in `.node-version`: Vite+ reads it
  first when it resolves a project's Node, and both workflows hand it to
  setup-vp (`node-version-file`), which runs `vp env use` with it and keys
  the dependency cache on it. No workflow names a version of its own.
- **The workflows' actions** are pinned to commits, because a tag can be
  moved to other code: every `uses:` in `ci.yml` and `nightly.yml` names the
  full 40-character SHA of the commit its release tag pointed at, with that
  precise release beside it as a comment
  (`uses: actions/checkout@<sha> # v4.4.0`), for the reader and the update
  bot; an annotated tag is followed to its commit, not the tag object. A move
  changes the SHA and the comment together. The tools a workflow installs are
  pinned the same way: actionlint's install script is fetched from its
  release's commit, not the tag, and asked for that release
  (`raw.githubusercontent.com/rhysd/actionlint/<sha>/…`, `1.7.12`), and the
  nightly's GitHub CLI comes from its release tarball, checked against the
  release's SHA-256, as is the vulnerability scan's osv-scanner (below).
- **Dependency updates** arrive through Renovate (`.github/renovate.json5`),
  weekly, early on Monday (UTC), for the npm dependencies, `packageManager`,
  the catalog in `pnpm-workspace.yaml` and the workflows' `uses:` pins,
  which it moves SHA and comment together. One branch holds the npm updates
  and one the actions, with majors on a branch of their own in each
  (`renovate/npm-dependencies`, `renovate/major-npm-dependencies`, and the
  same for `workflow-actions`). It lands them by branch automerge: CI runs
  on `renovate/**` pushes too, and once it is green there Renovate
  fast-forwards `main` to the branch, so an update is one commit on `main`
  with no pull request and no merge commit; it opens a pull request only
  when CI is red. Each commit is written for the rules `itos verify`
  re-checks: `build: update <group>` (`semanticCommitType`, scope off), a
  body listing what moved from which version (`commitBody`), and
  `Task: T-026` as a trailer (`commitTrailers`). Left out: the itos tarball
  (`ignoreDeps`), which moves by hand ("itos, pinned" in the README);
  `.node-version` (only the `npm` and `github-actions` managers are on);
  `@types/node`'s majors, held to the runtime's; and the versions pinned
  inside `run:` steps and `tools/bin/vuln-scan`. Its Dependency Dashboard
  issue lists what is pending.
- **The type check** is `vp check`'s, over one `tsconfig.json` that covers
  `src/`, `e2e/`, `tools/` and the root `*.config.ts` alike. Beside `strict`
  it turns on `noUncheckedIndexedAccess` (an index may be undefined, so it is
  narrowed before use), `exactOptionalPropertyTypes` (an optional property is
  absent, not undefined; one that may be handed on undefined says
  `| undefined`) and `noImplicitOverride`.
- **CI** (`.github/workflows/ci.yml`) is one job, a thin wrapper around
  `itos ci run`, so everything it does runs locally too. A newer push
  replaces a run still waiting for the runner; a running one finishes, and
  the newest run checks every commit since the last green one. The range starts at the last
  green run on `main` (`itos ci range`, the `ci.range` provider), or at a pull
  request's base; empty means run everything. On a Renovate branch it is
  still `main`'s last green run, an ancestor of a branch built on `main`, so
  the branch is checked for what it would add. It is written to the job's
  environment once, so the scope, the commit re-check and the plan read the
  same range. `itos verify` re-checks every commit of the range with the
  commit-msg rules, so a commit made with the hooks bypassed fails CI.
  **The plan** (`itos ci plan <from> <to>` prints it, running nothing) is
  one sequence in cost order: the static steps of `ci.steps` (`vp check`,
  the code design check, the smoke rule, `itos config check`) and every named task check that is static (its
  own `cost: static`, else a pattern of `ci.cost.static`); then the late
  steps (the whole unit suite with the coverage thresholds, `vp build`, the
  audit, T-007); then **one Playwright run** over the smoke set, the
  scenarios the `Scenarios:` footers name and the E2E subsets of the tasks the
  `Task:` footers name; then the named tasks' late checks. A task's checks
  keep their written order. A check a step has just done is skipped
  (`ci.covers`), one in `ci.nightly_only` waits for the nightly, and a task
  whose work item is still `todo` waits (`ci.wait_on_status`). It stops at
  the first failure. A range of only `ci.prose.paths` (Markdown, `docs/**`,
  the work registry) runs `ci.prose.steps` (`vp check`, the code design
  check, `itos config check`) and the named tasks' static and `prose: true`
  checks, installs no browser and builds nothing; the code design check is
  among them because closing a work item the ratchet still lists is a
  registry change alone.
- **The nightly** (`.github/workflows/nightly.yml`, at 11:44 UTC on `main` or
  by hand) runs `itos ci run --nightly`: the whole E2E suite, then the gates
  self-test, then the code design self-test, which a push runs only when it
  names a task that checks it, so a vite-plus release that leaves the lint
  plugin loaded but silent shows the next morning (it is in
  `ci.nightly.steps` but not `ci.nightly_only`, which would only take it out
  of such a push). Then, in a step of its own, the vulnerability scan, whatever
  their result. A red run opens one issue labelled `nightly-red`, or comments
  on the open one with the failing scenarios and what the scan found; a green
  run closes it.
- **The vulnerability scan** (`tools/bin/vuln-scan`) checks `pnpm-lock.yaml`,
  both its documents (pnpm's own and the project's), against the OSV
  database with osv-scanner, and exits 1 on a finding. The nightly and a
  contributor run the same script. It installs osv-scanner itself: one pinned
  release, the binary for the platform it runs on (linux or darwin, amd64 or
  arm64), downloaded once per version into `${XDG_CACHE_HOME:-~/.cache}/vuln-scan/`
  and checked on every run against the SHA-256 the script carries for that
  platform, copied from the release's `osv-scanner_SHA256SUMS`, never read
  from a file fetched beside the binary. The version and the four hashes are
  written there alone, and move together. It is the nightly's, not a push's,
  because an advisory arrives with no commit; and a step apart from
  `ci.nightly`, whose plan stops at its first failure, so a red scan stops
  neither the suite nor the self-test, and a red suite hides no advisory. A
  finding is fixed by moving the dependency; one with no fixed version is
  ignored in `osv-scanner.toml` at the root (`[[IgnoredVulns]]`, with its
  `reason` and an `ignoreUntil` date), which osv-scanner reads beside the
  lockfile.
- **The self-tests** (`tools/selftest/`) prove the gates rather than the code:
  `gates.ts` runs the real hooks in a scratch worktree and shows that they run
  only what a change reaches and that CI's steps catch what they leave out;
  `ci-scope.ts` and `e2e-scope.ts` prove that the project's prose paths hold
  only prose and that the plan's E2E command selects exactly what it claims,
  against Playwright's own listing; `code-design.ts` writes slices of its own
  into a scratch worktree and shows that the code design gates (lint, the
  static check, the pre-commit hook) refuse, warn and allow as they should,
  and that CI runs them on every push. It is a runner over a table of cases,
  each the files it writes, the gate that judges them and what the gate
  must say, refusing or warning, or must not (a refusal or a warning counts
  only when it names the rule). The cases sit in `code-design/`, one file
  per rule, named after it and saying what its cases prove:
  `slice-boundary.ts`, `no-mocks.ts` (each refused member of `vi`, `vi`
  reached every way a test can, the clock allowed, a `mockBoundaries` file
  allowed), `no-browser.ts` (the globals refused in a slice's logic, its
  test and a view file browserEdges does not name, however they are
  reached; a slice handed an adapter, a `browserEdges` file and only it, a
  view file named by its kind, `src/main.ts`, a type, a shadowing local, the
  clock and a file the ratchet lists allowed), `max-lines.ts` (the warning on a file over the limit in `src/`,
  `e2e/` and `tools/`, lint still passing, none at the limit or over the
  template's own tree), `slice-folders.ts` and `tests-beside-code.ts` (a
  test beside its file allowed, an orphan, one in the wrong place or a
  folder of tests refused, and each other spelling vitest's default would
  run, generated from its pattern), and `ratchet.ts` (a listed file let off
  its rule and its neighbour not, each refused entry, the list's keys, each
  form of disable comment, and the joining rule); `case.ts` holds a case's
  shape. A case may commit a history before its files, as the root of a
  history of its own when the template's must not count, and be judged by
  two more gates: the commit-msg hook over its files staged as a `build`
  commit, and `itos verify` over them committed, as CI re-checks a push. A
  new rule adds a file of cases and joins the runner's list. It runs nightly
  too. They share `cli.ts`, which asks itos's
  command line.
- **The changelog** (`tools/changelog.ts`, `cliff.toml`): git-cliff groups
  the Conventional Commits by type, each with its footers and body, into
  `docs/changelog/`, which git, the formatter, the linter and the audit
  ignore; `-- --task <id>` and `-- --scenario <id>` print one footer's
  commits.
- **Agents' worktrees** live under `.claude/worktrees/`, ignored by git, and
  left out of the unit tests, the linter and the formatter: their files are
  theirs, often half-written, and never this checkout's.
