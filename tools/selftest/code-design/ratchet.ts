// The ratchet (T-035), code-design-ratchet.yaml, held by the static check
// (tools/code-design.ts), which the pre-commit hook and CI run, and by its
// joining rule, which itos runs as a range check in the commit-msg hook and
// in CI's commit re-check. A listed file is let off its rule, lint's or the
// static check's, and no other file is; an entry is refused when its work
// item is missing or done, or its file is gone or no longer breaks the rule;
// a list must name every rule the gates hold, and no other; a comment that
// disables a code design rule, or every rule, is refused, and one that
// disables another rule allowed. The files a commit lists with a rule's
// adoption are allowed, at commit and in CI; one a later commit adds is
// refused, and so is one listed under a rule taken off the list and named
// again, while a commit that takes a file off is allowed.
import { readFileSync } from "node:fs";
import { parse, stringify } from "yaml";
import { slice, type Case } from "./case.ts";

const ratchet = "code-design-ratchet.yaml";
const registry = "tasks/work-items.yaml";

// The template's list, with the given rules' entries, each a file and its
// item, and without the rules `drop` names.
function list(entries: Record<string, [string, string][]>, drop: string[] = []) {
	const rules = parse(readFileSync(ratchet, "utf8")) as Record<string, unknown>;
	for (const [rule, files] of Object.entries(entries))
		rules[rule] = files.map(([file, item]) => ({ file, item }));
	for (const rule of drop) delete rules[rule];
	return { [ratchet]: stringify(rules) };
}

// The template's registry, with work items of these IDs and statuses.
function items(...added: [string, string][]) {
	const text = readFileSync(registry, "utf8");
	const [phase] = Object.keys((parse(text) as { phases: object }).phases);
	const item = ([id, status]: [string, string]) =>
		`\n  - id: ${id}\n    title: A file of the self-test's, off its rule\n    phase: ${phase}\n    owner: null\n    status: ${status}\n    depends_on: []\n    kind: idea\n    why: The self-test's debt.\n`;
	return { [registry]: text + added.map(item).join("") };
}

// A slice whose unit test mocks: it breaks no-mocks.
const mocking = (name: string, mocks = true) => ({
	...slice(name),
	[`src/${name}/${name}.test.ts`]: mocks
		? 'import { expect, it, vi } from "vite-plus/test";\n\nit("runs", () => {\n\texpect(vi.fn()()).toBe(undefined);\n});\n'
		: 'import { expect, it } from "vite-plus/test";\n\nit("runs", () => {\n\texpect(1).toBe(1);\n});\n',
});
const alpha = "src/alpha/alpha.test.ts";
const beta = "src/beta/beta.test.ts";
const open = items(["p9-alpha", "todo"], ["p9-beta", "doing"]);
const mocks = "code-design(no-mocks)";
// A slice's feature file with a comment at its head.
const commented = (comment: string) => ({
	...slice("alpha"),
	"src/alpha/alpha.ts": `${comment}\nexport const alpha = 1;\n`,
});

// A history whose list never named no-mocks, with two slices breaking it.
const unadopted = { ...list({}, ["no-mocks"]), ...mocking("alpha"), ...mocking("beta"), ...open };
const adoption = list({ "no-mocks": [[alpha, "p9-alpha"]] });
const adoptedLater = list({
	"no-mocks": [
		[alpha, "p9-alpha"],
		[beta, "p9-beta"],
	],
});
const joins = `${beta} joins the list of no-mocks`;

export const cases: Case[] = [
	{
		name: "a listed file that breaks a lint rule, linted",
		gate: "lint",
		files: { ...mocking("alpha"), ...open, ...adoption },
	},
	{
		name: "a listed file that breaks a lint rule, its item open",
		gate: "static",
		files: { ...mocking("alpha"), ...open, ...adoption },
	},
	{
		name: "a file the list leaves out, beside one it lists",
		gate: "lint",
		files: { ...mocking("alpha"), ...mocking("beta"), ...open, ...adoption },
		says: mocks,
	},
	{
		name: "a listed file that breaks a static rule",
		gate: "static",
		files: {
			"src/stray.ts": "export const stray = 1;\n",
			...open,
			...list({ "slice-folders": [["src/stray.ts", "p9-alpha"]] }),
		},
	},
	{
		name: "an entry whose work item is done",
		gate: "static",
		files: { ...mocking("alpha"), ...items(["p9-alpha", "done"]), ...adoption },
		says: "names the work item p9-alpha, which is done",
	},
	{
		name: "an entry whose work item is missing",
		gate: "static",
		files: { ...mocking("alpha"), ...adoption },
		says: "names the work item p9-alpha, which the registry does not hold",
	},
	{
		name: "an entry whose file is gone",
		gate: "static",
		files: { ...open, ...adoption },
		says: `${alpha}, listed under no-mocks, is gone`,
	},
	{
		name: "an entry whose file no longer breaks a lint rule",
		gate: "static",
		files: { ...mocking("alpha", false), ...open, ...adoption },
		says: `${alpha} no longer breaks no-mocks`,
	},
	{
		name: "an entry whose file no longer breaks a static rule",
		gate: "static",
		files: {
			...slice("alpha"),
			...open,
			...list({ "slice-folders": [["src/alpha/alpha.ts", "p9-alpha"]] }),
		},
		says: "src/alpha/alpha.ts no longer breaks slice-folders",
	},
	{
		name: "an entry, at commit",
		gate: "pre-commit",
		files: { ...mocking("alpha", false), ...open, ...adoption },
		says: `${alpha} no longer breaks no-mocks`,
	},
	{
		name: "a list that leaves out a rule the gates hold",
		gate: "static",
		files: list({}, ["no-mocks"]),
		says: "does not name no-mocks, a rule the gates hold",
	},
	{
		name: "a list that names a rule no gate holds",
		gate: "static",
		files: list({ "no-such-rule": [] }),
		says: "names no-such-rule, which no gate holds",
	},
	...[
		[
			"// oxlint-disable-next-line code-design/no-mocks",
			"code-design/no-mocks",
			"oxlint-disable-next-line",
		],
		["/* eslint-disable */", "every rule", "eslint-disable"],
		["export const off = 1; // oxlint-disable-line", "every rule", "oxlint-disable-line"],
		["// oxlint-disable -- a reason", "every rule", "oxlint-disable"],
		[
			"/* oxlint-disable max-lines, code-design/slice-boundary -- a reason */",
			"max-lines, code-design/slice-boundary",
			"oxlint-disable",
		],
	].map(([comment, rules, directive]): Case => ({
		name: `a comment that disables ${rules}: ${comment}`,
		gate: "static",
		files: commented(comment!),
		says: `src/alpha/alpha.ts:1 turns ${rules} off by an ${directive} comment`,
	})),
	{
		name: "a comment that disables a code design rule, at commit",
		gate: "pre-commit",
		files: commented("// oxlint-disable code-design/no-mocks"),
		says: "src/alpha/alpha.ts:1 turns code-design/no-mocks off",
	},
	{
		name: "a comment that disables max-lines, with its reason",
		gate: "static",
		files: commented("// oxlint-disable max-lines -- a reason"),
	},
	{
		name: "a disable comment's words in a string and a template",
		gate: "static",
		files: {
			...slice("alpha"),
			"src/alpha/alpha.ts":
				'export const alpha = "// oxlint-disable";\nexport const beta = `/* eslint-disable */`;\n',
		},
	},
	{
		name: "the files listed by the commit that brings a rule into force",
		gate: "commit-msg",
		history: [unadopted],
		fresh: true,
		files: adoption,
	},
	{
		name: "the files listed by the commit that brings a rule into force, in CI",
		gate: "verify",
		history: [unadopted],
		fresh: true,
		files: adoption,
	},
	{
		name: "a file a later commit adds to an adopted rule's list",
		gate: "commit-msg",
		history: [unadopted, adoption],
		fresh: true,
		files: adoptedLater,
		says: joins,
	},
	{
		name: "a file a later commit adds to an adopted rule's list, in CI",
		gate: "verify",
		history: [unadopted, adoption],
		fresh: true,
		files: adoptedLater,
		says: joins,
	},
	{
		name: "a file a later commit takes off an adopted rule's list, in CI",
		gate: "verify",
		history: [unadopted, adoptedLater],
		fresh: true,
		files: adoption,
	},
	{
		name: "a file listed under a rule the template's history brought into force",
		gate: "commit-msg",
		history: [{ ...mocking("beta"), ...open }],
		files: list({ "no-mocks": [[beta, "p9-beta"]] }),
		says: joins,
	},
	{
		name: "a file listed under a rule taken off the list and named again, in CI",
		gate: "verify",
		history: [unadopted],
		files: list({ "no-mocks": [[beta, "p9-beta"]] }),
		says: joins,
	},
];
