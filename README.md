# Project template

A starting point for a project that works by its tasks, its scenarios and its
gates: a small [Vite+](https://viteplus.dev) app with unit tests and
Gherkin scenarios, a task ledger whose every task is proven by commands, and
commit rules, git hooks and CI that hold every commit to them. The rules live
in one file, `itos.yaml`, read by **itos**, the task tool carried in
`tools/itos/`.

What it gives a new project from its first commit:

- **Commits that name their work.** Conventional Commits, each `feat` or `fix`
  naming the scenarios it turns green (`Scenarios: @ID-…`) and every other
  type the task it belongs to (`Task: T-…`); each type may touch only certain
  paths. The commit-msg hook enforces it, and CI re-checks every pushed
  commit.
- **A ledger of tasks with executable checks** (`tasks/`): a task is done when
  its `done_when` commands pass, `vp run task <id>` says so.
- **Gates that run themselves.** pre-commit formats, lints, runs the unit
  tests the change reaches and the audit; pre-push runs the unit tests the
  pushed commits reach; CI runs everything from the last green run, in cost
  order, with one E2E run over the smoke set and what the commits name; a
  nightly runs every scenario and opens an issue when it goes red.
- **Work routing** (`docs/work-items.yaml`, `CONTRIBUTORS.md`): `vp run work`
  says what the person a session works for can start next.
- **A changelog from the commits**: `vp run changelog`.

`tasks/README.md` and `e2e/features/README.md` state the rules;
`tools/bin/itos --help` lists the tool's commands.

## Create a project from it

On GitHub, **Use this template → Create a new repository**, or:

```sh
gh repo create <owner>/<name> --template donvargax/project-template --private --clone
```

## First steps in the new project

1. **Install.** `vp install` installs the dependencies and, through
   `prepare`, the git hooks (`vp config`). Install the browser for the
   scenarios once: `vp exec playwright install chromium`.
2. **Rename.** Set `name` in `package.json`, the page's `<title>` in
   `index.html`, and this README's title and text.
3. **Contributors.** Put the project's people in `CONTRIBUTORS.md` (their
   GitHub logins are the owners `docs/work-items.yaml` names), and set the
   phase owners in `docs/work-items.yaml` and `docs/PHASES.md`.
4. **Licence.** The template is 0BSD (`LICENSE`): replace it with the
   project's own. `tools/itos/LICENSE` is the task tool's (AGPL-3.0) and
   stays with it.
5. **Ledger.** `tasks/phase-0.yaml` holds the template's own setup tasks; keep
   them as the project's phase 0, and add the project's phases after it.
6. **Check.** `vp run task --phase 0` runs every setup task's checks; push to
   `main` and CI runs on GitHub Actions with no secrets to configure.

## Licence

The template is [0BSD](LICENSE). The task tool in `tools/itos/` is
[AGPL-3.0](tools/itos/LICENSE).
