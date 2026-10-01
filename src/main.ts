// The page's one element.
const app = document.querySelector<HTMLElement>("#app");
if (app) {
	const heading = document.createElement("h1");
	heading.textContent = "Hello, world!";
	app.append(heading);
}
