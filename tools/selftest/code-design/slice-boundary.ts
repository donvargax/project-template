// The slice boundary (T-029), held by lint (code-design/slice-boundary in
// tools/lint/code-design.ts): it refuses a slice, or src/main.ts, reaching
// another slice's inner file by import, re-export, dynamic import or the
// folder itself, and allows another slice's feature file and a slice's own
// files.
import { slice, type Case } from "./case.ts";

const reachesIn = "code-design(slice-boundary)";

export const cases: Case[] = [
	{
		name: "a slice imports another slice's inner file",
		gate: "lint",
		files: {
			...slice("alpha"),
			...slice(
				"beta",
				'import { inner } from "../alpha/inner.ts";\n\nexport const beta = inner;\n',
			),
		},
		says: reachesIn,
	},
	{
		name: "a slice re-exports another slice's inner file",
		gate: "lint",
		files: {
			...slice("alpha"),
			...slice("beta", 'export { inner } from "../alpha/inner.ts";\n'),
		},
		says: reachesIn,
	},
	{
		name: "a slice imports another slice's inner file when it runs",
		gate: "lint",
		files: {
			...slice("alpha"),
			...slice("beta", 'export const beta = () => import("../alpha/inner.ts");\n'),
		},
		says: reachesIn,
	},
	{
		name: "a slice imports another slice's folder (its index file)",
		gate: "lint",
		files: {
			...slice("alpha"),
			"src/alpha/index.ts": 'export { alpha } from "./alpha.ts";\n',
			...slice("beta", 'import { alpha } from "../alpha";\n\nexport const beta = alpha;\n'),
		},
		says: reachesIn,
	},
	{
		name: "src/main.ts imports a slice's inner file",
		gate: "lint",
		files: {
			...slice("alpha"),
			"src/main.ts":
				'import { inner } from "./alpha/inner.ts";\n\ndocument.title = String(inner);\n',
		},
		says: reachesIn,
	},
	{
		name: "a slice imports another slice's feature file",
		gate: "lint",
		files: {
			...slice("alpha"),
			...slice(
				"beta",
				'import { alpha } from "../alpha/alpha.ts";\n\nexport const beta = alpha;\n',
			),
		},
	},
	{
		name: "a slice imports its own inner file",
		gate: "lint",
		files: slice("alpha", 'import { inner } from "./inner.ts";\n\nexport const alpha = inner;\n'),
	},
	{
		name: "src/main.ts imports a slice's feature file",
		gate: "lint",
		files: {
			...slice("alpha"),
			"src/main.ts":
				'import { alpha } from "./alpha/alpha.ts";\n\ndocument.title = String(alpha);\n',
		},
	},
];
