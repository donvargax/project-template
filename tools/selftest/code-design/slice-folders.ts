// What src/ holds (T-029), held by the static check (slice-folders in
// tools/code-design.ts), which the pre-commit hook runs: it refuses a file
// directly under src/, of any kind, lint's or not, and allows src/main.ts
// beside the slice folders.
import { slice, type Case } from "./case.ts";

export const cases: Case[] = [
	{
		name: "a module directly under src/",
		gate: "static",
		files: { "src/foo.ts": "export const foo = 1;\n" },
		says: "src/foo.ts is outside a slice",
	},
	{
		name: "a file lint never reads, directly under src/",
		gate: "static",
		files: { "src/style.css": "h1 { color: teal; }\n" },
		says: "src/style.css is outside a slice",
	},
	{
		name: "src/main.ts beside a new slice folder",
		gate: "static",
		files: slice("alpha"),
	},
	{
		name: "a module directly under src/, at commit",
		gate: "pre-commit",
		files: { "src/foo.ts": "export const foo = 1;\n" },
		says: "src/foo.ts is outside a slice",
	},
];
