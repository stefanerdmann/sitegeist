/**
 * GitHub Copilot OAuth flow for browser extensions.
 *
 * Uses the device code flow (same as the CLI).
 * CORS restrictions on github.com are handled by
 * declarativeNetRequest rules in the manifest.
 */

import type { OAuthCredentials } from "./types.js";

const decode = (s: string) => atob(s);
const CLIENT_ID = decode("SXYxLmI1MDdhMDhjODdlY2ZlOTg=");

const COPILOT_HEADERS = {
	"User-Agent": "GitHubCopilotChat/0.35.0",
	"Editor-Version": "vscode/1.107.0",
	"Editor-Plugin-Version": "copilot-chat/0.35.0",
	"Copilot-Integration-Id": "vscode-chat",
} as const;

interface DeviceCodeResponse {
	device_code: string;
	user_code: string;
	verification_uri: string;
	interval?: number;
	expires_in: number;
}

function normalizeEnterpriseDomain(input?: string): string | undefined {
	if (!input?.trim()) return undefined;

	let url: URL;
	try {
		url = new URL(input.includes("://") ? input.trim() : `https://${input.trim()}`);
	} catch {
		throw new Error("Invalid GitHub Enterprise URL/domain");
	}

	const domain = url.hostname;
	if (
		url.protocol !== "https:" ||
		url.username ||
		url.password ||
		url.port ||
		url.pathname !== "/" ||
		url.search ||
		url.hash ||
		!domain.includes(".") ||
		!domain.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))
	) {
		throw new Error("Invalid GitHub Enterprise URL/domain (HTTPS hostname only)");
	}

	return domain === "github.com" ? undefined : domain;
}

function getUrls(domain: string) {
	return {
		deviceCodeUrl: `https://${domain}/login/device/code`,
		accessTokenUrl: `https://${domain}/login/oauth/access_token`,
		copilotTokenUrl: `https://api.${domain}/copilot_internal/v2/token`,
	};
}

// github.com has a static CORS rule; enterprise hosts need rules for the device flow and token exchange.
const ENTERPRISE_CORS_RULE_IDS = [1001, 1002];

async function allowEnterpriseCopilotRequests(domain: string): Promise<void> {
	const escapedDomain = domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const responseHeaders: chrome.declarativeNetRequest.RuleAction["responseHeaders"] = [
		{ header: "Access-Control-Allow-Origin", operation: "set", value: "*" },
		{ header: "Access-Control-Allow-Methods", operation: "set", value: "GET, POST, OPTIONS" },
		{ header: "Access-Control-Allow-Headers", operation: "set", value: "*" },
		{ header: "Access-Control-Max-Age", operation: "set", value: "86400" },
	];
	await chrome.declarativeNetRequest.updateSessionRules({
		removeRuleIds: ENTERPRISE_CORS_RULE_IDS,
		addRules: [
			{
				id: ENTERPRISE_CORS_RULE_IDS[0],
				priority: 1,
				action: { type: "modifyHeaders", responseHeaders },
				condition: {
					regexFilter: `^https://${escapedDomain}/login/(device/code|oauth/access_token)(\\?|$)`,
					resourceTypes: ["xmlhttprequest", "other"],
				},
			},
			{
				id: ENTERPRISE_CORS_RULE_IDS[1],
				priority: 1,
				action: { type: "modifyHeaders", responseHeaders },
				condition: {
					regexFilter: `^https://api\\.${escapedDomain}/copilot_internal/v2/token(\\?|$)`,
					resourceTypes: ["xmlhttprequest", "other"],
				},
			},
		],
	});
}

export async function clearEnterpriseCopilotRequests(): Promise<void> {
	await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: ENTERPRISE_CORS_RULE_IDS });
}

/**
 * Parse the proxy-ep from a Copilot token to get the API base URL.
 */
function getBaseUrlFromToken(token: string): string | null {
	const match = token.match(/(?:^|;)proxy-ep=(proxy\.(?:[a-z0-9-]+\.)+[a-z0-9-]+)/i);
	if (!match) return null;
	const apiHost = match[1].replace(/^proxy\./i, "api.");
	return `https://${apiHost}`;
}

export function getGitHubCopilotBaseUrl(token?: string, enterpriseDomain?: string): string {
	if (token) {
		const urlFromToken = getBaseUrlFromToken(token);
		if (urlFromToken) return urlFromToken;
	}
	const domain = normalizeEnterpriseDomain(enterpriseDomain);
	if (domain) return `https://copilot-api.${domain}`;
	return "https://api.individual.githubcopilot.com";
}

export interface CopilotModelInfo {
	id: string;
	name: string;
	vendor?: string;
	supportedEndpoints: string[];
	reasoning?: boolean;
	vision?: boolean;
	contextWindow?: number;
	maxTokens?: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function positiveNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** Return only chat models that the account may select and that support agent tool calls. */
export function parseCopilotModelCatalog(value: unknown): CopilotModelInfo[] {
	const rawModels = asRecord(value)?.data;
	if (!Array.isArray(rawModels)) throw new Error("Invalid Copilot model catalog response");

	const candidates = rawModels.flatMap((raw) => {
		const model = asRecord(raw);
		if (!model || typeof model.id !== "string" || !model.id.trim()) return [];

		const capabilities = asRecord(model.capabilities);
		const supports = asRecord(capabilities?.supports);
		const policy = asRecord(model.policy);
		if (policy?.state === "disabled" || supports?.tool_calls === false) return [];

		const limits = asRecord(capabilities?.limits);
		const supportedEndpoints = Array.isArray(model.supported_endpoints)
			? model.supported_endpoints.filter((item): item is string => typeof item === "string")
			: [];
		return [
			{
				info: {
					id: model.id,
					name: typeof model.name === "string" && model.name ? model.name : model.id,
					vendor: typeof model.vendor === "string" ? model.vendor : undefined,
					supportedEndpoints,
					reasoning: typeof supports?.reasoning === "boolean" ? supports.reasoning : undefined,
					vision: typeof supports?.vision === "boolean" ? supports.vision : undefined,
					contextWindow: positiveNumber(limits?.max_context_window_tokens),
					maxTokens: positiveNumber(limits?.max_output_tokens),
				} satisfies CopilotModelInfo,
				pickerEnabled: model.model_picker_enabled,
				policyState: policy?.state,
			},
		];
	});

	const pickerModels = candidates.filter((model) => model.pickerEnabled === true);
	// Some accounts report false for every picker flag despite an explicitly enabled policy.
	const available =
		pickerModels.length > 0
			? pickerModels
			: candidates.filter(
					(model) =>
						model.policyState === "enabled" ||
						(model.pickerEnabled === undefined && model.policyState === undefined),
				);
	return [...new Map(available.map(({ info }) => [info.id, info])).values()];
}

export async function fetchGitHubCopilotModels(token: string, enterpriseUrl?: string): Promise<CopilotModelInfo[]> {
	const baseUrl = getGitHubCopilotBaseUrl(token, enterpriseUrl);
	const response = await fetch(`${baseUrl}/models`, {
		signal: AbortSignal.timeout(15_000),
		headers: {
			Accept: "application/json",
			Authorization: `Bearer ${token}`,
			...COPILOT_HEADERS,
		},
	});
	if (!response.ok) {
		const text = await response.text().catch(() => "");
		throw new Error(`Copilot model catalog request failed: ${response.status} ${text}`);
	}
	return parseCopilotModelCatalog(await response.json());
}

async function postJson(url: string, body: string, headers: Record<string, string>): Promise<Record<string, unknown>> {
	const response = await fetch(url, {
		method: "POST",
		headers,
		body,
	});
	if (!response.ok) {
		const text = await response.text().catch(() => "");
		throw new Error(`${response.status}: ${text}`);
	}
	const data: unknown = await response.json();
	if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid GitHub response");
	return data as Record<string, unknown>;
}

async function startDeviceFlow(domain: string): Promise<DeviceCodeResponse> {
	const urls = getUrls(domain);
	const data = await postJson(
		urls.deviceCodeUrl,
		new URLSearchParams({
			client_id: CLIENT_ID,
			scope: "read:user",
		}).toString(),
		{
			Accept: "application/json",
			"Content-Type": "application/x-www-form-urlencoded",
			"User-Agent": "GitHubCopilotChat/0.35.0",
		},
	);

	if (
		typeof data.device_code !== "string" ||
		typeof data.user_code !== "string" ||
		typeof data.verification_uri !== "string" ||
		(data.interval !== undefined &&
			(typeof data.interval !== "number" || !Number.isFinite(data.interval) || data.interval < 0)) ||
		typeof data.expires_in !== "number"
	) {
		throw new Error("Invalid device code response");
	}

	// Only open the device verification page on the selected GitHub host.
	let verificationUrl: URL;
	try {
		verificationUrl = new URL(data.verification_uri);
	} catch {
		throw new Error("Invalid device verification URL");
	}
	if (
		verificationUrl.protocol !== "https:" ||
		verificationUrl.hostname !== domain ||
		verificationUrl.port ||
		verificationUrl.username ||
		verificationUrl.password
	) {
		throw new Error("Invalid device verification URL");
	}

	return {
		device_code: data.device_code,
		user_code: data.user_code,
		verification_uri: data.verification_uri,
		interval: typeof data.interval === "number" ? data.interval : undefined,
		expires_in: data.expires_in,
	};
}

async function pollForGitHubAccessToken(
	domain: string,
	deviceCode: string,
	intervalSeconds: number | undefined,
	expiresIn: number,
): Promise<string> {
	const urls = getUrls(domain);
	const deadline = Date.now() + expiresIn * 1000;
	let intervalMs = Math.max(1000, (intervalSeconds ?? 5) * 1000);

	while (Date.now() < deadline) {
		await new Promise((r) => setTimeout(r, intervalMs));

		const data = await postJson(
			urls.accessTokenUrl,
			new URLSearchParams({
				client_id: CLIENT_ID,
				device_code: deviceCode,
				grant_type: "urn:ietf:params:oauth:grant-type:device_code",
			}).toString(),
			{
				Accept: "application/json",
				"Content-Type": "application/x-www-form-urlencoded",
				"User-Agent": "GitHubCopilotChat/0.35.0",
			},
		);

		if (typeof data.access_token === "string") {
			return data.access_token;
		}

		if (data.error === "authorization_pending") {
			continue;
		}

		if (data.error === "slow_down") {
			intervalMs = typeof data.interval === "number" && data.interval > 0 ? data.interval * 1000 : intervalMs + 5000;
			continue;
		}

		if (typeof data.error === "string") {
			throw new Error(
				`Device flow failed: ${data.error}${typeof data.error_description === "string" ? `: ${data.error_description}` : ""}`,
			);
		}
	}

	throw new Error("Device flow timed out");
}

async function fetchCopilotToken(githubAccessToken: string, enterpriseDomain?: string): Promise<OAuthCredentials> {
	const domain = enterpriseDomain || "github.com";
	const urls = getUrls(domain);

	if (enterpriseDomain) await allowEnterpriseCopilotRequests(domain);

	// api.github.com has CORS enabled, no proxy needed
	const response = await fetch(urls.copilotTokenUrl, {
		headers: {
			Accept: "application/json",
			Authorization: `Bearer ${githubAccessToken}`,
			...COPILOT_HEADERS,
		},
	});

	if (!response.ok) {
		const text = await response.text().catch(() => "");
		throw new Error(`Copilot token request failed: ${response.status} ${text}`);
	}

	const data: unknown = await response.json();

	if (
		!data ||
		typeof data !== "object" ||
		!("token" in data) ||
		!("expires_at" in data) ||
		typeof data.token !== "string" ||
		typeof data.expires_at !== "number"
	) {
		throw new Error("Invalid Copilot token response");
	}

	return {
		providerId: "github-copilot",
		// Store the GitHub access token as refresh (used to get new Copilot tokens)
		refresh: githubAccessToken,
		access: data.token,
		expires: data.expires_at * 1000 - 5 * 60 * 1000,
		enterpriseUrl: enterpriseDomain,
	};
}

/**
 * Run the GitHub Copilot device code login flow.
 * Returns a callback with the user code and verification URL.
 * The caller should display these to the user and open the verification URL.
 */
export async function loginGitHubCopilot(
	onDeviceCode: (info: { userCode: string; verificationUri: string }) => void,
	enterpriseUrl?: string,
): Promise<OAuthCredentials> {
	const enterpriseDomain = normalizeEnterpriseDomain(enterpriseUrl);
	const domain = enterpriseDomain || "github.com";

	if (enterpriseDomain) await allowEnterpriseCopilotRequests(domain);
	else await clearEnterpriseCopilotRequests();

	const device = await startDeviceFlow(domain);

	onDeviceCode({
		userCode: device.user_code,
		verificationUri: device.verification_uri,
	});

	// Open the verification URL in a new tab
	chrome.tabs.create({ url: device.verification_uri, active: true });

	const githubAccessToken = await pollForGitHubAccessToken(
		domain,
		device.device_code,
		device.interval,
		device.expires_in,
	);

	return fetchCopilotToken(githubAccessToken, enterpriseDomain);
}

/**
 * Refresh a GitHub Copilot token.
 * The "refresh" token is the GitHub access token, used to fetch new Copilot tokens.
 * api.github.com has CORS enabled, no proxy needed.
 */
export async function refreshGitHubCopilot(credentials: OAuthCredentials): Promise<OAuthCredentials> {
	return fetchCopilotToken(credentials.refresh, normalizeEnterpriseDomain(credentials.enterpriseUrl));
}
