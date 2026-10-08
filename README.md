# Project template

A starting point for a project that works by its tasks, its scenarios and its
gates: a small [Vite+](https://viteplus.dev) app with unit tests and
Gherkin scenarios, a task ledger whose every task is proven by commands, and
commit rules, git hooks and CI that hold every commit to them. The rules live
in one file, `itos.yaml`, read by **itos**, the task tool: a global launcher
on the `PATH` that runs the release `itos.yaml` pins.

What it gives a new project from its first commit:

- **Commits that name their work.** Conventional Commits, each `feat` or `fix`
  naming the scenarios it turns green (`Scenarios: @ID-…`) and every other
  type the task it belongs to (`Task: T-…`); each type may touch only certain
  paths. The commit-msg hook enforces it, and CI re-checks every pushed
  commit.
- **A ledger of tasks with executable checks** (`tasks/`): a task is done when
  its `done_when` commands pass, `itos task <id>` says so.
- **Gates that run themselves.** pre-commit formats, lints, runs the unit
  tests the change reaches and the audit; commit-msg holds the commit rules;
  pre-push re-checks the pushed commits by them and runs the unit tests they
  reach; CI runs everything from the last green run, in cost
  order, with one E2E run over the smoke set and what the commits name; a
  nightly runs every scenario, the gates' self-tests and every done task's
  static checks, scans the lockfile for known vulnerabilities, and opens an
  issue when it goes red.
- **Work routing** (`tasks/work-items.yaml`, `CONTRIBUTORS.md`): `itos work`
  says what the person a session works for can start next.
- **A changelog from the commits**: `vp run changelog`.
- **Agent instructions for what no command can check.** `AGENTS.md` is the
  implementing session's: which session it is, how to split work into
  commits, the gates as built, what never to do, how to finish.
  `docs/ORCHESTRATING.md` is the coordinator's: the loop of handing slices to
  subagents, the brief, a slice that fails, checking a result.

`tasks/README.md` and `features/README.md` state the rules;
`itos --help` lists the tool's commands.

## Where things are

| File                       | What it holds                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `PLAN.md`                  | The decisions, the intended architecture, the phases and the references.               |
| `docs/ARCHITECTURE.md`     | How the code is put together as built, the task tooling and the gates included.        |
| `docs/HANDOFF.md`          | Only what the next session should do; the coordinator rewrites it.                     |
| `AGENTS.md`                | The working rules for a session that implements.                                       |
| `docs/ORCHESTRATING.md`    | The working rules for the session that coordinates.                                    |
| `docs/PHASES.md`           | Who owns which phase, and how work is routed.                                          |
| `tasks/work-items.yaml`    | The one list of open work: owners, statuses, dependencies, ideas.                      |
| `tasks/`                   | The ledger: every non-feature task and the checks that prove it.                       |
| `features/`                | The scenarios: the behaviour a user can observe, and the smoke set.                    |
| `e2e/`                     | The Playwright harness that runs them: steps and page objects.                         |
| `itos.yaml`                | The policy every gate reads.                                                           |
| `code-design-ratchet.yaml` | The files a code design rule is off for while they are fixed, each with its work item. |

## Create a project from it

On GitHub, **Use this template → Create a new repository**, or:

```sh
gh repo create <owner>/<name> --template donvargax/project-template --private --clone
```

## First steps in the new project

1. **Install.** Node is the version `.node-version` holds (24), which Vite+
   picks up on its own and CI installs from the same file. `vp install`
   installs the dependencies and, through
   `prepare`, the pre-commit hook (`vp config`). It takes no release younger
   than a week, a locked one included (`minimumReleaseAge` in
   `pnpm-workspace.yaml`; docs/ARCHITECTURE.md, "Dependency updates"), so an
   install that refuses a lockfile names the version and when it was
   published: wait for it, rather than loosening the setting. Install the browser for the
   scenarios once: `vp exec playwright install chromium`. itos is not a
   dependency: install its launcher once per machine, into a folder on your
   `PATH` (any release will do, since the pin in `itos.yaml` picks the one
   that runs), with Go:

   ```sh
   go install github.com/donvargax/itos/v6/cmd/itos@v6.5.1
   ```

   or with the script CI's action runs, which checks the archive against the
   release's `checksums.txt`:

   ```sh
   curl -fsSL -o install-launcher https://raw.githubusercontent.com/donvargax/itos/58f7e3f430eec46da415929cd46d2f2ecef46af0/tools/bin/install-launcher
   sh install-launcher "$HOME/.local/bin" 6.5.1
   ```

   Then, once in each clone, declare itos's commit-msg and pre-push hooks in
   its git config: `itos hook install`. It needs git 2.54 or later, the
   first that runs the hooks its config declares; until it has run, no
   commit-msg or pre-push hook of itos's runs, and `itos commit` and
   `itos push` refuse.

2. **Start verification after GitHub's commit, in the first commit.** GitHub
   creates the repository as one squashed commit, "Initial commit", which no
   commit rule passes, so until `itos.yaml` says where verification starts,
   CI fails on it at every push. Before anything else, set `commits.since`
   to that commit's full SHA, which `git rev-list --max-parents=0 HEAD`
   prints:

   ```yaml
   commits:
     # ...
     reject_message: "Commit rejected (see tasks/README.md):"
     since: "<the SHA>" # GitHub's squashed "Initial commit": verification starts after it
   ```

   and commit it alone, as a `build` commit naming T-018, its message
   written to a file and passed with `git commit -F`:

   ```text
   build: start verification after the template's initial commit

   GitHub made this repository from the template as one squashed commit, which no commit rule
   passes; commits.since names it, so verification and the changelog start after it.

   Task: T-018
   ```

3. **Rename.** Set `name` in `package.json`, the page's `<title>` in
   `index.html`, and this README's title and text.
4. **Contributors.** Put the project's people in `CONTRIBUTORS.md` (their
   GitHub logins are the owners `tasks/work-items.yaml` names), and set the
   phase owners in `tasks/work-items.yaml` and `docs/PHASES.md`.
5. **Licence.** The template is 0BSD (`LICENSE`, and `license` in
   `package.json`): replace both with the project's own, its SPDX ID in
   `package.json`; T-011 checks that GitHub detects the licence `package.json`
   names. itos is not carried in the repository: it is installed from its
   release, under its own licence (AGPL-3.0).
6. **Ledger.** `tasks/phase-0.yaml` and `tasks/phase-1.yaml` hold the
   template's own setup tasks; keep them as the project's phases 0 and 1,
   and add the project's phases after them.
7. **The demo.** The page (`index.html`, `src/`), its scenario
   (`features/app.feature`) and their steps and page object (`e2e/`) are a
   demo for the gates to run against; replace them with the project's own,
   each feature a slice of `src/` as AGENTS.md's "Code design" says. If the
   project's framework renders views from files of its own (`.tsx`, `.vue`,
   `.svelte`), add their glob to `browserEdges` in `vite.config.ts` beside
   `src/main.ts`: lint refuses the browser's globals everywhere else under
   `src/`, and the views are where the page is drawn.
   The setup checks name none of it, except the gates self-test
   (`tools/selftest/gates.ts`, T-009, run nightly), which edits a module and
   its unit test, `src/main.ts` and a scenario to prove what the hooks run:
   point it at the project's own when the demo goes.
8. **Plan.** Fill in `PLAN.md` (what the project is, its decisions, its
   phases), the application's sections of `docs/ARCHITECTURE.md`, and
   `docs/HANDOFF.md` with the first steps. The agent instructions
   (`AGENTS.md`, `docs/ORCHESTRATING.md`) are written for any project and
   need no change to start; add a project's own rules to them as it finds
   them, each with its reason.
9. **Check.** `itos task --phase 0` runs every setup task's checks; push to
   `main` and CI runs on GitHub Actions with no secrets to configure.
10. **Dependency updates.** Renovate runs from the repository's own workflow
    (`.github/workflows/renovate.yml`), with no Renovate account or app. Create
    a fine-grained personal access token limited to the repository (contents,
    workflows, pull requests and issues read and write; commit statuses and
    checks read) and save it as the repository secret `RENOVATE_TOKEN`; the
    owner does, once, and renews it before it expires. From then on Renovate
    lands the week's updates on `main` by itself, each as one `build` commit
    once CI is green on its branch (`.github/renovate.json5`, explained in
    `docs/ARCHITECTURE.md`). It pushes to `main` as everyone else does, so
    `main` must not require pull requests. Until the secret exists, the
    workflow does nothing and nothing moves the dependencies. To make the
    week's branches now rather than in Monday's window:
    `gh workflow run renovate.yml -f outside-window=true`. An owner who runs
    Renovate centrally for all their repositories, with an app of their own
    (as donvargax does from a private repository of theirs), leaves the
    secret unset: the repository's `renovate.json5` is all the central run
    needs, and the workflow here stays idle so two Renovates never work one
    repository.

## A code design rule on code that breaks it

The template's code is clean under every code design rule in `AGENTS.md`'s
"Code design". A project that takes a rule the template added after it was
made, or adds one of its own, usually has files that break it: it lists
them under the rule in `code-design-ratchet.yaml`, each with a work item
for its fix, in the one `build` commit that brings the rule and its key in
the list, and fixes them one by one; the list only shrinks. A project made
before the ratchet takes it whole: the list, with a key for every rule its
gates hold, `tools/code-design.ts` and `tools/code-design-ratchet.ts`, the
override in `vite.config.ts`, and the `code-design-ratchet` range check and
the prose step in `itos.yaml`. Its history never named a rule, so that
commit may list files under any of them, each one that still breaks it.
For `no-browser`, name the project's edge in `browserEdges` first (its view
files, its infrastructure slices): only the logic that reaches the browser
is a debt to list.
`AGENTS.md` says how, and which gates hold it.

## itos, pinned

itos is pinned to one release in `itos.yaml`: `pin.version`, and
`pin.checksums`, the SHA-256 of that release's `checksums.txt`. The itos on
the `PATH`, whatever its version, is a launcher: it fetches the pinned
release into its cache, checks the list against the pin and the archive
against its line, and runs it, so a release replaced under its URL runs
nowhere. The hooks, CI and the ledger call plain `itos`. CI and the nightly
install the launcher with the `donvargax/itos` action, pinned to a release's
commit with the tag beside it and given that release as its `version`.

To move to another release:

```sh
itos upgrade <the release>   # or none, for the newest
```

It moves the pin and lists, release by release, what each one since asks:
its breaking changes, its upgrading steps and the config keys it changes.
Do what they ask, move the action in `.github/workflows/ci.yml` and
`nightly.yml` to the release's commit (its SHA, the tag beside it, and its
`version` input), and run `itos version --check` and `itos config check`.
Renovate leaves the action alone (`ignoreDeps` in `.github/renovate.json5`),
so a move is always this one.

## Vulnerability scan

`tools/bin/vuln-scan` scans `pnpm-lock.yaml` for known vulnerabilities with
osv-scanner and exits 1 on a finding. The nightly runs it, and a red scan
opens or comments on the "Nightly red" issue; run it yourself after adding or
moving a dependency, or to reproduce a red nightly:

```sh
tools/bin/vuln-scan                 # a table of what it found, if anything
tools/bin/vuln-scan --format json   # any osv-scanner `scan source` option
```

It needs `curl` and `sha256sum` or `shasum`, on linux or macOS, amd64 or
arm64. The first run downloads the pinned osv-scanner for your platform into
`${XDG_CACHE_HOME:-~/.cache}/vuln-scan/`, and every run checks it against the
SHA-256 the script carries. To move to another release, set `version` in the
script and copy the four platforms' hashes from the release's
`osv-scanner_SHA256SUMS`, after checking that file against the release's
provenance.

A finding is fixed by moving the dependency to a fixed version (`vp update`,
or `vp add` for a direct one) in a `build` commit. When no fixed version
exists, ignore it in `osv-scanner.toml` at the root, with the reason and a
date it stops being ignored, so it comes back:

```toml
[[IgnoredVulns]]
id = "GHSA-xxxx-xxxx-xxxx"
ignoreUntil = 2026-12-31
reason = "Only reached from the dev server; no release fixes it yet."
```

## Licence

The template is [0BSD](LICENSE). itos, installed from its release and not
carried here, is AGPL-3.0.
