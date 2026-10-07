// What the self-tests share: a shell without the caller's git or CI
// environment, and itos's own answers read from its command line (itos is a
// binary on the PATH, with no module to import).
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";

// Hooks export GIT_DIR and friends, and CI changes what Playwright lists and
// what itos plans.
export const cleanEnv = (): NodeJS.ProcessEnv =>
	Object.fromEntries(
		Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_") && k !== "CI"),
	);

export interface Run {
	status: number;
	stdout: string;
	output: string;
}
// An absent or undefined `cwd` runs in the caller's directory, as spawnSync's
// does: callers hand on a `cwd?` of their own.
export function sh(
	command: string,
	options: { cwd?: string | undefined; env?: NodeJS.ProcessEnv } = {},
): Run {
	const run = spawnSync("sh", ["-c", command], {
		cwd: options.cwd,
		env: options.env ?? cleanEnv(),
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});
	return { status: run.status ?? 1, stdout: run.stdout, output: `${run.stdout}${run.stderr}` };
}

// `git <command>` in that environment, its output trimmed; a failure throws.
export const gitIn =
	(env: NodeJS.ProcessEnv, cwd?: string) =>
	(command: string): string => {
		const run = sh(`git ${command}`, { env, cwd });
		if (run.status !== 0) throw new Error(`git ${command} failed:\n${run.output}`);
		return run.stdout.trim();
	};

// A worktree of the current tree at `scratch`, detached at HEAD: every tracked
// edit and the untracked files a gate could run are copied in, and the
// checkout's node_modules linked. Nothing here touches the checkout.
export function worktreeOfCurrentTree(root: string, scratch: string, env: NodeJS.ProcessEnv) {
	gitIn(env, root)(`worktree add -q --detach ${word(scratch)} HEAD`);
	const diff = sh("git diff HEAD --binary", { env, cwd: root }).stdout;
	if (diff.trim()) {
		const applied = spawnSync("git", ["apply", "--whitespace=nowarn", "-"], {
			cwd: scratch,
			env,
			input: diff,
			encoding: "utf8",
		});
		if (applied.status !== 0)
			throw new Error(`could not copy the working tree:\n${applied.stderr}`);
	}
	const untracked =
		"git ls-files --others --exclude-standard -- tools .vite-hooks src e2e features";
	for (const file of sh(untracked, { env, cwd: root }).stdout.split("\n").filter(Boolean)) {
		mkdirSync(dirname(join(scratch, file)), { recursive: true });
		copyFileSync(join(root, file), join(scratch, file));
	}
	symlinkSync(join(root, "node_modules"), join(scratch, "node_modules"));
}

// A shell word, quoted for sh.
export const word = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

// One entry of a plan's order: a CI step, or a named task's check.
export interface Planned {
	step?: string;
	check?: { task: string; index: number; command: string };
	cost: "static" | "late";
	action?: "run" | "covered" | "merged" | "nightly";
}
export interface Plan {
	prose: boolean;
	steps: string[];
	order: Planned[];
	tasks: string[];
}

// `itos ci plan`, running nothing: `[from, to]`, or `--nightly` / `--whole`.
export function plan(args: string[], cwd?: string): Plan {
	const run = sh(`itos ci plan ${args.map(word).join(" ")} --json`, { cwd });
	if (run.status !== 0) throw new Error(`itos ci plan ${args.join(" ")} failed:\n${run.output}`);
	return JSON.parse(run.stdout) as Plan;
}

// The plan's one run of the scenarios: the scenario kind's `run.whole`, or its
// `run.select` with the merged pattern (itos.yaml's `tests.scenario.run`).
const E2E = "vp run e2e";
export const isE2eRun = (step: string) => step === E2E || step.startsWith(`${E2E} --grep `);
export const e2eStep = (p: Plan) => p.steps.find(isE2eRun);
