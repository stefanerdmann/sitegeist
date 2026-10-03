import assert from "node:assert/strict";
import { test } from "node:test";
import {
	getModels,
	getSelectableThinkingLevels,
	mapReasoningLevel,
	streamSimple,
	supportsXhigh,
} from "@mariozechner/pi-ai";
import { adaptReasoningOptions } from "../src/models/provider-models.ts";

test("new Codex models can expose xhigh and map minimal to low", () => {
	const model = {
		...getModels("openai-codex")[0],
		id: "gpt-5.6-luna",
		reasoning: true,
		thinkingLevelMap: { off: "none", minimal: "low", xhigh: "xhigh" },
	};
	assert.equal(supportsXhigh(model), true);
	assert.deepEqual(getSelectableThinkingLevels(model), ["off", "minimal", "low", "medium", "high", "xhigh"]);
	assert.equal(mapReasoningLevel(model, "minimal"), "low");
	assert.equal(mapReasoningLevel(model, "xhigh"), "xhigh");
	assert.equal(mapReasoningLevel(model, "off"), "none");
	assert.deepEqual(adaptReasoningOptions(model), { reasoning: undefined, reasoningEffort: "none" });
});

test("Luna Off reaches Responses, Codex and Completions payloads as explicit none", async () => {
	const accountPayload = Buffer.from(
		JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "test-account" } }),
	).toString("base64url");
	const token = `header.${accountPayload}.signature`;
	const routes = [
		["openai", "openai-responses"],
		["openai-codex", "openai-codex-responses"],
		["github-copilot", "openai-responses"],
		["github-copilot", "openai-completions"],
	];
	for (const [provider, api] of routes) {
		const template = getModels(provider).find((model) => model.api === api);
		assert.ok(template, `Missing template: ${provider}/${api}`);
		const model = {
			...template,
			id: "gpt-6-luna",
			reasoning: true,
			thinkingLevelMap: { off: "none" },
			...(api === "openai-completions" ? { compat: { ...template.compat, supportsReasoningEffort: true } } : {}),
		};
		let payload;
		const options = adaptReasoningOptions(model, {
			apiKey: token,
			onPayload: (body) => {
				payload = body;
				throw new Error("Stop before network request");
			},
		});
		const result = await streamSimple(model, { messages: [] }, options).result();
		assert.match(result.errorMessage, /Stop before network request/);
		assert.equal(
			api === "openai-completions" ? payload.reasoning_effort : payload.reasoning.effort,
			"none",
			`${provider}/${api}`,
		);
	}
});

test("explicitly unsupported levels are hidden even on otherwise capable models", () => {
	const model = {
		...getModels("github-copilot")[0],
		id: "gpt-5.4",
		reasoning: true,
		thinkingLevelMap: { off: null, minimal: null, xhigh: null },
	};
	assert.equal(supportsXhigh(model), false);
	assert.deepEqual(getSelectableThinkingLevels(model), ["off", "low", "medium", "high"]);
	assert.equal(mapReasoningLevel(model, "minimal"), undefined);
	assert.equal(mapReasoningLevel(model, "off"), undefined);
	assert.equal(adaptReasoningOptions(model), undefined);
	assert.deepEqual(getSelectableThinkingLevels({ ...model, reasoning: false }), ["off"]);
});

test("Anthropic only offers xhigh when the installed transport can handle it", () => {
	const base = getModels("anthropic")[0];
	assert.equal(
		getSelectableThinkingLevels({
			...base,
			id: "claude-fable-5",
			reasoning: true,
			thinkingLevelMap: { xhigh: "xhigh" },
		}).includes("xhigh"),
		false,
	);
	assert.equal(
		getSelectableThinkingLevels({ ...base, id: "claude-opus-4-6", reasoning: true }).includes("xhigh"),
		true,
	);
});
