// What every rule's cases share: the shape of a case, and the scratch slice
// most of them write. The runner is tools/selftest/code-design.ts.

// The gate that judges a case's files: lint (`vp lint`), the static check
// (tools/code-design.ts) or the pre-commit hook.
export type Gate = "lint" | "static" | "pre-commit";

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
}

// A slice of the scratch tree: its feature file and one inner file.
export const slice = (name: string, feature = `export const ${name} = 1;\n`) => ({
	[`src/${name}/${name}.ts`]: feature,
	[`src/${name}/inner.ts`]: "export const inner = 1;\n",
});
