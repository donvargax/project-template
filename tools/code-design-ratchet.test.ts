import fc from "fast-check";
import { describe, expect, it } from "vite-plus/test";
import { bypasses, disables, joined, parseRatchet, type Ratchet } from "./code-design-ratchet.ts";

const list = (text: string) => parseRatchet(text);
const ratchet = (entries: Record<string, [string, string][]>): Ratchet => ({
	rules: Object.keys(entries),
	entries: Object.entries(entries).flatMap(([rule, files]) =>
		files.map(([file, item]) => ({ rule, file, item })),
	),
	problems: [],
});

describe("parseRatchet", () => {
	it("reads each rule's entries, and a rule with none", () => {
		const read = list(
			"no-mocks:\n  - { file: src/a/a.test.ts, item: p4-a }\nslice-folders: []\nslice-boundary:\n",
		);
		expect(read.problems).toEqual([
			"slice-boundary: code-design-ratchet.yaml maps each code design rule to a list of { file, item } entries, [] for none",
		]);
		expect(read.rules).toEqual(["no-mocks", "slice-folders", "slice-boundary"]);
		expect(read.entries).toEqual([{ rule: "no-mocks", file: "src/a/a.test.ts", item: "p4-a" }]);
	});

	it("refuses what is not YAML, not a map, or not an entry", () => {
		expect(list("no-mocks: [").problems[0]).toMatch(/is not YAML/);
		expect(list("- no-mocks").problems).toHaveLength(1);
		expect(list("no-mocks:\n  - src/a/a.ts\n").problems[0]).toMatch(/is not an entry/);
		expect(list("no-mocks:\n  - { file: a, item: b, why: c }\n").problems[0]).toMatch(
			/is not an entry/,
		);
	});

	it("refuses a file listed twice under one rule, and allows it under two", () => {
		expect(
			list("no-mocks:\n  - { file: a, item: b }\n  - { file: a, item: c }\n").problems,
		).toEqual(["no-mocks: a is listed twice"]);
		expect(
			list("no-mocks:\n  - { file: a, item: b }\nslice-boundary:\n  - { file: a, item: b }\n")
				.problems,
		).toEqual([]);
	});
});

describe("joined", () => {
	const inForce = new Set(["no-mocks"]);

	it("is a file added to the list of a rule in force", () => {
		const before = ratchet({ "no-mocks": [["a", "i"]] });
		const after = ratchet({
			"no-mocks": [
				["a", "i"],
				["b", "j"],
			],
		});
		expect(joined(before, after, inForce)).toEqual([{ rule: "no-mocks", file: "b", item: "j" }]);
	});

	it("is not a file listed with the rule's adoption, nor an entry whose item changed", () => {
		const before = ratchet({ "no-mocks": [["a", "i"]] });
		expect(joined(before, ratchet({ "no-browser": [["b", "j"]] }), inForce)).toEqual([]);
		expect(joined(before, ratchet({ "no-mocks": [["a", "k"]] }), inForce)).toEqual([]);
	});

	it("is a file moved to another rule's list", () => {
		const before = ratchet({ "no-mocks": [["a", "i"]], "slice-boundary": [] });
		const after = ratchet({ "no-mocks": [], "slice-boundary": [["a", "i"]] });
		expect(joined(before, after, new Set(["slice-boundary"]))).toHaveLength(1);
	});

	it("is never a list that only shrinks", () => {
		const entries = fc.uniqueArray(
			fc.tuple(fc.constantFrom("no-mocks", "slice-boundary"), fc.string()),
			{
				selector: ([rule, file]) => `${rule}\0${file}`,
			},
		);
		fc.assert(
			fc.property(entries, fc.nat(), (all, cut) => {
				const as = (pairs: [string, string][]): Ratchet => ({
					rules: ["no-mocks", "slice-boundary"],
					entries: pairs.map(([rule, file]) => ({ rule, file, item: "i" })),
					problems: [],
				});
				const rules = new Set(["no-mocks", "slice-boundary"]);
				return joined(as(all), as(all.slice(0, cut)), rules).length === 0;
			}),
		);
	});
});

describe("disables", () => {
	const of = (text: string, file = "a.ts") =>
		disables(file, text).map((d) => [d.line, d.directive, d.rules.join(",")]);

	it("reads every form: file, line, next line and block, by oxlint or ESLint", () => {
		const text = [
			"// oxlint-disable code-design/no-mocks",
			"f(); // eslint-disable-line",
			"/* oxlint-disable-next-line max-lines, code-design/slice-boundary -- why */",
			"/*",
			" eslint-disable",
			"*/",
			"// OXLINT-DISABLE",
		].join("\n");
		expect(of(text)).toEqual([
			[1, "oxlint-disable", "code-design/no-mocks"],
			[2, "eslint-disable-line", ""],
			[3, "oxlint-disable-next-line", "max-lines,code-design/slice-boundary"],
			[4, "eslint-disable", ""],
			[7, "OXLINT-DISABLE", ""],
		]);
	});

	it("leaves out a reason after --, and a directive's words in a string, template or regex", () => {
		const text = [
			"// oxlint-disable -- the reason",
			'const s = "// oxlint-disable";',
			"const t = `/* eslint-disable */`;",
			"const r = /\\/\\/ oxlint-disable/;",
			"// a comment that mentions oxlint-disable",
		].join("\n");
		expect(of(text)).toEqual([[1, "oxlint-disable", ""]]);
	});

	it("reads a component file's scripts by their comment markers", () => {
		expect(
			of("<script>\n// oxlint-disable-next-line code-design/no-browser\n</script>", "a.vue"),
		).toEqual([[2, "oxlint-disable-next-line", "code-design/no-browser"]]);
	});
});

describe("bypasses", () => {
	const disable = (rules: string[]) => ({ line: 1, directive: "oxlint-disable", rules });

	it("is a disable of a code design rule, or of every rule", () => {
		expect(bypasses(disable([]))).toBe(true);
		expect(bypasses(disable(["max-lines", "code-design/no-mocks"]))).toBe(true);
		expect(bypasses(disable(["code-design/*"]))).toBe(true);
	});

	it("is not a disable of other rules only", () => {
		expect(bypasses(disable(["max-lines"]))).toBe(false);
	});
});
