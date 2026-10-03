import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";
import { getAvailableCopilotModels } from "../src/models/copilot-models.ts";
import {
	CATALOG_MAX_AGE_MS,
	loadPiModelCatalog,
	modelFromPiCatalog,
	PI_MODELS_URL,
	parsePiModelCatalog,
} from "../src/models/pi-model-catalog.ts";
import { getProviderModels } from "../src/models/provider-models.ts";

const originalFetch = globalThis.fetch;
const originalNow = Date.now;
afterEach(() => {
	globalThis.fetch = originalFetch;
	Date.now = originalNow;
});

const cost = { input: 1, output: 4, cacheRead: 0.5, cacheWrite: 0 };
function entry(provider, id, api, changes = {}) {
	return {
		id,
		name: id,
		provider,
		api,
		type: "chat",
		baseUrl: "https://untrusted.example/v1",
		headers: { Authorization: "Bearer untrusted" },
		reasoning: true,
		input: ["text", "image"],
		cost,
		contextWindow: 200000,
		maxTokens: 32000,
		...changes,
	};
}
const raw = {
	anthropic: { "claude-new": entry("anthropic", "claude-new", "anthropic-messages") },
	"openai-codex": {
		"gpt-new-codex": entry("openai-codex", "gpt-new-codex", "openai-codex-responses", {
			thinkingLevelMap: { minimal: "low", xhigh: "xhigh", max: "max", high: "invalid" },
		}),
	},
	openai: { "gpt-new": entry("openai", "gpt-new", "openai-responses") },
	"github-copilot": {
		"gpt-5.4": entry("github-copilot", "gpt-5.4", "openai-responses", {
			thinkingLevelMap: { off: null, minimal: "low", xhigh: "xhigh", max: "max" },
		}),
		sol: entry("github-copilot", "sol", "openai-responses"),
	},
};

function memorySettings() {
	const values = new Map();
	return {
		get: async (key) => values.get(key) ?? null,
		set: async (key, value) => {
			values.set(key, value);
		},
	};
}

test("the extension CORS rule is scoped to the public pi.dev model API", () => {
	const rules = JSON.parse(readFileSync(new URL("../static/cors-rules.json", import.meta.url), "utf8"));
	const rule = rules.find((item) => item.id === 6);
	assert.ok(rule);
	assert.equal(new RegExp(rule.condition.regexFilter).test(PI_MODELS_URL), true);
	assert.equal(new RegExp(rule.condition.regexFilter).test("https://pi.dev.evil.example/api/models"), false);
	assert.equal(rule.action.responseHeaders[0].header, "Access-Control-Allow-Origin");
});

test("pi.dev metadata is limited to supported chat APIs and never supplies auth URLs or headers", () => {
	const catalog = parsePiModelCatalog({
		...raw,
		anthropic: {
			...raw.anthropic,
			image: entry("anthropic", "image", "anthropic-messages", { type: "image" }),
			invalid: entry("anthropic", "invalid", "openai-responses"),
			"wrong-id": entry("anthropic", "different-id", "anthropic-messages"),
		},
	});
	assert.deepEqual(
		catalog.anthropic.map((model) => model.id),
		["claude-new"],
	);
	assert.equal(catalog["openai-codex"][0].api, "openai-codex-responses");
	assert.deepEqual(catalog["openai-codex"][0].thinkingLevelMap, { minimal: "low", xhigh: "xhigh" });
	assert.equal(catalog.openai[0].api, "openai-responses");
	assert.equal("baseUrl" in catalog.anthropic[0], false);
	assert.equal("headers" in catalog.anthropic[0], false);

	const claude = modelFromPiCatalog("anthropic", catalog.anthropic[0]);
	assert.equal(claude.baseUrl, "https://api.anthropic.com");
	assert.equal(claude.api, "anthropic-messages");
	assert.equal(claude.contextWindow, 200000);
	assert.equal(claude.headers?.Authorization, undefined);

	const copilot = modelFromPiCatalog(
		"github-copilot",
		catalog["github-copilot"][0],
		"https://api.business.githubcopilot.com",
	);
	assert.equal(copilot.baseUrl, "https://api.business.githubcopilot.com");
	assert.deepEqual(copilot.thinkingLevelMap, { off: null, minimal: "low", xhigh: "xhigh" });
	assert.equal(copilot.headers.Authorization, undefined);
	assert.equal(copilot.headers["Copilot-Integration-Id"], "vscode-chat");
	assert.deepEqual(copilot.cost, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
});

test("catalog caches successful requests and uses the cache if refresh fails", async () => {
	const settings = memorySettings();
	let calls = 0;
	globalThis.fetch = async (url) => {
		assert.equal(url, PI_MODELS_URL);
		calls++;
		return Response.json(raw);
	};
	const first = await loadPiModelCatalog(settings);
	assert.equal(first.catalog.anthropic[0].id, "claude-new");
	assert.equal(calls, 1);
	assert.equal((await loadPiModelCatalog(settings)).catalog.openai[0].id, "gpt-new");
	assert.equal(calls, 1);
	globalThis.fetch = async () => {
		throw new Error("offline");
	};
	const offline = await loadPiModelCatalog(settings, true);
	assert.equal(offline.catalog["openai-codex"][0].id, "gpt-new-codex");
	assert.match(offline.warning, /cached model metadata/);
	globalThis.fetch = async () => Response.json({ anthropic: {} });
	const invalid = await loadPiModelCatalog(settings, true);
	assert.equal(invalid.catalog.anthropic[0].id, "claude-new");
	assert.match(invalid.warning, /cached model metadata/);
});

test("pi.dev models are checked again after the cache expires", async () => {
	const settings = memorySettings();
	let now = originalNow();
	Date.now = () => now;
	let calls = 0;
	globalThis.fetch = async () => {
		calls++;
		return Response.json(
			calls === 1
				? raw
				: {
						...raw,
						anthropic: {
							"claude-newer": entry("anthropic", "claude-newer", "anthropic-messages"),
						},
					},
		);
	};
	await loadPiModelCatalog(settings);
	assert.equal(calls, 1);
	now += CATALOG_MAX_AGE_MS + 1;
	const updated = await loadPiModelCatalog(settings);
	assert.equal(calls, 2);
	assert.deepEqual(
		updated.catalog.anthropic.map((model) => model.id),
		["claude-newer"],
	);
});

test("ChatGPT subscription models come only from openai-codex, not OpenAI API-key models", async () => {
	const settings = memorySettings();
	globalThis.fetch = async () => Response.json(raw);
	const catalogResult = await loadPiModelCatalog(settings);
	globalThis.fetch = async () => {
		throw new Error("pi.dev must not be fetched again");
	};
	const result = await getProviderModels("openai-codex", { get: async () => null, set: async () => {} }, settings, {
		catalogResult,
	});
	assert.deepEqual(
		result.models.map((model) => model.id),
		["gpt-new-codex"],
	);
	assert.equal(result.models[0].baseUrl, "https://chatgpt.com/backend-api");
	assert.equal(result.models[0].api, "openai-codex-responses");
	assert.equal(result.models[0].thinkingLevelMap.minimal, "low");
});

test("Copilot account entitlements intersect pi.dev metadata, including models new to the bundled registry", async () => {
	const piModels = parsePiModelCatalog(raw)["github-copilot"];
	const credentials = JSON.stringify({
		providerId: "github-copilot",
		access: "tid=abc;proxy-ep=proxy.business.githubcopilot.com;",
		refresh: "ghu_token",
		expires: Date.now() + 600000,
		enterpriseUrl: "company.ghe.com",
	});
	globalThis.fetch = async (url) => {
		assert.equal(url, "https://api.business.githubcopilot.com/models");
		return Response.json({
			data: [
				{ id: "gpt-5.4", model_picker_enabled: true, capabilities: { supports: { tool_calls: true } } },
				{ id: "sol", model_picker_enabled: true, capabilities: { supports: { tool_calls: true } } },
				{ id: "private-id", model_picker_enabled: true, capabilities: { supports: { tool_calls: true } } },
			],
		});
	};
	const models = await getAvailableCopilotModels({ get: async () => credentials, set: async () => {} }, piModels);
	assert.deepEqual(
		models.map((model) => model.id),
		["gpt-5.4", "sol", "private-id"],
	);
	assert.equal(models[0].api, "openai-responses");
	assert.equal(models[0].contextWindow, 200000);
	assert.equal(models[0].thinkingLevelMap.xhigh, "xhigh");
	assert.equal(models[0].baseUrl, "https://api.business.githubcopilot.com");
	assert.equal(models[1].api, "openai-responses");
	assert.equal(models[2].api, "openai-completions");
});

test("offline without cache falls back to bundled models for non-Copilot providers", async () => {
	const settings = memorySettings();
	globalThis.fetch = async () => {
		throw new Error("offline");
	};
	const result = await getProviderModels("anthropic", { get: async () => null, set: async () => {} }, settings);
	assert.ok(result.models.length > 0);
	assert.match(result.warning, /bundled models/);
});
