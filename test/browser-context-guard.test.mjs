import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { assertAutomatableTabUrl, guardBrowserExpression } from "../src/tools/browser-context-guard.ts";

test("browser automation cannot target extension, browser or opaque privileged contexts", () => {
	for (const url of ["https://example.com", "http://localhost:3000", "file:///tmp/page.html"]) {
		assert.doesNotThrow(() => assertAutomatableTabUrl(url));
	}
	for (const url of [
		undefined,
		"invalid",
		"chrome-extension://sitegeist/sidepanel.html",
		"moz-extension://sitegeist/page.html",
		"chrome://extensions",
		"edge://settings",
		"about:blank",
		"devtools://devtools/",
		"blob:chrome-extension://sitegeist/id",
		"data:text/html,page",
	]) {
		assert.throws(() => assertAutomatableTabUrl(url), /protected/);
	}
});

test("debugger expressions recheck their actual context before any proposed code executes", () => {
	const code = guardBrowserExpression("globalThis.approvals++; ({ value: 42 })");
	for (const protocol of ["chrome-extension:", "moz-extension:", "chrome:", "about:"]) {
		const context = { location: { protocol }, approvals: 0 };
		assert.throws(() => runInNewContext(code, context), /protected/);
		assert.equal(context.approvals, 0);
	}
	const context = { location: { protocol: "https:" }, approvals: 0 };
	assert.equal(runInNewContext(code, context).value, 42);
	assert.equal(context.approvals, 1, "Normal page evaluation still works");
});

test("debugger and native-input tools reject privileged tabs, including navigation while attaching", () => {
	const setup = fileURLToPath(new URL("./fixtures/happy-dom-setup.mjs", import.meta.url));
	const fixture = fileURLToPath(new URL("./fixtures/browser-context-guard.mjs", import.meta.url));
	const result = spawnSync(process.execPath, ["--import", "tsx", "--import", setup, fixture], {
		cwd: fileURLToPath(new URL("../", import.meta.url)),
		encoding: "utf8",
		timeout: 20000,
	});
	assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
	assert.match(result.stdout, /Privileged browser contexts are protected/);
});
