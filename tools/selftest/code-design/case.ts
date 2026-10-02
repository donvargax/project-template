// What every rule's cases share: the shape of a case, and the scratch slice
// most of them write. The runner is tools/selftest/code-design.ts.

// The gate that judges a case's files: lint (`vp lint`), the static check
// (tools/code-design.ts), the pre-commit hook, the commit-msg hook over the
// files staged as a build commit, or CI's commit re-check (`itos verify`)
// over them committed.
export type Gate = "lint" | "static" | "pre-commit" | "commit-msg" | "verify";

export interface Case {
	name: string;
	gate: Gate;
	// The files written over the base tree. None, for lint, lints the base
	// tree itself, every file it lints.
	files: Record<string, string>;
	// What the gate must say: refusing the files (exiting 1), or, with
	// `warns`, letting them through (exiting 0). Absent, it must let them
	// through.
	says?: string;
	warns?: true;
	// What the gate must not say, whatever else it does.
	never?: string;
	// Commits made before the case's files, oldest first, each the files it
	// writes over the tree before it. With `fresh`, the first is the root of
	// a history of its own, which never named the rules the template's did.
	history?: Record<string, string>[];
	fresh?: true;
}

// A slice of the scratch tree: its feature file and one inner file.
export const slice = (name: string, feature = `export const ${name} = 1;\n`) => ({
	[`src/${name}/${name}.ts`]: feature,
	[`src/${name}/inner.ts`]: "export const inner = 1;\n",
});
