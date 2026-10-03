import assert from "node:assert/strict";
import { test } from "node:test";
import { getModels, getSelectableThinkingLevels, mapReasoningLevel, supportsXhigh } from "@mariozechner/pi-ai";

test("new Codex models can expose xhigh and map minimal to low", () => {
	const model = {
		...getModels("openai-codex")[0],
		id: "gpt-5.6-luna",
		reasoning: true,
		thinkingLevelMap: { minimal: "low", xhigh: "xhigh" },
	};
	assert.equal(supportsXhigh(model), true);
	assert.deepEqual(getSelectableThinkingLevels(model), ["off", "minimal", "low", "medium", "high", "xhigh"]);
	assert.equal(mapReasoningLevel(model, "minimal"), "low");
	assert.equal(mapReasoningLevel(model, "xhigh"), "xhigh");
});

test("explicitly unsupported levels are hidden even on otherwise capable models", () => {
	const model = {
		...getModels("github-copilot")[0],
		id: "gpt-5.4",
		reasoning: true,
		thinkingLevelMap: { minimal: null, xhigh: null },
	};
	assert.equal(supportsXhigh(model), false);
	assert.deepEqual(getSelectableThinkingLevels(model), ["off", "low", "medium", "high"]);
	assert.equal(mapReasoningLevel(model, "minimal"), undefined);
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
