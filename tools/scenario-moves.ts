// The scenario kind's range check (itos.yaml's `tests.scenario.range_checks`),
// the project's own: the itos package ships its command line, not this rule,
// so the template keeps it here.
//
// The rule for a commit outside feat and fix (the check's `except_types`): it
// may move scenarios between feature files, create feature files and delete
// the ones left empty, provided every live scenario keeps its ID, name, tags
// and steps exactly, none is lost or added, and a file's header and
// Background stay as they were. A @wip scenario may still be added, changed or
// removed: that is how a specification lands before its implementation. A
// rename the project allows outside feat and fix is listed in ALLOWED_RENAMES,
// by ID and new name. Comment lines (`#`) are not part of a scenario's ID,
// name, tags or steps, nor of a header, so they are dropped before anything is
// compared: a reason may be written beside a scenario in any commit.
//
// Each tree is read with the scenario kind of that tree's own itos.yaml (its
// root, ID pattern and tags), so a commit that moves the feature files to a
// new root and changes the root with them moves every scenario unchanged.
//
//   node tools/scenario-moves.ts               HEAD against the index, as the
//   node tools/scenario-moves.ts --type <t>    commit-msg hook checks it (with
//                                              --type, worded for a <t> commit)
//   node tools/scenario-moves.ts <from> <to>   every commit in from..to of a
//                                              type the rule applies to (CI),
//                                              less commits.since and its
//                                              ancestors
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

const KIND = "scenario";
const CHECK = "scenario-moves";
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const SCENARIO_LINE = /^(\s*Scenario(?: Outline)?:\s*)(.*?)\s*$/;
const COMMENT = /^\s*#/;

// A live scenario's name may not change outside feat and fix; these renames
// are allowed anyway, for exactly this ID and new name: `"ID-…": "the new
// name"`. Each one is a decision the project owner takes; record why in the
// task that allows it.
const ALLOWED_RENAMES: Record<string, string> = {};

function git(...args: string[]): string {
	const run = spawnSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
	if (run.status !== 0) throw new Error(`git ${args.join(" ")}: ${run.stderr.trim()}`);
	return run.stdout;
}

// A file as a tree holds it: a commit, or "index" for the staged tree.
const show = (tree: string, file: string) =>
	git("show", tree === "index" ? `:${file}` : `${tree}:${file}`);

interface Policy {
	commits?: { since?: string };
	tests?: Record<
		string,
		{
			root?: string;
			id?: string;
			tag_prefix?: string;
			wip_tag?: string;
			range_checks?: { name?: string; except_types?: string[] }[];
		}
	>;
}
const CONFIG = process.env.ITOS_CONFIG || "itos.yaml";
const policy = (text: string) => (parse(text) ?? {}) as Policy;
const working = () => policy(readFileSync(CONFIG, "utf8"));

// The config a tree carried; the working tree's when it has none to read.
function policyAt(tree: string): Policy {
	try {
		return policy(show(tree, CONFIG));
	} catch {
		return working();
	}
}

export interface KindOptions {
	root: string;
	id: string;
	tag_prefix: string;
	wip_tag: string;
}
const kindOf = (p: Policy): KindOptions => {
	const k = p.tests?.[KIND] ?? {};
	return {
		root: k.root ?? "features",
		id: k.id ?? "ID-[A-Z]+-\\d+",
		tag_prefix: k.tag_prefix ?? "@",
		wip_tag: k.wip_tag ?? "@wip",
	};
};

// The text without its comment lines, which the rule never compares.
const withoutComments = (text: string) =>
	text
		.split("\n")
		.filter((l) => !COMMENT.test(l))
		.join("\n")
		.trimEnd();

const quote = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// A feature file read as itos's Gherkin adapter reads it: a scenario is the
// block from a tag line holding `<tag_prefix><id>` to the next such line; the
// header is everything before the first, the Background included; a block is
// wip when its tag line holds the wip tag, a file when a tag line of its
// header does.
function parseFeature(text: string, options: KindOptions) {
	const idTag = new RegExp(`${quote(options.tag_prefix)}(${options.id})\\b`);
	const wipTag = new RegExp(`(^|\\s)${quote(options.wip_tag)}(\\s|$)`);
	const blocks = new Map<string, { wip: boolean; body: string }>();
	const header: string[] = [];
	let current: { id: string; lines: string[] } | null = null;
	const flush = () => {
		if (current)
			blocks.set(current.id, {
				wip: wipTag.test(current.lines[0]!),
				body: current.lines.join("\n").trimEnd(),
			});
	};
	for (const line of text.split("\n")) {
		const id = idTag.exec(line)?.[1];
		if (id && line.trim().startsWith("@")) {
			flush();
			current = { id, lines: [line] };
		} else if (current) current.lines.push(line);
		else header.push(line);
	}
	flush();
	const fileWip = header.some((line) => line.trim().startsWith("@") && wipTag.test(line));
	return { header: header.join("\n").trimEnd(), fileWip, blocks };
}

export interface Scenario {
	file: string;
	wip: boolean;
	// The block as written, less its comment lines: its tag line, its Scenario
	// line and its steps.
	body: string;
}
export interface FeatureSet {
	// Each file's header: everything before its first scenario, the Background
	// included.
	headers: Map<string, string>;
	scenarios: Map<string, Scenario>;
}

// The feature files given as { path: text }, read into one set, by the
// working tree's scenario kind unless options are given.
export function readFeatures(
	files: Record<string, string>,
	options: KindOptions = kindOf(working()),
): FeatureSet {
	const set: FeatureSet = { headers: new Map(), scenarios: new Map() };
	for (const [file, text] of Object.entries(files)) {
		const { header, fileWip, blocks } = parseFeature(text, options);
		set.headers.set(file, withoutComments(header));
		for (const [id, block] of blocks)
			set.scenarios.set(id, { file, wip: fileWip || block.wip, body: withoutComments(block.body) });
	}
	return set;
}

// The feature files of a tree (a commit, or "index"), under the root that
// tree's itos.yaml names. A tree that cannot be read (no HEAD yet) is empty.
function featureSet(tree: string): FeatureSet {
	const options = kindOf(policyAt(tree));
	const files: Record<string, string> = {};
	try {
		const listed =
			tree === "index"
				? git("ls-files", "--cached", "--", options.root)
				: git("ls-tree", "-r", "--name-only", tree, "--", options.root);
		for (const file of listed.split("\n"))
			if (file.endsWith(".feature")) files[file] = show(tree, file);
	} catch {
		return readFeatures({}, options);
	}
	return readFeatures(files, options);
}

// Whether `after` is `before` with its Scenario line's name changed to `name`
// and nothing else.
function renamedTo(before: string, after: string, name: string): boolean {
	const a = before.split("\n");
	const b = after.split("\n");
	if (a.length !== b.length) return false;
	let renamed = false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] === b[i]) continue;
		const from = SCENARIO_LINE.exec(a[i]!);
		const to = SCENARIO_LINE.exec(b[i]!);
		if (renamed || !from || !to || from[1] !== to[1] || to[2] !== name) return false;
		renamed = true;
	}
	return renamed;
}

const has = (set: FeatureSet, file: string) =>
	[...set.scenarios.values()].some((s) => s.file === file && !s.wip);

// A scenario of the later set against its earlier self, if any.
function scenarioProblem(
	id: string,
	was: Scenario | undefined,
	now: Scenario,
	renames: Record<string, string>,
): string | undefined {
	if (!was) return now.wip ? undefined : `adds the live scenario ${id} to ${now.file}`;
	if (was.body === now.body || now.wip) return undefined;
	const allowed = renames[id];
	if (allowed && renamedTo(was.body, now.body, allowed)) return undefined;
	return `changes the live scenario ${id} in ${now.file}: a moved scenario keeps its ID, name, tags and steps exactly`;
}

// A file of the later set whose header changed while it held a live scenario.
function headerProblem(file: string, before: FeatureSet, after: FeatureSet): string | undefined {
	const was = before.headers.get(file);
	if (was === undefined || was === after.headers.get(file)) return undefined;
	if (!has(before, file) && !has(after, file)) return undefined;
	return `changes the header or Background of ${file}`;
}

// What breaks the rule between two sets, each problem a phrase for "a <type>
// commit …". `renames` is the allowed renames, ALLOWED_RENAMES unless a test
// gives its own.
export function moveProblems(
	before: FeatureSet,
	after: FeatureSet,
	renames: Record<string, string> = ALLOWED_RENAMES,
): string[] {
	const problems: string[] = [];
	for (const [id, now] of after.scenarios) {
		const problem = scenarioProblem(id, before.scenarios.get(id), now, renames);
		if (problem) problems.push(problem);
	}
	for (const [id, was] of before.scenarios)
		if (!after.scenarios.has(id) && !was.wip)
			problems.push(`loses the scenario ${id} of ${was.file}`);
	for (const file of after.headers.keys()) {
		const problem = headerProblem(file, before, after);
		if (problem) problems.push(problem);
	}
	return problems;
}

// The commits of a range, oldest first; an empty or all-zero start (a new
// branch) means everything up to `to`. commits.since and its ancestors are
// left out, as itos verify leaves them.
function commitsIn(from: string, to: string): string[] {
	const since = working().commits?.since;
	const range = !from || /^0+$/.test(from) ? to : `${from}..${to}`;
	return git("rev-list", "--no-merges", "--reverse", range, ...(since ? [`^${since}`] : []))
		.split("\n")
		.filter(Boolean);
}

const typeOf = (message: string) => /^(\w+)/.exec(message)?.[1] ?? "";

// The commit types the rule leaves out: the range check's `except_types`.
const exempt = () =>
	working().tests?.[KIND]?.range_checks?.find((c) => c.name === CHECK)?.except_types ?? [
		"feat",
		"fix",
	];

function checkStaged(staged: string): number {
	const problems = moveProblems(featureSet("HEAD"), featureSet("index"));
	for (const p of problems) console.error(`  - ${staged} ${p}`);
	if (!problems.length) console.log("The staged feature files only move scenarios, if anything");
	return problems.length;
}

function checkRange(from: string, to: string): number {
	const commits = commitsIn(from, to);
	const skip = exempt();
	let checked = 0;
	let failed = 0;
	for (const sha of commits) {
		const message = git("log", "-1", "--format=%B", sha);
		const type = typeOf(message);
		if (skip.includes(type)) continue;
		checked++;
		let parent = EMPTY_TREE;
		try {
			parent = git("rev-parse", "--verify", "--quiet", `${sha}^`).trim();
		} catch {
			// A root commit: compared with the empty tree.
		}
		const problems = moveProblems(featureSet(parent), featureSet(sha));
		if (problems.length === 0) continue;
		failed++;
		console.error(`${sha.slice(0, 7)} ${message.split("\n")[0]}`);
		for (const p of problems) console.error(`  - a ${type} commit ${p}`);
	}
	console.log(
		`${checked - failed}/${checked} commits outside ${skip.join(" and ")} only move scenarios, if anything (${commits.length} in the range)`,
	);
	return failed;
}

if (import.meta.main) {
	const args = process.argv.slice(2);
	const failed =
		args[0] === "--type" || args.length === 0
			? checkStaged(args[0] === "--type" ? `a ${args[1]} commit` : "the index")
			: checkRange(args[0]!, args[1] ?? "HEAD");
	process.exit(failed ? 1 : 0);
}
