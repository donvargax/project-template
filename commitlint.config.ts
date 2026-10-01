import type { UserConfig } from "@commitlint/types";

// commitlint is itos.yaml's header lint (`commits.header_lint`): it judges the
// header and the body. The footer rules (`commits.footers`) are itos's own,
// run after it wherever itos runs this lint (the commit-msg hook, a message
// piped to itos, `itos verify`), so they are not repeated here.
const config: UserConfig = {
	extends: ["@commitlint/config-conventional"],
};

export default config;
