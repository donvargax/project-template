// The runtime of every action the workflows use (T-038): each `uses:` of a
// step in .github/workflows/*.yml (or *.yaml) that names a remote action,
// `owner/repo[/path]@ref`, has its action.yml (or action.yaml) read at the
// commit it pins, through GitHub's API (`gh api`, which needs GH_TOKEN or a
// signed-in gh), and fails when its `runs.using` is a Node runtime older than
// 24, the oldest GitHub still runs without forcing it onto a newer one. A
// composite or a docker action passes. Prints one line per action, with its
// runtime, and each failure as `<workflow>: <action>@<sha> runs on <using>`;
// exits 1 on a failure, 2 when an action could not be read.
//
// Out of scope: a local action (`./…`) and a docker image (`docker://…`),
// which are not fetched; a composite action's own nested `uses:`, which run
// under the composite's name but are not read here; and a job's `uses:`, a
// reusable workflow rather than an action, whose own steps are not read.
//
//   node tools/action-runtimes.ts     every workflow under .github/workflows
//
// The parsing and the verdict are pure, and the network is handed in as a
// function, so the unit tests (action-runtimes.test.ts) hand in a fake.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "yaml";

// The oldest Node runtime an action may target.
export const OLDEST_NODE = 24;

// A remote action, as a step's `uses:` names it.
export interface Action {
	repo: string; // owner/repo
	path: string; // the folder of its action.yml inside the repository, "" at the root
	ref: string; // the commit (or, unpinned, the tag or branch) it is read at
}

// Where a workflow uses an action.
export interface Use extends Action {
	workflow: string;
	uses: string;
}

// A step's `uses:` read as a remote action; undefined for a local action or a
// docker image, which are not fetched.
export function readUses(uses: string): Action | undefined {
	if (uses.startsWith("./") || uses.startsWith("docker://")) return undefined;
	const match = /^([^/@\s]+\/[^/@\s]+)((?:\/[^@\s]+)?)@(\S+)$/.exec(uses);
	if (!match) return undefined;
	return { repo: match[1]!, path: match[2]!.replace(/^\/|\/$/g, ""), ref: match[3]! };
}

// The remote actions a workflow's steps use, and what in it could not be read.
export function actionsIn(workflow: string, text: string): { uses: Use[]; problems: string[] } {
	let data: unknown;
	try {
		data = parse(text);
	} catch (error) {
		return { uses: [], problems: [`${workflow} is not YAML: ${String(error)}`] };
	}
	const jobs = (data as { jobs?: unknown } | null)?.jobs;
	if (jobs === null || typeof jobs !== "object" || Array.isArray(jobs))
		return { uses: [], problems: [`${workflow} has no jobs`] };
	const found: { uses: Use[]; problems: string[] } = { uses: [], problems: [] };
	for (const [name, job] of Object.entries(jobs)) {
		const steps = (job as { steps?: unknown } | null)?.steps;
		if (!Array.isArray(steps)) continue;
		for (const step of steps as unknown[]) {
			const uses = (step as { uses?: unknown } | null)?.uses;
			if (uses !== undefined) readStep(workflow, name, uses, found);
		}
	}
	return found;
}

// A step's `uses:`, into what the workflow uses or what could not be read.
function readStep(
	workflow: string,
	job: string,
	uses: unknown,
	found: { uses: Use[]; problems: string[] },
) {
	const local = typeof uses === "string" && /^(?:\.\/|docker:\/\/)/.test(uses);
	const action = typeof uses === "string" ? readUses(uses) : undefined;
	if (action) found.uses.push({ ...action, workflow, uses: String(uses) });
	else if (!local)
		found.problems.push(`${workflow}: job ${job} uses ${JSON.stringify(uses)}, not an action`);
}

// An action's `runs.using`, from its action.yml; undefined when it has none.
export function runsUsing(text: string): string | undefined {
	let data: unknown;
	try {
		data = parse(text);
	} catch {
		return undefined;
	}
	const using = (data as { runs?: { using?: unknown } } | null)?.runs?.using;
	return typeof using === "string" ? using : undefined;
}

// Whether a runtime is a Node one older than the oldest allowed. A composite
// or a docker action is not.
export function tooOld(using: string): boolean {
	const node = /^node(\d+)$/i.exec(using.trim());
	return node !== null && Number(node[1]) < OLDEST_NODE;
}

// What reading an action's action.yml found: its text, nothing there (no such
// file at that ref), or an error reaching it.
export type Fetched = { text: string } | { missing: true } | { error: string };

// The network's edge: reads one file of a repository at a ref.
export type Fetch = (repo: string, file: string, ref: string) => Fetched;

export interface Verdict {
	// One line per action read: `<action>@<ref>: <using>`.
	read: string[];
	// The actions on a Node runtime older than the oldest allowed.
	failures: string[];
	// What could not be read: a workflow, or an action's action.yml.
	problems: string[];
}

const label = (action: Action) => `${action.repo}${action.path ? `/${action.path}` : ""}`;

// The verdict over the workflows, each action fetched once.
export function check(workflows: { file: string; text: string }[], fetch: Fetch): Verdict {
	const verdict: Verdict = { read: [], failures: [], problems: [] };
	const runtimes = new Map<string, string | undefined>();
	for (const { file, text } of workflows) {
		const { uses, problems } = actionsIn(file, text);
		verdict.problems.push(...problems);
		for (const use of uses) {
			const key = `${label(use)}@${use.ref}`;
			if (!runtimes.has(key)) {
				const using = runtimeOf(use, fetch, verdict.problems);
				runtimes.set(key, using);
				if (using !== undefined) verdict.read.push(`${key}: ${using}`);
			}
			const using = runtimes.get(key);
			if (using !== undefined && tooOld(using))
				verdict.failures.push(
					`${use.workflow}: ${key} runs on ${using}, older than node${OLDEST_NODE}`,
				);
		}
	}
	return verdict;
}

function runtimeOf(action: Action, fetch: Fetch, problems: string[]): string | undefined {
	const where = `${label(action)}@${action.ref}`;
	for (const name of ["action.yml", "action.yaml"]) {
		const fetched = fetch(action.repo, action.path ? `${action.path}/${name}` : name, action.ref);
		if ("missing" in fetched) continue;
		if ("error" in fetched) {
			problems.push(`${where}: ${name} could not be read: ${fetched.error}`);
			return undefined;
		}
		const using = runsUsing(fetched.text);
		if (using === undefined) problems.push(`${where}: ${name} names no runs.using`);
		return using;
	}
	problems.push(`${where}: no action.yml or action.yaml at that ref`);
	return undefined;
}

// The edge: GitHub's contents API through gh, the file's raw text.
const viaGh: Fetch = (repo, file, ref) => {
	const run = spawnSync(
		"gh",
		[
			"api",
			"-H",
			"Accept: application/vnd.github.raw+json",
			`repos/${repo}/contents/${file}?ref=${encodeURIComponent(ref)}`,
		],
		{ encoding: "utf8", maxBuffer: 16 << 20 },
	);
	if (run.status === 0) return { text: run.stdout };
	const error = (run.stderr || String(run.error ?? `gh exited ${run.status}`)).trim();
	return /HTTP 404/.test(error) ? { missing: true } : { error };
};

if (import.meta.main) {
	const folder = resolve(import.meta.dirname, "..", ".github", "workflows");
	const workflows = readdirSync(folder)
		.filter((name) => /\.ya?ml$/.test(name))
		.sort()
		.map((name) => ({
			file: `.github/workflows/${name}`,
			text: readFileSync(join(folder, name), "utf8"),
		}));
	const verdict = check(workflows, viaGh);
	for (const line of verdict.read) console.log(line);
	for (const problem of verdict.problems) console.error(`action-runtimes: ${problem}`);
	for (const failure of verdict.failures) console.error(failure);
	if (!verdict.failures.length && !verdict.problems.length)
		console.log(
			`Every action the workflows use runs on node${OLDEST_NODE} or newer, or is not a Node action`,
		);
	process.exit(verdict.problems.length ? 2 : verdict.failures.length ? 1 : 0);
}
