import { type Api, getModels, type Model } from "@mariozechner/pi-ai";
import { type CopilotModelInfo, fetchGitHubCopilotModels, getGitHubCopilotBaseUrl } from "../oauth/github-copilot.js";
import { isOAuthCredentials, parseOAuthCredentials, resolveApiKey } from "../oauth/index.js";
import { modelFromPiCatalog, type PiModelMetadata } from "./pi-model-catalog.js";

export type CopilotModelApi = "openai-completions" | "openai-responses" | "anthropic-messages";

export interface ManualCopilotModel {
	domain: string;
	id: string;
	api: CopilotModelApi;
}

export function parseManualCopilotModels(value: unknown): ManualCopilotModel[] {
	if (!Array.isArray(value)) return [];
	return (value as unknown[]).filter((entry): entry is ManualCopilotModel => {
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
		const model = entry as Record<string, unknown>;
		return (
			typeof model.domain === "string" &&
			typeof model.id === "string" &&
			model.id.length <= 200 &&
			/^[a-z0-9][a-z0-9._:/+-]*$/i.test(model.id) &&
			(model.api === "openai-completions" || model.api === "openai-responses" || model.api === "anthropic-messages")
		);
	});
}

export function inferCopilotModelApi(model: CopilotModelInfo): CopilotModelApi {
	const endpoints = model.supportedEndpoints.map((endpoint) => endpoint.toLowerCase());
	if (
		model.vendor?.toLowerCase().includes("anthropic") ||
		model.id.toLowerCase().startsWith("claude-") ||
		endpoints.some((endpoint) => endpoint.includes("anthropic"))
	) {
		return "anthropic-messages";
	}
	if (/^gpt-5/i.test(model.id) || endpoints.some((endpoint) => endpoint.includes("responses"))) {
		return "openai-responses";
	}
	return "openai-completions";
}

/** Known models keep their transport and capabilities. New IDs use a compatible Copilot model as a template. */
export function createCopilotModel(
	model: CopilotModelInfo,
	baseUrl: string,
	apiOverride?: CopilotModelApi,
): Model<Api> {
	const knownModels = getModels("github-copilot");
	const known = knownModels.find((item) => item.id === model.id);
	const api = apiOverride ?? (known?.api as CopilotModelApi | undefined) ?? inferCopilotModelApi(model);
	const template = known?.api === api ? known : knownModels.find((item) => item.api === api);
	if (!template) throw new Error(`No Copilot transport available for ${api}`);

	return {
		...template,
		id: model.id,
		name: model.name === model.id && known?.api === api ? known.name : model.name,
		api,
		baseUrl,
		reasoning: model.reasoning ?? (known?.api === api ? known.reasoning : template.reasoning),
		input:
			model.vision === undefined && known?.api === api ? known.input : model.vision ? ["text", "image"] : ["text"],
		contextWindow: model.contextWindow ?? template.contextWindow,
		maxTokens: model.maxTokens ?? template.maxTokens,
	};
}

export function createManualCopilotModel(id: string, api: CopilotModelApi, baseUrl: string): Model<Api> {
	const trimmedId = id.trim();
	if (trimmedId.length > 200 || !/^[a-z0-9][a-z0-9._:/+-]*$/i.test(trimmedId)) {
		throw new Error("Enter a valid Copilot model ID (letters, numbers, /, -, _, ., :, +)");
	}
	return createCopilotModel({ id: trimmedId, name: trimmedId, supportedEndpoints: [] }, baseUrl, api);
}

interface CopilotKeyStorage {
	get: (provider: string) => Promise<string | null>;
	set: (provider: string, value: string) => Promise<void>;
}

export async function getCopilotAccountDomain(storage: CopilotKeyStorage): Promise<string> {
	const stored = await storage.get("github-copilot");
	if (!stored) throw new Error("Log in to GitHub Copilot to use its models");
	const enterpriseUrl = isOAuthCredentials(stored) ? parseOAuthCredentials(stored).enterpriseUrl : undefined;
	if (!enterpriseUrl) return "github.com";
	return new URL(enterpriseUrl.includes("://") ? enterpriseUrl : `https://${enterpriseUrl}`).hostname;
}

async function getCopilotAccess(storage: CopilotKeyStorage): Promise<{ token: string; enterpriseUrl?: string }> {
	const stored = await storage.get("github-copilot");
	if (!stored) throw new Error("Log in to GitHub Copilot to use its models");

	// Keep the domain from the same credentials as the token to avoid routing it to a different account.
	const enterpriseUrl = isOAuthCredentials(stored) ? parseOAuthCredentials(stored).enterpriseUrl : undefined;
	const token = await resolveApiKey(stored, "github-copilot", storage);
	return { token, enterpriseUrl };
}

export async function getAvailableCopilotModels(
	storage: CopilotKeyStorage,
	piModels: PiModelMetadata[] = [],
): Promise<Model<Api>[]> {
	const { token, enterpriseUrl } = await getCopilotAccess(storage);
	const baseUrl = getGitHubCopilotBaseUrl(token, enterpriseUrl);
	const accountModels = await fetchGitHubCopilotModels(token, enterpriseUrl);
	const metadata = new Map(piModels.map((model) => [model.id, model]));
	return accountModels.map((model) => {
		const piModel = metadata.get(model.id);
		const fromPi = piModel && modelFromPiCatalog("github-copilot", piModel, baseUrl);
		if (!fromPi) return createCopilotModel(model, baseUrl);
		return {
			...fromPi,
			name: model.name === model.id ? fromPi.name : model.name,
			reasoning: model.reasoning ?? fromPi.reasoning,
			input: model.vision === undefined ? fromPi.input : model.vision ? ["text", "image"] : ["text"],
			contextWindow: model.contextWindow ?? fromPi.contextWindow,
			maxTokens: model.maxTokens ?? fromPi.maxTokens,
		};
	});
}

export async function getManualCopilotBaseUrl(storage: CopilotKeyStorage): Promise<string> {
	const { token, enterpriseUrl } = await getCopilotAccess(storage);
	return getGitHubCopilotBaseUrl(token, enterpriseUrl);
}
