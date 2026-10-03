import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const setup = fileURLToPath(new URL("./fixtures/happy-dom-setup.mjs", import.meta.url));
const fixture = fileURLToPath(new URL("./fixtures/thinking-editor.mjs", import.meta.url));

test("thinking dropdown changes the visible selection", () => {
	const result = spawnSync(process.execPath, ["--import", setup, fixture], {
		encoding: "utf8",
		timeout: 15000,
	});
	assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
	assert.match(result.stdout, /Thinking selector updated/);
});
