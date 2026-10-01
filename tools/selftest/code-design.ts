// The code design gates refuse what AGENTS.md's "Code design" forbids and let
// through what it allows. Run in a scratch worktree of the current tree
// (uncommitted edits included), so nothing here touches the checkout:
//
//   - lint (tools/lint/code-design.ts, which vite.config.ts loads and
//     `vp check` runs) refuses a slice, or src/main.ts, reaching another
//     slice's inner file by import, re-export, dynamic import or the folder
//     itself, and allows another slice's feature file and a slice's own files;
//   - the static check (tools/code-design.ts) refuses a file directly under
//     src/, of any kind, and allows src/main.ts beside the slice folders;
//   - the pre-commit hook runs that check, and CI runs both gates as steps.
//
// A case is the files it writes over the base tree, the gate that judges
// them, and whether the gate must refuse them, naming what (`says`). T-030
// (no mocks, lint) and T-031 (unit tests beside their code, the static
// check) add their cases to `cases`; a gate that is new adds itself to
// `gates`.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { cleanEnv, gitIn, plan, sh, worktreeOfCurrentTree, type Run } from "./cli.ts";

type Gate = "lint" | "static" | "pre-commit";
interface Case {
	name: string;
	gate: Gate;
	files: Record<string, string>;
	// What the gate must say when it refuses; absent, the gate must allow.
	says?: string;
}

// A slice of the scratch tree: its feature file and one inner file.
const slice = (name: string, feature = `export const ${name} = 1;\n`) => ({
	[`src/${name}/${name}.ts`]: feature,
	[`src/${name}/inner.ts`]: "export const inner = 1;\n",
});
const reachesIn = "code-design(slice-boundary)";

const cases: Case[] = [
	// The slice boundary (T-029), lint.
	{
		name: "a slice imports another slice's inner file",
		gate: "lint",
		files: {
			...slice("alpha"),
			...slice(
				"beta",
				'import { inner } from "../alpha/inner.ts";\n\nexport const beta = inner;\n',
			),
		},
		says: reachesIn,
	},
	{
		name: "a slice re-exports another slice's inner file",
		gate: "lint",
		files: {
			...slice("alpha"),
			...slice("beta", 'export { inner } from "../alpha/inner.ts";\n'),
		},
		says: reachesIn,
	},
	{
		name: "a slice imports another slice's inner file when it runs",
		gate: "lint",
		files: {
			...slice("alpha"),
			...slice("beta", 'export const beta = () => import("../alpha/inner.ts");\n'),
		},
		says: reachesIn,
	},
	{
		name: "a slice imports another slice's folder (its index file)",
		gate: "lint",
		files: {
			...slice("alpha"),
			"src/alpha/index.ts": 'export { alpha } from "./alpha.ts";\n',
			...slice("beta", 'import { alpha } from "../alpha";\n\nexport const beta = alpha;\n'),
		},
		says: reachesIn,
	},
	{
		name: "src/main.ts imports a slice's inner file",
		gate: "lint",
		files: {
			...slice("alpha"),
			"src/main.ts":
				'import { inner } from "./alpha/inner.ts";\n\ndocument.title = String(inner);\n',
		},
		says: reachesIn,
	},
	{
		name: "a slice imports another slice's feature file",
		gate: "lint",
		files: {
			...slice("alpha"),
			...slice(
				"beta",
				'import { alpha } from "../alpha/alpha.ts";\n\nexport const beta = alpha;\n',
			),
		},
	},
	{
		name: "a slice imports its own inner file",
		gate: "lint",
		files: slice("alpha", 'import { inner } from "./inner.ts";\n\nexport const alpha = inner;\n'),
	},
	{
		name: "src/main.ts imports a slice's feature file",
		gate: "lint",
		files: {
			...slice("alpha"),
			"src/main.ts":
				'import { alpha } from "./alpha/alpha.ts";\n\ndocument.title = String(alpha);\n',
		},
	},
	// What src/ holds (T-029), the static check.
	{
		name: "a module directly under src/",
		gate: "static",
		files: { "src/foo.ts": "export const foo = 1;\n" },
		says: "src/foo.ts is outside a slice",
	},
	{
		name: "a file lint never reads, directly under src/",
		gate: "static",
		files: { "src/style.css": "h1 { color: teal; }\n" },
		says: "src/style.css is outside a slice",
	},
	{
		name: "src/main.ts beside a new slice folder",
		gate: "static",
		files: slice("alpha"),
	},
	{
		name: "a module directly under src/, at commit",
		gate: "pre-commit",
		files: { "src/foo.ts": "export const foo = 1;\n" },
		says: "src/foo.ts is outside a slice",
	},
];

const root = resolve(".");
const scratch = mkdtempSync(join(tmpdir(), "code-design-selftest-"));
const env = Object.assign(cleanEnv(), {
	GIT_AUTHOR_NAME: "code design self-test",
	GIT_AUTHOR_EMAIL: "selftest@localhost",
	GIT_COMMITTER_NAME: "code design self-test",
	GIT_COMMITTER_EMAIL: "selftest@localhost",
});
const git = gitIn(env, scratch);
const run = (command: string) => sh(command, { cwd: scratch, env });

// How each gate judges a case's files, once they are written and staged.
const gates: Record<Gate, (files: string[]) => Run> = {
	lint: (files) => run(`vp lint ${files.filter((f) => f.endsWith(".ts")).join(" ")}`),
	static: () => run("node tools/code-design.ts"),
	"pre-commit": () => run("sh .vite-hooks/pre-commit"),
};

const problems: string[] = [];
const lines: string[] = [];
try {
	worktreeOfCurrentTree(root, scratch, env);
	git("add -A");
	const base = git(`commit-tree ${git("write-tree")} -p HEAD -m "code design self-test base"`);
	git(`reset -q --hard ${base}`);

	// CI runs both gates on every push, whatever the commits name.
	const steps = plan(["--whole"], scratch).steps;
	for (const step of ["vp check", "node tools/code-design.ts"])
		if (!steps.includes(step)) problems.push(`CI no longer runs \`${step}\` on every push`);

	for (const c of cases) {
		git(`reset -q --hard ${base}`);
		git("clean -fdq -- src");
		for (const [file, text] of Object.entries(c.files)) {
			mkdirSync(dirname(join(scratch, file)), { recursive: true });
			writeFileSync(join(scratch, file), text);
		}
		git("add -A");
		const result = gates[c.gate](Object.keys(c.files));
		const refused = result.status !== 0;
		const ok = c.says ? refused && result.output.includes(c.says) : !refused;
		lines.push(
			`${ok ? "ok  " : "FAIL"} ${c.gate.padEnd(10)} ${c.says ? "refuses" : "allows "} ${c.name}`,
		);
		if (!ok)
			problems.push(
				c.says
					? `${c.gate} should refuse ${c.name}, saying ${JSON.stringify(c.says)}:\n${result.output}`
					: `${c.gate} should allow ${c.name}:\n${result.output}`,
			);
	}
} finally {
	sh(`git worktree remove --force ${scratch}`, { cwd: root, env });
	rmSync(scratch, { recursive: true, force: true });
}

console.log(lines.join("\n"));
for (const problem of problems) console.error(`\nFAIL ${problem}`);
console.log(
	problems.length
		? `\n${problems.length} code design check(s) failed`
		: `\nThe code design gates refuse and allow what they should (${cases.length} cases)`,
);
process.exit(problems.length ? 1 : 0);
