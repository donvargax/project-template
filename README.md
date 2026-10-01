# Project template

A starting point for a project that works by its tasks, its scenarios and its
gates: a small [Vite+](https://viteplus.dev) app with unit tests and
Gherkin scenarios, a task ledger whose every task is proven by commands, and
commit rules, git hooks and CI that hold every commit to them. The rules live
in one file, `itos.yaml`, read by **itos**, the task tool, a dev dependency
pinned to a release and run as `tools/bin/itos`.

What it gives a new project from its first commit:

- **Commits that name their work.** Conventional Commits, each `feat` or `fix`
  naming the scenarios it turns green (`Scenarios: @ID-…`) and every other
  type the task it belongs to (`Task: T-…`); each type may touch only certain
  paths. The commit-msg hook enforces it, and CI re-checks every pushed
  commit.
- **A ledger of tasks with executable checks** (`tasks/`): a task is done when
  its `done_when` commands pass, `tools/bin/itos task <id>` says so.
- **Gates that run themselves.** pre-commit formats, lints, runs the unit
  tests the change reaches and the audit; pre-push runs the unit tests the
  pushed commits reach; CI runs everything from the last green run, in cost
  order, with one E2E run over the smoke set and what the commits name; a
  nightly runs every scenario and opens an issue when it goes red.
- **Work routing** (`tasks/work-items.yaml`, `CONTRIBUTORS.md`): `tools/bin/itos work`
  says what the person a session works for can start next.
- **A changelog from the commits**: `vp run changelog`.
- **Agent instructions for what no command can check.** `AGENTS.md` is the
  implementing session's: which session it is, how to split work into
  commits, the gates as built, what never to do, how to finish.
  `docs/ORCHESTRATING.md` is the coordinator's: the loop of handing slices to
  subagents, the brief, a slice that fails, checking a result.

`tasks/README.md` and `features/README.md` state the rules;
`tools/bin/itos --help` lists the tool's commands.

## Where things are

| File                    | What it holds                                                                   |
| ----------------------- | ------------------------------------------------------------------------------- |
| `PLAN.md`               | The decisions, the intended architecture, the phases and the references.        |
| `docs/ARCHITECTURE.md`  | How the code is put together as built, the task tooling and the gates included. |
| `docs/HANDOFF.md`       | Only what the next session should do; the coordinator rewrites it.              |
| `AGENTS.md`             | The working rules for a session that implements.                                |
| `docs/ORCHESTRATING.md` | The working rules for the session that coordinates.                             |
| `docs/PHASES.md`        | Who owns which phase, and how work is routed.                                   |
| `tasks/work-items.yaml` | The one list of open work: owners, statuses, dependencies, ideas.               |
| `tasks/`                | The ledger: every non-feature task and the checks that prove it.                |
| `features/`             | The scenarios: the behaviour a user can observe, and the smoke set.             |
| `e2e/`                  | The Playwright harness that runs them: steps and page objects.                  |
| `itos.yaml`             | The policy every gate reads.                                                    |

## Create a project from it

On GitHub, **Use this template → Create a new repository**, or:

```sh
gh repo create <owner>/<name> --template donvargax/project-template --private --clone
```

## First steps in the new project

1. **Install.** Node is the version `.node-version` holds (24), which Vite+
   picks up on its own and CI installs from the same file. `vp install`
   installs the dependencies and, through
   `prepare`, the git hooks (`vp config`). Install the browser for the
   scenarios once: `vp exec playwright install chromium`.
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
   demo for the gates to run against; replace them with the project's own.
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
9. **Check.** `tools/bin/itos task --phase 0` runs every setup task's checks; push to
   `main` and CI runs on GitHub Actions with no secrets to configure.
10. **Dependency updates.** Install the [Renovate](https://github.com/apps/renovate)
    GitHub app on the repository (its owner does, once). From then on it lands
    the week's updates on `main` by itself, each as one `build` commit once CI
    is green on its branch (`.github/renovate.json5`, explained in
    `docs/ARCHITECTURE.md`). It pushes to `main` as everyone else does, so
    `main` must not require pull requests. Until it is installed, nothing
    moves the dependencies.

## itos, pinned

itos is a dev dependency pinned to one release: `package.json` names the
release tarball's URL and the lockfile holds its integrity, so a tarball
replaced under that URL fails every later install. `tools/bin/itos` runs the
installed bin; the hooks, CI and the ledger call that path, whatever
implements itos. To move to another release, check its tarball against the
hash its `checksums.txt` lists, then add its URL, as itos's README says
under "Install":

```sh
version=<the release>
url="https://github.com/donvargax/itos/releases/download/v$version/itos-$version.tgz"
curl -fsSLO "$url"
echo "<the hash in the release's checksums.txt>  itos-$version.tgz" | sha256sum -c -
vp add -D "$url"
```

Then follow the release notes' upgrading steps, and run
`tools/bin/itos version --check` and `tools/bin/itos config check`.
Renovate leaves it alone (`ignoreDeps` in `.github/renovate.json5`), so a
move is always this one.

## Licence

The template is [0BSD](LICENSE). itos, installed from its release and not
carried here, is AGPL-3.0.
