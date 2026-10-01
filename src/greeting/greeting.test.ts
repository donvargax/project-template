import fc from "fast-check";
import { describe, expect, it } from "vite-plus/test";
import { greeting } from "./greeting.ts";

// Names padded with the whitespace String.prototype.trim removes, the kinds
// nobody thinks to type among them, around any string at all.
const blank = fc.string({
	unit: fc.constantFrom(" ", "\t", "\n", "\r", "\v", "\f", " ", " ", "　", "﻿"),
});
const padded = fc
	.tuple(blank, fc.string({ unit: "binary" }), blank)
	.map(([before, name, after]) => `${before}${name}${after}`);

describe("greeting", () => {
	it("greets the world when no name is given", () => {
		expect(greeting(null)).toBe("Hello, world!");
		expect(greeting("   ")).toBe("Hello, world!");
	});

	it("greets a visitor by name", () => {
		expect(greeting(" Ada ")).toBe("Hello, Ada!");
	});

	it("ignores the whitespace around a name, and greets any name it is given", () => {
		fc.assert(
			fc.property(padded, (s) => {
				expect(greeting(s)).toBe(greeting(s.trim()));
				if (s.trim()) expect(greeting(s)).toContain(s.trim());
			}),
		);
	});
});
