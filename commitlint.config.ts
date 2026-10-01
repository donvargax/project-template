import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SyncRule, UserConfig } from "@commitlint/types";
import { parse, stringify } from "yaml";

// commitlint is itos.yaml's header lint (`commits.header_lint`), and with one
// set, the commit-msg hook and `itos verify` run it in place of itos's own
// footer rules. So the footer rules run here too: one rule per footer of
// `commits.footers`, `<key>-footer` (see tasks/README.md). itos ships its
// command line, not its modules, so the rules ask it: `itos commit
// check-message` runs the footer rules alone when no header lint is set, and
// it reads, for this, a copy of itos.yaml without `commits.header_lint` (with
// it, itos would hand the message back to commitlint). ITOS_AT, the commit
// `itos verify` re-checks, reaches it through the environment, so a footer's
// IDs are read at that commit.
const CONFIG = process.env.ITOS_CONFIG || "itos.yaml";
const ITOS = fileURLToPath(new URL("./tools/bin/itos", import.meta.url));

interface Policy {
	commits?: { header_lint?: unknown; footers?: Record<string, unknown> };
}
const policy = parse(readFileSync(CONFIG, "utf8")) as Policy;
const keys = Object.keys(policy.commits?.footers ?? {});

// The copy, written once for this run and removed when it ends.
let footersOnly: string | undefined;
function footersOnlyConfig(): string {
	if (footersOnly) return footersOnly;
	const dir = mkdtempSync(join(tmpdir(), "commitlint-footers-"));
	process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
	const { header_lint: _, ...commits } = policy.commits ?? {};
	footersOnly = join(dir, "itos.yaml");
	writeFileSync(footersOnly, stringify({ ...policy, commits }));
	return footersOnly;
}

// The footer rules' problems for one message, asked of itos once.
interface Problem {
	rule: string;
	message: string;
}
const asked = new Map<string, Problem[]>();
function problems(message: string): Problem[] {
	const known = asked.get(message);
	if (known) return known;
	const run = spawnSync(ITOS, ["commit", "check-message", "-", "--json"], {
		input: message,
		encoding: "utf8",
		env: { ...process.env, ITOS_CONFIG: footersOnlyConfig() },
	});
	if (run.status !== 0 && run.status !== 1)
		throw new Error(`itos commit check-message failed:\n${run.stdout}${run.stderr}`);
	const found = (JSON.parse(run.stdout) as { problems: Problem[] }).problems;
	asked.set(message, found);
	return found;
}

export const footerRule =
	(key: string): SyncRule =>
	(commit) => {
		const found = problems(commit.raw ?? "").find((p) => p.rule === `${key.toLowerCase()}-footer`);
		return found ? [false, found.message] : [true];
	};

const names = keys.map((key) => [`${key.toLowerCase()}-footer`, key] as const);

const config: UserConfig = {
	extends: ["@commitlint/config-conventional"],
	plugins: [{ rules: Object.fromEntries(names.map(([name, key]) => [name, footerRule(key)])) }],
	rules: Object.fromEntries(names.map(([name]) => [name, [2, "always"]])),
};

export default config;
