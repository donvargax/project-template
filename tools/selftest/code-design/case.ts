// What every rule's cases share: the shape of a case, and the scratch slice
// most of them write. The runner is tools/selftest/code-design.ts.

// The gate that judges a case's files: lint (`vp lint`), the static check
// (tools/code-design.ts) or the pre-commit hook.
export type Gate = "lint" | "static" | "pre-commit";

export interface Case {
	name: string;
	gate: Gate;
	// The files written over the base tree.
	files: Record<string, string>;
	// What the gate must say when it refuses; absent, the gate must allow.
	says?: string;
}

// A slice of the scratch tree: its feature file and one inner file.
export const slice = (name: string, feature = `export const ${name} = 1;\n`) => ({
	[`src/${name}/${name}.ts`]: feature,
	[`src/${name}/inner.ts`]: "export const inner = 1;\n",
});
