import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
	createCopilotModel,
	createManualCopilotModel,
	getAvailableCopilotModels,
	getCopilotAccountDomain,
	parseManualCopilotModels,
} from "../src/models/copilot-models.ts";
import {
	fetchGitHubCopilotModels,
	getGitHubCopilotBaseUrl,
	loginGitHubCopilot,
	parseCopilotModelCatalog,
	refreshGitHubCopilot,
} from "../src/oauth/github-copilot.ts";
import { resolveApiKey } from "../src/oauth/index.ts";

const originalFetch = globalThis.fetch;
const originalChrome = globalThis.chrome;

afterEach(() => {
	globalThis.fetch = originalFetch;
	globalThis.chrome = originalChrome;
});

function mockGitHub(domain, verificationUri = `https://${domain}/login/device`) {
	const requests = [];
	const ruleUpdates = [];
	const openedTabs = [];
	globalThis.chrome = {
		tabs: { create: (tab) => openedTabs.push(tab) },
		declarativeNetRequest: {
			updateSessionRules: async (update) => ruleUpdates.push(update),
		},
	};
	globalThis.fetch = async (url, init) => {
		requests.push({ url, init });
		let data;
		if (url === `https://${domain}/login/device/code`) {
			data = {
				device_code: "device",
				user_code: "ABCD-1234",
				verification_uri: verificationUri,
				interval: 0,
				expires_in: 30,
			};
		} else if (url === `https://${domain}/login/oauth/access_token`) {
			data = { access_token: "ghu_enterprise" };
		} else if (url === `https://api.${domain}/copilot_internal/v2/token`) {
			data = { token: "tid=123;proxy-ep=proxy.business.githubcopilot.com;", expires_at: 2000000000 };
		} else if (url === "https://api.business.githubcopilot.com/models") {
			data = {
				data: [
					{
						id: "sol",
						name: "Sol",
						vendor: "Example",
						model_picker_enabled: true,
						capabilities: { supports: { tool_calls: true }, limits: { max_context_window_tokens: 128000 } },
					},
					{
						id: "luna",
						name: "Luna",
						model_picker_enabled: true,
						capabilities: { supports: { tool_calls: true, vision: true } },
					},
					{
						id: "gpt-4.1",
						name: "GPT-4.1",
						model_picker_enabled: true,
						capabilities: { supports: { tool_calls: true } },
					},
					{ id: "obsolete", model_picker_enabled: true, policy: { state: "disabled" } },
					{ id: "embed", model_picker_enabled: true, capabilities: { supports: { tool_calls: false } } },
				],
			};
		} else {
			throw new Error(`Unexpected URL: ${url}`);
		}
		return Response.json(data);
	};
	return { requests, ruleUpdates, openedTabs };
}

test("enterprise device login uses the selected host and stores it for refresh", async () => {
	const { requests, ruleUpdates, openedTabs } = mockGitHub("company.ghe.com");
	const codes = [];
	const credentials = await loginGitHubCopilot((info) => codes.push(info), "https://company.ghe.com/");

	assert.deepEqual(
		requests.map((request) => request.url),
		[
			"https://company.ghe.com/login/device/code",
			"https://company.ghe.com/login/oauth/access_token",
			"https://api.company.ghe.com/copilot_internal/v2/token",
		],
	);
	assert.deepEqual(codes, [{ userCode: "ABCD-1234", verificationUri: "https://company.ghe.com/login/device" }]);
	assert.deepEqual(openedTabs, [{ url: "https://company.ghe.com/login/device", active: true }]);
	assert.equal(credentials.enterpriseUrl, "company.ghe.com");
	assert.equal(credentials.refresh, "ghu_enterprise");
	assert.equal(credentials.providerId, "github-copilot");
	assert.equal(
		getGitHubCopilotBaseUrl(credentials.access, credentials.enterpriseUrl),
		"https://api.business.githubcopilot.com",
	);

	const rules = ruleUpdates.at(-1).addRules;
	assert.equal(rules.length, 2);
	assert.equal(rules[0].action.type, "modifyHeaders");
	assert.equal(new RegExp(rules[0].condition.regexFilter).test(requests[0].url), true);
	assert.equal(new RegExp(rules[0].condition.regexFilter).test("https://companyXghe.com/login/device/code"), false);
	assert.equal(new RegExp(rules[1].condition.regexFilter).test(requests[2].url), true);
	assert.equal(
		new RegExp(rules[1].condition.regexFilter).test("https://api.company.ghe.com.evil.com/copilot_internal/v2/token"),
		false,
	);

	requests.length = 0;
	const refreshed = await refreshGitHubCopilot(credentials);
	assert.deepEqual(
		requests.map((request) => request.url),
		["https://api.company.ghe.com/copilot_internal/v2/token"],
	);
	assert.equal(refreshed.enterpriseUrl, "company.ghe.com");
	assert.equal(refreshed.refresh, "ghu_enterprise");
});

test("expired enterprise credentials refresh on the enterprise host and keep the domain in storage", async () => {
	const { requests } = mockGitHub("company.ghe.com");
	const saved = [];
	const oldCredentials = {
		providerId: "github-copilot",
		access: "expired",
		refresh: "ghu_enterprise",
		expires: Date.now() - 1,
		enterpriseUrl: "https://company.ghe.com/",
	};
	const token = await resolveApiKey(JSON.stringify(oldCredentials), "github-copilot", {
		set: async (provider, value) => saved.push({ provider, value: JSON.parse(value) }),
	});
	assert.equal(token, "tid=123;proxy-ep=proxy.business.githubcopilot.com;");
	assert.deepEqual(
		requests.map((request) => request.url),
		["https://api.company.ghe.com/copilot_internal/v2/token"],
	);
	assert.equal(saved[0].provider, "github-copilot");
	assert.equal(saved[0].value.enterpriseUrl, "company.ghe.com");
});

test("catalog lookup shows only usable models, including IDs absent from the static registry", async () => {
	const { requests } = mockGitHub("company.ghe.com");
	const saved = JSON.stringify({
		providerId: "github-copilot",
		access: "tid=123;proxy-ep=proxy.business.githubcopilot.com;",
		refresh: "ghu_enterprise",
		expires: Date.now() + 600000,
		enterpriseUrl: "company.ghe.com",
	});
	const models = await getAvailableCopilotModels({ get: async () => saved, set: async () => {} });
	assert.deepEqual(
		models.map((model) => model.id),
		["sol", "luna", "gpt-4.1"],
	);
	assert.equal(models[0].api, "openai-completions");
	assert.equal(models[0].contextWindow, 128000);
	assert.equal(models[0].baseUrl, "https://api.business.githubcopilot.com");
	assert.equal(models[1].input.includes("image"), true);
	assert.equal(models[2].name, "GPT-4.1");
	assert.equal(requests[0].url, "https://api.business.githubcopilot.com/models");
	assert.equal(requests[0].init.headers.Authorization, "Bearer tid=123;proxy-ep=proxy.business.githubcopilot.com;");
});

test("catalog refreshes expired credentials and keeps the enterprise route", async () => {
	const { requests } = mockGitHub("company.ghe.com");
	let saved = JSON.stringify({
		providerId: "github-copilot",
		access: "old-token",
		refresh: "ghu_enterprise",
		expires: Date.now() - 1,
		enterpriseUrl: "company.ghe.com",
	});
	const models = await getAvailableCopilotModels({
		get: async () => saved,
		set: async (_, value) => {
			saved = value;
		},
	});
	assert.equal(models[0].id, "sol");
	assert.deepEqual(
		requests.map((request) => request.url),
		["https://api.company.ghe.com/copilot_internal/v2/token", "https://api.business.githubcopilot.com/models"],
	);
	assert.equal(JSON.parse(saved).enterpriseUrl, "company.ghe.com");
});

test("model parser handles policy fallback, invalid catalogs, and manual API overrides", async () => {
	const catalog = parseCopilotModelCatalog({
		data: [
			{ id: "sol", model_picker_enabled: false, policy: { state: "enabled" } },
			{ id: "blocked", model_picker_enabled: false, policy: { state: "disabled" } },
		],
	});
	assert.deepEqual(
		catalog.map((item) => item.id),
		["sol"],
	);
	assert.throws(() => parseCopilotModelCatalog({ data: {} }), /Invalid Copilot model catalog/);

	const manual = createManualCopilotModel("luna", "anthropic-messages", "https://api.business.githubcopilot.com");
	assert.equal(manual.api, "anthropic-messages");
	assert.equal(manual.provider, "github-copilot");
	assert.equal(manual.id, "luna");
	assert.equal(manual.input.includes("image"), false);
	assert.throws(() => createManualCopilotModel("  ", "openai-completions", "https://api.business.githubcopilot.com"));
	assert.throws(() =>
		createManualCopilotModel("invalid ID", "openai-completions", "https://api.business.githubcopilot.com"),
	);
	assert.equal(
		createCopilotModel({ id: "gpt-4.1", name: "4.1", supportedEndpoints: [] }, "https://example.com").api,
		"openai-completions",
	);
});

test("manual Copilot models are validated and grouped by enterprise domain", async () => {
	const models = parseManualCopilotModels([
		{ domain: "company.ghe.com", id: "sol", api: "openai-completions" },
		{ domain: "company.ghe.com", id: "invalid ID", api: "anthropic-messages" },
		{ domain: "company.ghe.com", id: "luna", api: "invalid" },
		null,
	]);
	assert.deepEqual(models, [{ domain: "company.ghe.com", id: "sol", api: "openai-completions" }]);
	assert.equal(
		await getCopilotAccountDomain({
			get: async () => JSON.stringify({ providerId: "github-copilot", enterpriseUrl: "company.ghe.com" }),
			set: async () => {},
		}),
		"company.ghe.com",
	);
});

test("catalog requests honor enterprise routing even without a proxy-ep token field", async () => {
	let request;
	globalThis.fetch = async (url, init) => {
		request = { url, init };
		return Response.json({ data: [] });
	};
	assert.deepEqual(await fetchGitHubCopilotModels("copilot-token", "company.ghe.com"), []);
	assert.equal(request.url, "https://copilot-api.company.ghe.com/models");
	assert.equal(request.init.headers.Authorization, "Bearer copilot-token");
});

test("blank domain keeps the github.com login and refresh behavior", async () => {
	const { requests, ruleUpdates } = mockGitHub("github.com");
	const credentials = await loginGitHubCopilot(() => {}, "  ");
	assert.equal(requests[0].url, "https://github.com/login/device/code");
	assert.equal(requests[2].url, "https://api.github.com/copilot_internal/v2/token");
	assert.equal(credentials.enterpriseUrl, undefined);
	assert.deepEqual(ruleUpdates, [{ removeRuleIds: [1001, 1002] }]);

	requests.length = 0;
	await refreshGitHubCopilot(credentials);
	assert.equal(requests[0].url, "https://api.github.com/copilot_internal/v2/token");
	assert.equal(getGitHubCopilotBaseUrl("", credentials.enterpriseUrl), "https://api.individual.githubcopilot.com");
	assert.equal(getGitHubCopilotBaseUrl("", "company.ghe.com"), "https://copilot-api.company.ghe.com");
	assert.equal(
		getGitHubCopilotBaseUrl("tid=123;proxy-ep=https://attacker.example/path;", "company.ghe.com"),
		"https://copilot-api.company.ghe.com",
	);
});

test("invalid enterprise URLs are rejected before any network request", async () => {
	const { requests, openedTabs } = mockGitHub("github.com");
	for (const domain of [
		"http://company.ghe.com",
		"https://company.ghe.com/login/device",
		"https://company.ghe.com/?code=foo",
		"https://user@company.ghe.com",
		"company.ghe.com:1234",
		"javascript:alert(1)",
	]) {
		await assert.rejects(
			loginGitHubCopilot(() => {}, domain),
			/Invalid GitHub Enterprise URL\/domain/,
		);
	}
	assert.equal(requests.length, 0);
	assert.equal(openedTabs.length, 0);
});

test("device verification URLs from another host are never opened", async () => {
	const { openedTabs, requests } = mockGitHub("company.ghe.com", "https://attacker.example/login/device");
	await assert.rejects(
		loginGitHubCopilot(() => {}, "company.ghe.com"),
		/Invalid device verification URL/,
	);
	assert.deepEqual(
		requests.map((request) => request.url),
		["https://company.ghe.com/login/device/code"],
	);
	assert.equal(openedTabs.length, 0);
});
