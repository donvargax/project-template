// What a CI run's E2E step selects, proved against Playwright's own listing of
// the project's suite (`--list`, no browser), for ranges made with `git
// commit-tree` on top of HEAD (objects only: no branch moves). The plans are
// itos's (`itos ci plan --json`, running nothing):
//
//   - the smoke run (`itos tests smoke run scenario`) runs exactly the smoke
//     set;
//   - a range naming one scenario runs the smoke set plus that one;
//   - the nightly, and a range CI can't read, run every scenario;
//   - a range naming the ledger's tasks whose checks are E2E subsets and CI
//     steps (T-003, T-005, T-009) runs one Playwright run, selecting the smoke
//     set and each subset, and no second build; the tasks' other checks still
//     run, and the gates self-test is left to the nightly;
//   - the smoke rule holds today, and the config calls no step that builds or
//     runs a browser static.
//
// What the plan does whatever the repository — the cost order, the written
// order, the prose shortcut, merging, covering, the smoke rule's failures —
// is itos's, proven in its own repository.
import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanEnv, e2eStep, gitIn, isE2eRun, plan, sh } from "./cli.ts";

const env = cleanEnv();
const git = gitIn(env);
// A commit on top of HEAD with HEAD's tree and this message.
const head = git("rev-parse HEAD");
const range = (message: string) => {
	const file = join(scratch, "message");
	writeFileSync(file, message);
	return git(
		`-c user.name=e2e-scope -c user.email=selftest@localhost commit-tree HEAD^{tree} -p HEAD -F ${file}`,
	);
};

// The scenario IDs an E2E command selects, as Playwright lists them. The smoke
// run hands Playwright only what follows its `--`.
interface Suite {
	suites?: Suite[];
	specs?: { tags?: string[]; tests?: { tags?: string[] }[] }[];
}
const idsIn = (suite: Suite): string[] => [
	...(suite.specs ?? []).flatMap((spec) =>
		[...(spec.tags ?? []), ...(spec.tests ?? []).flatMap((t) => t.tags ?? [])]
			.map((tag) => tag.replace(/^@/, ""))
			.filter((tag) => tag.startsWith("ID-")),
	),
	...(suite.suites ?? []).flatMap(idsIn),
];
function listed(command: string): Set<string> {
	const report = join(scratch, "list.json");
	rmSync(report, { force: true });
	const flags = `${command === SMOKE_RUN ? "-- " : ""}--list --reporter=json`;
	const run = sh(`${command} ${flags}`, {
		env: { ...env, PLAYWRIGHT_JSON_OUTPUT_NAME: report },
	});
	assert.equal(run.status, 0, `${command} --list failed:\n${run.output}`);
	return new Set(idsIn(JSON.parse(readFileSync(report, "utf8")) as Suite));
}
const same = (a: Set<string>, b: Set<string>, what: string) => {
	const missing = [...b].filter((id) => !a.has(id));
	const extra = [...a].filter((id) => !b.has(id));
	assert.ok(
		missing.length === 0 && extra.length === 0,
		`${what}: missing ${missing.join(", ") || "none"}; extra ${extra.join(", ") || "none"}`,
	);
};

// The commands the scenario kind's `recognize` reads as a run of scenarios.
const SMOKE_RUN = "tools/bin/itos tests smoke run scenario";
const isScenarioRun = (command: string) => isE2eRun(command) || command === SMOKE_RUN;
// The task checks a step of this config has just done (`ci.covers`, and the
// steps themselves).
const COVERED = [
	"vp test run",
	"vp run test:coverage",
	"tools/bin/itos tests smoke check scenario",
];
const GATES = "node tools/selftest/gates.ts";

const scratch = mkdtempSync(join(tmpdir(), "e2e-scope-selftest-"));
try {
	const ids = sh("tools/bin/itos tests smoke ids scenario --json", { env });
	assert.equal(ids.status, 0, `itos tests smoke ids failed:\n${ids.output}`);
	const smoke = new Set((JSON.parse(ids.stdout) as { ids: string[] }).ids);
	const everything = listed("vp run e2e");
	assert.ok(everything.size >= smoke.size, "the suite lists fewer scenarios than the smoke set");
	same(listed(SMOKE_RUN), smoke, "the smoke run is not the smoke set");

	// A range naming one scenario: the smoke set and it. The last one listed,
	// outside the smoke set once the suite has one there.
	const named = [...everything].find((id) => !smoke.has(id)) ?? [...everything].at(-1)!;
	let p = plan([head, range(`feat: name a scenario\n\nScenarios: @${named}\n`)]);
	const step = e2eStep(p);
	assert.ok(step, "a push naming a scenario ran no E2E step");
	same(listed(step), new Set([...smoke, named]), `a range naming @${named}`);

	// The nightly runs every scenario, and the gates self-test a push leaves to
	// it; a range that can't be read runs every scenario too.
	const nightly = plan(["--nightly"]);
	assert.equal(e2eStep(nightly), "vp run e2e", "the nightly does not run every scenario");
	assert.ok(nightly.steps.includes(GATES), "the nightly does not run the gates self-test");
	assert.equal(e2eStep(plan(["", head])), "vp run e2e", "an unread range should run everything");

	// A range naming tasks whose checks are E2E subsets and CI steps (T-003:
	// `vp test run` and the coverage step; T-005: the smoke check, the smoke
	// run and this self-test; T-009: the gates self-test, the nightly's).
	p = plan([head, range("ci: name three tasks\n\nTask: T-003, T-005, T-009\n")]);
	const runs = p.steps.filter(isE2eRun);
	assert.equal(runs.length, 1, `expected one Playwright run, got:\n${runs.join("\n")}`);
	assert.equal(p.steps.filter((s) => s === "vp build").length, 1, "the build runs twice");
	const checks = p.order.filter((o) => o.check);
	for (const planned of checks) {
		const { task, command } = planned.check!;
		const expected = isScenarioRun(command)
			? "merged"
			: COVERED.includes(command)
				? "covered"
				: command === GATES
					? "nightly"
					: "run";
		assert.equal(planned.action, expected, `${task}'s \`${command}\` should be ${expected}`);
	}
	assert.ok(
		checks.some((c) => c.check!.task === "T-005" && c.action === "run"),
		"T-005's own check no longer runs",
	);
	assert.ok(
		checks.some((c) => c.check!.task === "T-009" && c.action === "nightly"),
		"a push runs the gates self-test",
	);
	assert.ok(!p.steps.includes(GATES), "a push runs the gates self-test");
	const subsets = checks
		.filter((c) => c.action === "merged")
		.flatMap((c) => [...listed(c.check!.command)]);
	same(listed(runs[0]!), new Set([...smoke, ...subsets]), "the merged run");

	// What builds or runs a browser is late, never static.
	for (const entry of p.order) {
		const command = entry.step ?? entry.check!.command;
		if (["vp run test:coverage", "vp build"].includes(command) || isScenarioRun(command))
			assert.equal(entry.cost, "late", `\`${command}\` should not be static`);
	}

	// The smoke rule holds today.
	assert.equal(sh("tools/bin/itos tests smoke check scenario", { env }).status, 0);
} finally {
	rmSync(scratch, { recursive: true, force: true });
}

console.log(
	"e2e scope: a push runs the smoke set and what it names in one run; the nightly runs everything",
);
