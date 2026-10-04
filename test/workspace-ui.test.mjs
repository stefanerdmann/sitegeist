import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const setup = fileURLToPath(new URL("./fixtures/happy-dom-setup.mjs", import.meta.url));
const fixture = fileURLToPath(new URL("./fixtures/workspace-ui.mjs", import.meta.url));
const projectRoot = fileURLToPath(new URL("../", import.meta.url));

test("working folder UI permissions and save dialogs are safe and theme-aware", () => {
	const result = spawnSync(process.execPath, ["--import", "tsx", "--import", setup, fixture], {
		cwd: projectRoot,
		encoding: "utf8",
		timeout: 20000,
	});
	assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
	assert.match(result.stdout, /Workspace UI, handle storage and document extraction verified/);
});
