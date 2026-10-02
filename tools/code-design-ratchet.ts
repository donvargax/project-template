// The code design ratchet's pure part (AGENTS.md, "Code design"): reading the
// list (code-design-ratchet.yaml), which entries a change adds to the list
// of a rule already in force, and which comments turn a lint rule off. The
// gate that runs them over the tree, the index and a pushed range is
// tools/code-design.ts.
import { parse } from "yaml";
import ts from "typescript";

export const RATCHET = "code-design-ratchet.yaml";

// A file the rule is off for, and the work item for its fix.
export interface Entry {
	rule: string;
	file: string;
	item: string;
}
export interface Ratchet {
	// The rules the list names: the rules in force.
	rules: string[];
	entries: Entry[];
	// What is wrong with the list's shape.
	problems: string[];
}

const shape = `${RATCHET} maps each code design rule to a list of { file, item } entries`;

// The list, read from its text; a list that cannot be read names no rule.
export function parseRatchet(text: string): Ratchet {
	let data: unknown;
	try {
		data = parse(text);
	} catch (error) {
		return { rules: [], entries: [], problems: [`${RATCHET} is not YAML: ${String(error)}`] };
	}
	if (data === null || typeof data !== "object" || Array.isArray(data))
		return { rules: [], entries: [], problems: [shape] };
	const ratchet: Ratchet = { rules: [], entries: [], problems: [] };
	for (const [rule, list] of Object.entries(data)) {
		ratchet.rules.push(rule);
		if (!Array.isArray(list)) {
			ratchet.problems.push(`${rule}: ${shape}, [] for none`);
			continue;
		}
		for (const entry of list as unknown[]) {
			const { file, item, ...rest } = (entry ?? {}) as Record<string, unknown>;
			if (typeof file !== "string" || typeof item !== "string" || Object.keys(rest).length)
				ratchet.problems.push(`${rule}: ${JSON.stringify(entry)} is not an entry: ${shape}`);
			else if (ratchet.entries.some((e) => e.rule === rule && e.file === file))
				ratchet.problems.push(`${rule}: ${file} is listed twice`);
			else ratchet.entries.push({ rule, file, item });
		}
	}
	return ratchet;
}

// The entries `after` lists that `before` did not, under a rule `inForce`
// holds: a file joining a rule's list after the commit that brought the rule
// into force. An entry whose item changed is the same entry.
export const joined = (before: Ratchet, after: Ratchet, inForce: Set<string>): Entry[] =>
	after.entries.filter(
		(entry) =>
			inForce.has(entry.rule) &&
			!before.entries.some((was) => was.rule === entry.rule && was.file === entry.file),
	);

// A comment that turns lint rules off, by oxlint's or ESLint's spelling, for
// a file, a line, the next line or the block it opens; matched more loosely
// than oxlint does (any case, a JSDoc star), so a near miss is read too.
const directive = /^[\s*]*((?:ox|es)lint-disable(?:-next-line|-line)?)(?=\s|$)([\s\S]*)$/i;

export interface Disable {
	line: number;
	directive: string;
	// The rules it names; none turns every rule off.
	rules: string[];
}

// The files whose comments are read: every kind oxlint lints. A script's
// comments are found by TypeScript's parser, so a directive's words inside a
// string, a template or a regular expression are not one; a component file's
// (its scripts inside markup) by any `//` or `/*` that starts one.
export const scripts = /\.[cm]?[jt]sx?$/;
export const components = /\.(?:vue|svelte|astro)$/;

function inMarkup(text: string): Disable[] {
	return text.split("\n").flatMap((line, index) =>
		[...line.matchAll(/(?:\/\/|\/\*)(.*)$/g)].flatMap(([, body]) => {
			const disable = read(body!.replace(/\*\/.*$/, ""), index + 1);
			return disable ? [disable] : [];
		}),
	);
}

function read(body: string, line: number): Disable | undefined {
	const match = directive.exec(body);
	if (!match) return undefined;
	const [names = ""] = match[2]!.split(/(?:^|\s)--/);
	return { line, directive: match[1]!, rules: names.split(/[\s,]+/).filter(Boolean) };
}

// The disable comments of a file oxlint lints, by line.
export function disables(fileName: string, text: string): Disable[] {
	if (!scripts.test(fileName)) return inMarkup(text);
	const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false);
	const seen = new Set<number>();
	const found: Disable[] = [];
	const comment = (range: ts.CommentRange) => {
		if (seen.has(range.pos)) return;
		seen.add(range.pos);
		const block = range.kind === ts.SyntaxKind.MultiLineCommentTrivia;
		const body = text.slice(range.pos + 2, range.end - (block ? 2 : 0));
		const disable = read(body, source.getLineAndCharacterOfPosition(range.pos).line + 1);
		if (disable) found.push(disable);
	};
	const visit = (node: ts.Node) => {
		for (const range of ts.getLeadingCommentRanges(text, node.pos) ?? []) comment(range);
		for (const range of ts.getTrailingCommentRanges(text, node.end) ?? []) comment(range);
		for (const child of node.getChildren(source)) visit(child);
	};
	visit(source);
	return found.sort((a, b) => a.line - b.line);
}

// Whether a disable comment turns a code design rule off: it names one, or
// names none and so turns every rule off.
export const bypasses = (disable: Disable) =>
	disable.rules.length === 0 || disable.rules.some((rule) => /code-design/i.test(rule));
