import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { DebuggerTool } from "../../src/tools/debugger.ts";
import { NativeInputEventsRuntimeProvider } from "../../src/tools/NativeInputEventsRuntimeProvider.ts";

let url;
let attached;
let commands;
let detached;
let navigateOnAttach = false;
globalThis.chrome = {
	runtime: {},
	tabs: {
		query: async () => [{ id: 1, url }],
		get: async () => ({ id: 1, url }),
	},
	debugger: {
		attach: (_target, _version, callback) => {
			attached++;
			if (navigateOnAttach) url = "chrome-extension://sitegeist/sidepanel.html";
			callback?.();
			return Promise.resolve();
		},
		detach: async () => {
			detached++;
		},
		sendCommand: async (_target, method, params) => {
			commands.push({ method, params });
			return { result: { value: method === "Runtime.evaluate" ? 42 : undefined } };
		},
	},
};
function reset(target) {
	url = target;
	attached = 0;
	detached = 0;
	commands = [];
	navigateOnAttach = false;
}
const debuggerTool = new DebuggerTool();
for (const target of ["chrome-extension://sitegeist/sidepanel.html", "chrome://extensions", "about:blank"]) {
	reset(target);
	await assert.rejects(debuggerTool.execute("eval", { action: "eval", code: "approveSave()" }), /protected/);
	assert.equal(attached, 0);
	assert.equal(commands.length, 0);
	let response;
	await new NativeInputEventsRuntimeProvider().handleMessage(
		{ type: "native-input", action: "press", key: "Enter" },
		(value) => {
			response = value;
		},
	);
	assert.equal(response.success, false);
	assert.match(response.error, /protected/);
	assert.equal(attached, 0);
	assert.equal(commands.length, 0);
}

reset("https://example.com");
navigateOnAttach = true;
await debuggerTool.execute("eval", { action: "eval", code: "globalThis.approved = true" });
const context = { location: { protocol: "chrome-extension:" }, approved: false };
assert.throws(() => runInNewContext(commands[0].params.expression, context), /protected/);
assert.equal(context.approved, false);

reset("https://example.com");
navigateOnAttach = true;
let response;
await new NativeInputEventsRuntimeProvider().handleMessage(
	{ type: "native-input", action: "press", key: "Enter" },
	(value) => {
		response = value;
	},
);
assert.equal(response.success, false);
assert.match(response.error, /protected/);
assert.equal(commands.length, 0, "Navigation to extension UI must prevent even keyboard dispatch");
assert.equal(detached, 1);

reset("https://example.com");
await debuggerTool.execute("eval", { action: "eval", code: "21 + 21" });
assert.equal(runInNewContext(commands[0].params.expression, { location: { protocol: "https:" } }), 42);
await new NativeInputEventsRuntimeProvider().handleMessage(
	{ type: "native-input", action: "press", key: "Enter" },
	(value) => {
		response = value;
	},
);
assert.equal(response.success, true);
assert.equal(commands.filter((command) => command.method === "Input.dispatchKeyEvent").length, 2);
console.log("Privileged browser contexts are protected");
