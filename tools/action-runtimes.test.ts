import fc from "fast-check";
import { describe, expect, it } from "vite-plus/test";
import {
	actionsIn,
	check,
	readUses,
	runsUsing,
	tooOld,
	type Fetch,
	type Fetched,
} from "./action-runtimes.ts";

const SHA = "3d3c42e5aac5ba805825da76410c181273ba90b1";
const OLD = "11d5960a326750d5838078e36cf38b85af677262";

const workflow = (...uses: string[]) =>
	["on: push", "jobs:", "  a:", "    steps:", ...uses.map((u) => `      - uses: ${u}`)].join("\n");

// A fake GitHub: the files it holds, by `repo/file@ref`, and what it was asked.
function github(files: Record<string, Fetched>): Fetch & { asked: string[] } {
	const asked: string[] = [];
	const fetch = (repo: string, file: string, ref: string): Fetched => {
		const key = `${repo}/${file}@${ref}`;
		asked.push(key);
		return files[key] ?? { missing: true };
	};
	return Object.assign(fetch, { asked });
}
const action = (using: string): Fetched => ({ text: `name: x\nruns:\n  using: ${using}\n` });

describe("readUses", () => {
	it("reads an action at the root of its repository, or in a folder of it", () => {
		expect(readUses(`actions/checkout@${SHA}`)).toEqual({
			repo: "actions/checkout",
			path: "",
			ref: SHA,
		});
		expect(readUses("github/codeql-action/init/@v3")).toEqual({
			repo: "github/codeql-action",
			path: "init",
			ref: "v3",
		});
	});

	it("leaves out a local action, a docker image and what is not an action", () => {
		expect(readUses("./.github/actions/setup")).toBeUndefined();
		expect(readUses("docker://alpine:3.20")).toBeUndefined();
		expect(readUses("actions/checkout")).toBeUndefined();
		expect(readUses("checkout@v4")).toBeUndefined();
	});
});

describe("actionsIn", () => {
	it("is every remote action a step uses, in every job", () => {
		const text = [
			"on: push",
			"jobs:",
			"  a:",
			"    steps:",
			`      - uses: actions/checkout@${SHA} # v7.0.1`,
			"      - run: echo",
			"      - uses: ./local",
			"  b:",
			"    uses: owner/repo/.github/workflows/reusable.yml@main",
			"  c:",
			"    steps:",
			"      - uses: docker://alpine:3.20",
			"      - uses: owner/repo/sub@v1",
		].join("\n");
		const { uses, problems } = actionsIn("w.yml", text);
		expect(uses.map((u) => [u.repo, u.path, u.ref])).toEqual([
			["actions/checkout", "", SHA],
			["owner/repo", "sub", "v1"],
		]);
		expect(problems).toEqual([]);
	});

	it("names what is not YAML, has no jobs, or uses something that is not an action", () => {
		expect(actionsIn("w.yml", "jobs: [").problems[0]).toMatch(/w\.yml is not YAML/);
		expect(actionsIn("w.yml", "on: push").problems).toEqual(["w.yml has no jobs"]);
		expect(actionsIn("w.yml", workflow("checkout")).problems).toEqual([
			'w.yml: job a uses "checkout", not an action',
		]);
	});
});

describe("runsUsing", () => {
	it("is the runtime an action.yml names, or none", () => {
		expect(runsUsing("runs:\n  using: 'node24'\n  main: index.js")).toBe("node24");
		expect(runsUsing("runs:\n  using: composite")).toBe("composite");
		expect(runsUsing("name: x")).toBeUndefined();
		expect(runsUsing("runs: [")).toBeUndefined();
	});
});

describe("tooOld", () => {
	it.each([
		["node12", true],
		["node16", true],
		["node20", true],
		["Node20", true],
		["node24", false],
		["node26", false],
		["composite", false],
		["docker", false],
	])("%s is too old: %s", (using, old) => {
		expect(tooOld(using)).toBe(old);
	});

	it("is a Node runtime below 24, and no other", () => {
		fc.assert(fc.property(fc.nat(99), (n) => tooOld(`node${n}`) === n < 24));
		fc.assert(fc.property(fc.string(), (s) => /^node\d+$/i.test(s.trim()) || !tooOld(s)));
	});
});

describe("check", () => {
	it("fails an action on a Node runtime older than 24, naming it, its commit and the runtime", () => {
		const fetch = github({
			[`actions/checkout/action.yml@${OLD}`]: action("node20"),
			[`actions/upload-artifact/action.yml@${SHA}`]: action("node24"),
		});
		const verdict = check(
			[
				{
					file: "ci.yml",
					text: workflow(`actions/checkout@${OLD}`, `actions/upload-artifact@${SHA}`),
				},
			],
			fetch,
		);
		expect(verdict.failures).toEqual([
			`ci.yml: actions/checkout@${OLD} runs on node20, older than node24`,
		]);
		expect(verdict.read).toEqual([
			`actions/checkout@${OLD}: node20`,
			`actions/upload-artifact@${SHA}: node24`,
		]);
		expect(verdict.problems).toEqual([]);
	});

	it("passes a composite and a docker action, and reads action.yaml when there is no action.yml", () => {
		const fetch = github({
			"o/composite/action.yml@v1": action("composite"),
			"o/docker/sub/action.yaml@v1": action("docker"),
		});
		const verdict = check(
			[{ file: "w.yml", text: workflow("o/composite@v1", "o/docker/sub@v1") }],
			fetch,
		);
		expect(verdict).toEqual({
			read: ["o/composite@v1: composite", "o/docker/sub@v1: docker"],
			failures: [],
			problems: [],
		});
	});

	it("fetches an action once however often it is used, and fails each use", () => {
		const fetch = github({ [`actions/checkout/action.yml@${OLD}`]: action("node20") });
		const text = workflow(`actions/checkout@${OLD}`);
		const verdict = check(
			[
				{ file: "ci.yml", text },
				{ file: "nightly.yml", text },
			],
			fetch,
		);
		expect(fetch.asked).toEqual([`actions/checkout/action.yml@${OLD}`]);
		expect(verdict.failures).toHaveLength(2);
	});

	it("names an action it could not read, and one with no runtime", () => {
		const fetch = github({
			"o/down/action.yml@v1": { error: "HTTP 502" },
			"o/bare/action.yml@v1": { text: "name: bare" },
		});
		const verdict = check(
			[{ file: "w.yml", text: workflow("o/down@v1", "o/bare@v1", "o/gone@v1") }],
			fetch,
		);
		expect(verdict.problems).toEqual([
			"o/down@v1: action.yml could not be read: HTTP 502",
			"o/bare@v1: action.yml names no runs.using",
			"o/gone@v1: no action.yml or action.yaml at that ref",
		]);
		expect(verdict.failures).toEqual([]);
	});
});
