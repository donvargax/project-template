// What the self-tests share: a shell without the caller's git or CI
// environment, and itos's own answers read from its command line (the
// package ships no module to import).
import { spawnSync } from "node:child_process";

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
export function sh(command: string, options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): Run {
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
	const run = sh(`tools/bin/itos ci plan ${args.map(word).join(" ")} --json`, { cwd });
	if (run.status !== 0) throw new Error(`itos ci plan ${args.join(" ")} failed:\n${run.output}`);
	return JSON.parse(run.stdout) as Plan;
}

// The plan's one run of the scenarios: the scenario kind's `run.whole`, or its
// `run.select` with the merged pattern (itos.yaml's `tests.scenario.run`).
const E2E = "vp run e2e";
export const isE2eRun = (step: string) => step === E2E || step.startsWith(`${E2E} --grep `);
export const e2eStep = (p: Plan) => p.steps.find(isE2eRun);
