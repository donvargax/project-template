# <Project> — plan

<What the project is, in a paragraph: what it makes, for whom, and what it
deliberately does not do.>

This file holds the decisions and the order of the work. How the code is
actually put together is `docs/ARCHITECTURE.md`; what has been built, and
why, is the history (`vp run changelog`); who works which phase is
`docs/PHASES.md`, and the open work is `tasks/work-items.yaml`.

---

## 1. References

<The material the work is measured against: sources, studies, specifications,
prior art. Only what is listed here is a reference; an agent never takes
anything else as an example.>

## 2. Decisions

<One row per decision that shapes the work. A decision changed later is
updated here, with when and why, not left beside its replacement.>

| Topic   | Decision |
| ------- | -------- |
| Scope   | <…>      |
| Stack   | <…>      |
| Storage | <…>      |
| Gates   | <…>      |

## 3. Architecture

<The intended shape: the modules, what each owns, the boundaries between
them, and the data that crosses them. `docs/ARCHITECTURE.md` records what
was built; this section records what was decided and why.>

```
<project>/
  src/        <…>
  features/   the scenarios: the specification, in Gherkin
  e2e/        the harness that runs them: steps and page objects
  tasks/      the ledger: non-feature work and its checks
  tools/      itos and the project's own tools
```

## 4. Phases

Each phase ends with something a user can open and use while the next is
being built. A phase is done when all its scenarios pass without `@wip` and
`tools/bin/itos task --phase <n>` reports every task done.

### Phase 0: scaffold

The template's setup: the Vite+ project, the gates, the hooks, itos and CI
(`tasks/phase-0.yaml`).

- **Usable:** the page opens.

### Phase 1: the pinned task tool and the layout

The template's own too: itos pinned as a release, the feature files at the
root, the work registry beside the ledger, verification that starts at
`commits.since`, setup checks that hold in any project, and each itos release
as it comes, by its notes' "Upgrading" steps (`tasks/phase-1.yaml`). No
scenario changes.

- **Usable:** the page opens, as in phase 0.

### Phase 2: code design and the supply chain

The template's own too (`tasks/phase-2.yaml`). The rules code is written
by, in `AGENTS.md`'s "Code design", each held by a gate where a command can
decide it: a feature is a vertical slice, one folder under `src/` with the
feature's file and its tests, every layer inside that file until it grows
and then split into more features, never into layer folders; a slice reaches
another only through that slice's feature file; no mocks, a fake handed in
only at a true outer boundary; unit tests beside the code they test, for its
pure part; property-based tests where an invariant says more than examples.
And the supply chain: the Node version pinned, stricter TypeScript, the
workflows' actions pinned to commits, dependency updates landing on `main`
(Renovate, since the work is trunk-based), a vulnerability scan every night.
Integration tests, mutation testing and a project generator are ideas in the
registry. No scenario changes.

- **Usable:** the page opens, as in phase 0, from the demo moved into a
  slice.

### Phase 3: code design learned downstream

The template's own too (`tasks/phase-3.yaml`), from what a project made from
it met on 2026-10-01: a task's checks prove the project, never itos; a rule
over several boolean states is written once and table-tested; a lint warning
on a file over 400 lines, as a prompt to look at its responsibilities; and a
ratchet for adopting a code design rule on code that breaks it; and a
slice's logic never touches the browser, which lives only in the files a
project names as its edge (the composition root, its framework's view files,
infrastructure slices that each wrap one browser API), so the template stays
framework-neutral. No scenario changes.

- **Usable:** the page opens, as in phase 0.

### Phase <n>: <name>

<A project's own phases follow the template's. What each builds, its slices
in order, and what each slice leaves usable. The scenarios live in
`features/`, tagged `@phase-<n>`, and the tasks in `tasks/phase-<n>.yaml`.>

- **Usable:** <…>

## 5. Working rules

The rules for agents are `AGENTS.md` (implementing) and
`docs/ORCHESTRATING.md` (coordinating); the rules a command can check are
`itos.yaml`. <Anything specific to this project that neither holds: what an
agent may use as a reference, what it must never overwrite.>

## 6. Risks and open points

<Each risk with what would show it early; each open point with a
recommendation.>
