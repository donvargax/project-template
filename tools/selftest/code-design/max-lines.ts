// The size tripwire (T-034), lint's max-lines at `warn` over every file it
// lints (vite.config.ts's `lint.rules`): it warns on a file over 400 lines
// of code, in a slice, under e2e/ or under tools/, and lets it through, so it
// fails neither a commit nor CI; it says nothing on a file at the limit,
// however many comments and blank lines it holds beside; and the template's
// own tree trips it nowhere, since a warning on every run hides the next one.
import type { Case } from "./case.ts";

// A module of `lines` lines of code, with a comment and a blank line before
// each fifty, which the count leaves out.
const module = (lines: number) =>
	Array.from(
		{ length: lines },
		(_, i) => `${i % 50 ? "" : "// fifty more\n\n"}export const n${i} = ${i};\n`,
	).join("");
const tooLong = "eslint(max-lines): File has too many lines";

export const cases: Case[] = [
	{
		name: "a slice file over the limit, warned and let through",
		gate: "lint",
		files: { "src/alpha/alpha.ts": module(401) },
		says: `${tooLong} (401)`,
		warns: true,
	},
	{
		name: "a slice file at the limit, comments and blank lines aside",
		gate: "lint",
		files: { "src/alpha/alpha.ts": module(400) },
		never: tooLong,
	},
	{
		name: "a page object over the limit, under e2e/",
		gate: "lint",
		files: { "e2e/support/long.ts": module(401) },
		says: `${tooLong} (401)`,
		warns: true,
	},
	{
		name: "a script over the limit, under tools/",
		gate: "lint",
		files: { "tools/long.ts": module(401) },
		says: `${tooLong} (401)`,
		warns: true,
	},
	{
		name: "the template's own tree, every file lint reads",
		gate: "lint",
		files: {},
		never: tooLong,
	},
];
