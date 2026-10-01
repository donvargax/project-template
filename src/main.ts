// The composition root: it wires the slices to the page, each through its
// feature file, and holds nothing else.
import { greeting } from "./greeting/greeting.ts";

const app = document.querySelector<HTMLElement>("#app");
if (app) {
	const heading = document.createElement("h1");
	heading.textContent = greeting(new URLSearchParams(location.search).get("name"));
	app.append(heading);
}
