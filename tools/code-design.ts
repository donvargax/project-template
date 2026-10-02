// The code design rules lint cannot hold (AGENTS.md, "Code design"): rules
// about which files exist where, and lint sees only the files it lints; and
// the ratchet, which turns a rule off for the files a project lists while it
// adopts the rule on code that breaks it. Run by the pre-commit hook and as a
// CI step, over the files git tracks or has staged, so the hook judges what
// the commit carries and CI the pushed tree; a file left untracked is
// nobody's commit yet. Prints each problem, named `code-design(<rule>)` as
// lint names its own, and exits 1 when there is one. A rule is a name and a
// function from the file list to its problems: the next one is added to
// `rules`.
//
//   - slice-folders: src/ holds no file outside a slice folder but
//     src/main.ts, the composition root. (A slice reaching into another is
//     lint's: tools/lint/code-design.ts.)
//   - tests-beside-code: a unit test is <name>.test.ts beside the <name>.ts it
//     tests, in a slice under src/ or in tools/; a test file anywhere else,
//     spelled any other way vitest would run, or in a folder of tests, is
//     refused.
//   - ratchet: code-design-ratchet.yaml names every rule the gates hold, this
//     script's and lint's; each entry's file is there and still breaks its
//     rule (asked of lint with the list left out, for a lint rule), and its
//     work item is open; and no comment turns a code design rule off, or
//     every rule, since the list and mockBoundaries are the only ways a file
//     is let off one.
//
//   node tools/code-design.ts               the tree (pre-commit hook, CI step)
//   node tools/code-design.ts --staged      the ratchet's joining rule, HEAD
//                                           against the index (commit-msg hook)
//   node tools/code-design.ts <from> <to>   the same, for every commit of
//                                           from..to (CI's commit re-check),
//                                           less commits.since and its
//                                           ancestors
//
// The joining rule: a file joins a rule's list only in the commit that brings
// the rule into force, which is the first commit whose list names it; a rule
// any earlier commit named is in force, so taking a rule off the list and
// naming it again lets no file in. itos runs both forms as a range check
// (itos.yaml), so a commit made without the hooks is still judged in CI.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { parse } from "yaml";
import {
	bypasses,
	components,
	disables,
	joined,
	parseRatchet,
	RATCHET,
	scripts,
	type Entry,
	type Ratchet,
} from "./code-design-ratchet.ts";
import plugin from "./lint/code-design.ts";

const root = resolve(import.meta.dirname, "..");

interface Problem {
	file: string;
	message: string;
}
interface Rule {
	id: string;
	name: string;
	problems(files: string[]): Problem[];
}

// A test file by vitest's default `include`, **/*.{test,spec}.?(c|m)[jt]s?(x):
// every spelling vitest runs when nothing says otherwise. vite.config.ts's
// `test.include` runs only <name>.test.ts under src/ and tools/, so a file of
// any other spelling would sit there never running; it is refused instead.
const testFile = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
// A folder of tests, by the names other runners and layouts give one.
const testFolder = /(?:^|\/)(__tests__|tests?)\//;
const beside =
	"a unit test is <name>.test.ts beside the <name>.ts it tests, in a slice under src/ or in tools/";

function besideProblem(file: string, tracked: Set<string>): string | undefined {
	const folder = testFolder.exec(file)?.[1];
	if (folder) return `${file} is in a ${folder}/ folder: ${beside}, never in a folder of tests`;
	const spelling = testFile.exec(file)?.[0];
	if (!spelling) return undefined;
	if (spelling !== ".test.ts")
		return `${file} is spelled *${spelling}, which vitest does not run here: ${beside}`;
	if (file.startsWith("e2e/"))
		return `${file} is a unit test under e2e/, which holds the scenarios' steps: ${beside}`;
	if (!/^(?:src\/[^/]+|tools)\/./.test(file))
		return `${file} is neither in a slice under src/ nor in tools/: ${beside}`;
	const tested = file.slice(0, -".test.ts".length) + ".ts";
	if (!tracked.has(tested))
		return `${file} has no ${basename(tested)} beside it to test: ${beside}`;
	return undefined;
}

const rules: Rule[] = [
	{
		id: "slice-folders",
		name: "every file under src/ is in a slice, but src/main.ts",
		problems: (files) =>
			files
				.filter((file) => /^src\/[^/]+$/.test(file) && file !== "src/main.ts")
				.map((file) => ({
					file,
					message: `${file} is outside a slice: src/ holds only src/main.ts and one folder per feature (src/<slice>/<slice>.ts and its tests)`,
				})),
	},
	{
		id: "tests-beside-code",
		name: "every unit test is beside the file it tests",
		problems: (files) => {
			const tracked = new Set(files);
			return files.flatMap((file) => {
				const message = besideProblem(file, tracked);
				return message ? [{ file, message }] : [];
			});
		},
	},
];
// The rules the gates hold: this script's and lint's.
const lintRules = Object.keys(plugin.rules);
const held = [...rules.map((rule) => rule.id), ...lintRules];

function git(...args: string[]): string | undefined {
	const run = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 << 20 });
	return run.status === 0 ? run.stdout : undefined;
}
const fail = (message: string): never => {
	console.error(`code design: ${message}`);
	process.exit(2);
};
const key = (rule: string, file: string) => `${rule}\0${file}`;

// The listed files that still break a lint rule, by asking lint with the list
// left out (vite.config.ts reads CODE_DESIGN_RATCHET).
function lintBreaks(entries: Entry[], tracked: Set<string>): Set<string> {
	const files = [
		...new Set(
			entries.filter((e) => lintRules.includes(e.rule) && tracked.has(e.file)).map((e) => e.file),
		),
	];
	if (!files.length) return new Set();
	const run = spawnSync("vp", ["lint", "--format", "json", ...files], {
		cwd: root,
		env: { ...process.env, CODE_DESIGN_RATCHET: "ignore" },
		encoding: "utf8",
		maxBuffer: 64 << 20,
	});
	let report: { diagnostics?: { code?: string; filename?: string }[] };
	try {
		report = JSON.parse(run.stdout.slice(run.stdout.indexOf("{")));
	} catch {
		return fail(`lint's report on the listed files could not be read:\n${run.stdout}${run.stderr}`);
	}
	return new Set(
		(report.diagnostics ?? []).flatMap(({ code, filename }) => {
			const rule = /^code-design\((.+)\)$/.exec(code ?? "")?.[1];
			return rule && filename ? [key(rule, filename)] : [];
		}),
	);
}

// The work items by ID, with their status (itos.yaml's `work.registry`).
function statuses(): Map<string, string> {
	const config = parse(readFileSync(resolve(root, "itos.yaml"), "utf8")) as {
		work?: { registry?: string };
	};
	const registry = config.work?.registry ?? "tasks/work-items.yaml";
	const { items = [] } = (parse(readFileSync(resolve(root, registry), "utf8")) ?? {}) as {
		items?: { id: string; status: string }[];
	};
	return new Map(items.map((item) => [item.id, item.status]));
}

function entryProblem(
	entry: Entry,
	tracked: Set<string>,
	breaks: Set<string>,
	items: Map<string, string>,
) {
	const { rule, file, item } = entry;
	const off = `take it off the list, and close ${item}`;
	if (!tracked.has(file)) return `${file}, listed under ${rule}, is gone: ${off}`;
	if (!breaks.has(key(rule, file))) return `${file} no longer breaks ${rule}: ${off}`;
	const status = items.get(item);
	if (status === undefined)
		return `${file}, listed under ${rule}, names the work item ${item}, which the registry does not hold: each entry is a debt with an item for its fix`;
	if (status === "done")
		return `${file}, listed under ${rule}, names the work item ${item}, which is done though the file still breaks the rule: reopen it, or fix the file`;
	return undefined;
}

// The list against the rules the gates hold: every one named, no other.
function ruleProblems(ratchet: Ratchet): string[] {
	const unnamed = held.filter((rule) => !ratchet.rules.includes(rule));
	const unheld = ratchet.rules.filter((rule) => !held.includes(rule));
	return [
		...unnamed.map(
			(rule) =>
				`${RATCHET} does not name ${rule}, a rule the gates hold: a rule comes into force by joining the list, with the files that break it`,
		),
		...unheld.map(
			(rule) => `${RATCHET} names ${rule}, which no gate holds: the rules are ${held.join(", ")}`,
		),
	];
}

// The comments that turn a code design rule off, or every rule, in the files
// lint reads.
function disableProblems(files: string[]): string[] {
	return files
		.filter(
			(file) => (scripts.test(file) || components.test(file)) && existsSync(resolve(root, file)),
		)
		.flatMap((file) => {
			const text = readFileSync(resolve(root, file), "utf8");
			if (!/lint-disable/i.test(text)) return [];
			return disables(file, text)
				.filter(bypasses)
				.map(
					({ line, rules, directive }) =>
						`${file}:${line} turns ${rules.length ? rules.join(", ") : "every rule"} off by an ${directive} comment: a code design rule is off for a file only by ${RATCHET} or vite.config.ts's mockBoundaries`,
				);
		});
}

function ratchetProblems(ratchet: Ratchet, files: string[], breaks: Set<string>): string[] {
	const tracked = new Set(files);
	const items = statuses();
	const all = new Set([...breaks, ...lintBreaks(ratchet.entries, tracked)]);
	return [
		...ratchet.problems,
		...ruleProblems(ratchet),
		...ratchet.entries.flatMap((entry) => entryProblem(entry, tracked, all, items) ?? []),
		...disableProblems(files),
	];
}

function checkTree(): number {
	const listed = git("ls-files", "-z");
	if (listed === undefined) return fail("git ls-files failed");
	const files = listed.split("\0").filter(Boolean);
	const path = resolve(root, RATCHET);
	const ratchet = existsSync(path)
		? parseRatchet(readFileSync(path, "utf8"))
		: { rules: [], entries: [], problems: [`${RATCHET} is missing`] };
	const off = new Set(ratchet.entries.map((e) => key(e.rule, e.file)));
	const breaks = new Set<string>();
	const problems: string[] = [];
	for (const rule of rules)
		for (const { file, message } of rule.problems(files)) {
			if (off.has(key(rule.id, file))) breaks.add(key(rule.id, file));
			else problems.push(`code-design(${rule.id}): ${message}`);
		}
	problems.push(
		...ratchetProblems(ratchet, files, breaks).map((p) => `code-design(ratchet): ${p}`),
	);
	for (const problem of problems) console.error(problem);
	if (problems.length) return 1;
	const debts = ratchet.entries.length
		? `; ${ratchet.entries.length} file(s) listed in ${RATCHET}`
		: "";
	console.log(`code design: ${rules.map((rule) => rule.name).join("; ")}${debts}`);
	return 0;
}

// The list as a tree holds it: a commit, or "index" for the staged tree.
function ratchetAt(tree: string): Ratchet {
	const text = git("show", tree === "index" ? `:${RATCHET}` : `${tree}:${RATCHET}`);
	return text === undefined || text === "" ? parseRatchet("{}") : parseRatchet(text);
}

// Every rule the list has named, in the commits given or any before them.
function everInForce(revs: string[]): Set<string> {
	const shas = revs.length ? (git("rev-list", "--full-history", ...revs, "--", RATCHET) ?? "") : "";
	return new Set(
		shas
			.split("\n")
			.filter(Boolean)
			.flatMap((sha) => ratchetAt(sha).rules),
	);
}

// The files a tree adds to the list of a rule an earlier commit named: listed
// by none of its parents (a merge's included). The history is read only when
// the tree adds an entry at all.
function joinProblems(parents: string[], tree: string): string[] {
	const lists = parents.map(ratchetAt);
	const before = { ...parseRatchet("{}"), entries: lists.flatMap((list) => list.entries) };
	const after = ratchetAt(tree);
	if (!joined(before, after, new Set(after.rules)).length) return [];
	return joined(before, after, everInForce(parents)).map(
		({ rule, file }) =>
			`${file} joins the list of ${rule}, a rule in force since an earlier commit: files join a rule's list only in the commit that brings it into force, and the list only shrinks; fix the file instead`,
	);
}

function checkStaged(): number {
	const head = git("rev-parse", "--verify", "--quiet", "HEAD")?.trim();
	const problems = joinProblems(head ? [head] : [], "index");
	for (const problem of problems) console.error(`code-design(ratchet): the index: ${problem}`);
	if (!problems.length) console.log(`The staged ${RATCHET} adds no file to a rule in force`);
	return problems.length ? 1 : 0;
}

function checkRange(from: string, to: string): number {
	const since = (
		parse(readFileSync(resolve(root, "itos.yaml"), "utf8")) as { commits?: { since?: string } }
	).commits?.since;
	const range = !from || /^0+$/.test(from) ? to : `${from}..${to}`;
	const commits = (
		git("rev-list", "--reverse", range, ...(since ? [`^${since}`] : [])) ??
		fail(`git rev-list ${range} failed`)
	)
		.split("\n")
		.filter(Boolean);
	let failed = 0;
	for (const sha of commits) {
		const parents = (git("rev-parse", `${sha}^@`) ?? "").split("\n").filter(Boolean);
		const problems = joinProblems(parents, sha);
		if (!problems.length) continue;
		failed++;
		console.error(
			`code-design(ratchet): ${sha.slice(0, 7)} ${git("log", "-1", "--format=%s", sha)?.trim()}`,
		);
		for (const problem of problems) console.error(`  - ${problem}`);
	}
	console.log(
		`${commits.length - failed}/${commits.length} commits add no file to the ${RATCHET} list of a rule in force`,
	);
	return failed ? 1 : 0;
}

const args = process.argv.slice(2);
process.exit(
	args.length === 0
		? checkTree()
		: args[0] === "--staged"
			? checkStaged()
			: checkRange(args[0]!, args[1] ?? "HEAD"),
);
