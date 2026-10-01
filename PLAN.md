# <Project> — plan

<What the project is, in a paragraph: what it makes, for whom, and what it
deliberately does not do.>

This file holds the decisions and the order of the work. How the code is
actually put together is `docs/ARCHITECTURE.md`; what has been built, and
why, is the history (`vp run changelog`); who works which phase is
`docs/PHASES.md`, and the open work is `docs/work-items.yaml`.

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
`vp run task --phase <n>` reports every task done.

### Phase 0: scaffold

The template's setup: the Vite+ project, the gates, the hooks, itos and CI
(`tasks/phase-0.yaml`).

- **Usable:** the page opens.

### Phase 1: the pinned task tool and the layout

The template's own too: itos pinned as a release, the feature files at the
root, the work registry beside the ledger, verification that starts at
`commits.since`, and setup checks that hold in any project
(`tasks/phase-1.yaml`). No scenario changes.

- **Usable:** the page opens, as in phase 0.

### Phase 2: <name>

<What it builds, its slices in order, and what each slice leaves usable.
The scenarios live in `features/`, tagged `@phase-2`, and the tasks in
`tasks/phase-2.yaml`.>

- **Usable:** <…>

## 5. Working rules

The rules for agents are `AGENTS.md` (implementing) and
`docs/ORCHESTRATING.md` (coordinating); the rules a command can check are
`itos.yaml`. <Anything specific to this project that neither holds: what an
agent may use as a reference, what it must never overwrite.>

## 6. Risks and open points

<Each risk with what would show it early; each open point with a
recommendation.>
