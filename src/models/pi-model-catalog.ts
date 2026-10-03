import { type Api, getModels, type Model } from "@mariozechner/pi-ai";

/** pi.dev publishes the models displayed at https://pi.dev/models as this JSON API. */
export const PI_MODELS_URL = "https://pi.dev/api/models";
const CACHE_KEY = "pi.modelsCatalog.v1";
export const CATALOG_MAX_AGE_MS = 60 * 60 * 1000;
const FAILED_RETRY_MS = 2 * 60 * 1000;

export const PI_PROVIDERS = ["anthropic", "openai-codex", "openai", "github-copilot"] as const;
export type PiProvider = (typeof PI_PROVIDERS)[number];

const SUPPORTED_APIS: Record<PiProvider, readonly string[]> = {
	anthropic: ["anthropic-messages"],
	"openai-codex": ["openai-codex-responses"],
	openai: ["openai-responses", "openai-completions"],
	"github-copilot": ["anthropic-messages", "openai-responses", "openai-completions"],
};

export interface PiModelMetadata {
	id: string;
	name: string;
	api: Api;
	reasoning: boolean;
	input: ("text" | "image")[];
	cost: Model<Api>["cost"];
	contextWindow: number;
	maxTokens: number;
	compat?: Record<string, boolean>;
	thinkingLevelMap?: Model<Api>["thinkingLevelMap"];
}

export type PiModelCatalog = Record<PiProvider, PiModelMetadata[]>;

export interface CatalogResult {
	catalog: PiModelCatalog | null;
	warning?: string;
}

export interface CatalogStorage {
	get<T>(key: string): Promise<T | null>;
	set<T>(key: string, value: T): Promise<void>;
}

const recentFailures = new WeakMap<CatalogStorage, { checkedAt: number; result: CatalogResult }>();

function asRecord(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function nonNegativeNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;

const COMPAT_FLAGS = [
	"supportsStore",
	"supportsDeveloperRole",
	"supportsReasoningEffort",
	"supportsUsageInStreaming",
	"requiresToolResultName",
	"requiresAssistantAfterToolResult",
	"requiresThinkingAsText",
	"supportsStrictMode",
] as const;

/** Validate and retain only metadata supported by our installed pi-ai runtime. */
export function parsePiModelCatalog(value: unknown): PiModelCatalog {
	const root = asRecord(value);
	if (!root) throw new Error("Invalid pi.dev model catalog");

	const catalog: PiModelCatalog = { anthropic: [], "openai-codex": [], openai: [], "github-copilot": [] };
	for (const provider of PI_PROVIDERS) {
		const models = asRecord(root[provider]);
		if (!models) continue;
		for (const [id, raw] of Object.entries(models)) {
			const model = asRecord(raw);
			if (
				!model ||
				model.type !== "chat" ||
				model.provider !== provider ||
				model.id !== id ||
				id.length === 0 ||
				id.length > 200 ||
				typeof model.name !== "string" ||
				model.name.length === 0 ||
				model.name.length > 256 ||
				typeof model.api !== "string" ||
				!SUPPORTED_APIS[provider].includes(model.api) ||
				typeof model.reasoning !== "boolean" ||
				!Array.isArray(model.input) ||
				!model.input.includes("text") ||
				!nonNegativeNumber(model.contextWindow) ||
				model.contextWindow === 0 ||
				!nonNegativeNumber(model.maxTokens) ||
				model.maxTokens === 0
			)
				continue;

			const rawCost = asRecord(model.cost);
			if (
				!rawCost ||
				!["input", "output", "cacheRead", "cacheWrite"].every((key) => nonNegativeNumber(rawCost[key]))
			)
				continue;
			const cost: Model<Api>["cost"] = {
				input: rawCost.input as number,
				output: rawCost.output as number,
				cacheRead: rawCost.cacheRead as number,
				cacheWrite: rawCost.cacheWrite as number,
			};

			const rawThinkingMap = asRecord(model.thinkingLevelMap);
			const thinkingLevelMap: NonNullable<Model<Api>["thinkingLevelMap"]> = {};
			if (rawThinkingMap) {
				for (const level of THINKING_LEVELS) {
					const mapped = rawThinkingMap[level];
					if (
						mapped === null ||
						mapped === "none" ||
						mapped === "minimal" ||
						mapped === "low" ||
						mapped === "medium" ||
						mapped === "high" ||
						mapped === "xhigh"
					)
						thinkingLevelMap[level] = mapped;
				}
			}

			const rawCompat = asRecord(model.compat);
			const compat: Record<string, boolean> = {};
			if (model.api === "openai-completions" && rawCompat) {
				for (const key of COMPAT_FLAGS) {
					if (typeof rawCompat[key] === "boolean") compat[key] = rawCompat[key];
				}
			}

			catalog[provider].push({
				id,
				name: model.name,
				api: model.api,
				reasoning: model.reasoning,
				input: model.input.includes("image") ? ["text", "image"] : ["text"],
				cost,
				contextWindow: model.contextWindow,
				maxTokens: model.maxTokens,
				...(Object.keys(compat).length ? { compat } : {}),
				...(Object.keys(thinkingLevelMap).length ? { thinkingLevelMap } : {}),
			});
		}
	}
	if (PI_PROVIDERS.every((provider) => catalog[provider].length === 0)) {
		throw new Error("pi.dev returned no supported chat models");
	}
	return catalog;
}

/** Keep the bundled URL and headers: remote catalog data must never redirect OAuth tokens to another host. */
export function modelFromPiCatalog(
	provider: PiProvider,
	metadata: PiModelMetadata,
	baseUrl?: string,
): Model<Api> | null {
	if (!SUPPORTED_APIS[provider].includes(metadata.api)) return null;
	const knownModels = getModels(provider);
	const template =
		knownModels.find((model) => model.id === metadata.id && model.api === metadata.api) ??
		knownModels.find((model) => model.api === metadata.api);
	if (!template) return null;

	const compat =
		metadata.api === "openai-completions" && metadata.compat
			? { ...(template as Model<"openai-completions">).compat, ...metadata.compat }
			: template.compat;
	return {
		...template,
		id: metadata.id,
		name: metadata.name,
		api: metadata.api,
		provider,
		baseUrl: baseUrl ?? template.baseUrl,
		reasoning: metadata.reasoning,
		input: metadata.input,
		cost: provider === "github-copilot" ? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } : metadata.cost,
		contextWindow: metadata.contextWindow,
		maxTokens: metadata.maxTokens,
		compat,
		thinkingLevelMap: metadata.thinkingLevelMap ?? template.thinkingLevelMap,
	};
}

export function isPiProvider(provider: string): provider is PiProvider {
	return PI_PROVIDERS.some((id) => id === provider);
}

export async function loadPiModelCatalog(storage: CatalogStorage, forceRefresh = false): Promise<CatalogResult> {
	let cached: PiModelCatalog | null = null;
	let fetchedAt = 0;
	try {
		const saved = asRecord(await storage.get<unknown>(CACHE_KEY));
		if (saved && nonNegativeNumber(saved.fetchedAt)) {
			cached = parsePiModelCatalog(saved.data);
			fetchedAt = saved.fetchedAt;
		}
	} catch (error) {
		console.warn("Could not load cached pi.dev models:", error);
	}

	if (!forceRefresh && cached && Date.now() >= fetchedAt && Date.now() - fetchedAt < CATALOG_MAX_AGE_MS) {
		return { catalog: cached };
	}
	const failed = recentFailures.get(storage);
	if (!forceRefresh && failed && Date.now() - failed.checkedAt < FAILED_RETRY_MS) return failed.result;

	try {
		const response = await fetch(PI_MODELS_URL, {
			headers: { Accept: "application/json" },
			signal: AbortSignal.timeout(10_000),
		});
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		const raw: unknown = await response.json();
		const catalog = parsePiModelCatalog(raw);
		const source = asRecord(raw);
		const data = Object.fromEntries(PI_PROVIDERS.map((provider) => [provider, source?.[provider]]));
		try {
			await storage.set(CACHE_KEY, { fetchedAt: Date.now(), data });
		} catch (error) {
			console.warn("Could not cache pi.dev models:", error);
		}
		recentFailures.delete(storage);
		return { catalog };
	} catch (error) {
		const reason = error instanceof Error ? error.message : "Network error";
		const result: CatalogResult = {
			catalog: cached,
			warning: cached
				? `pi.dev is unavailable (${reason}); using cached model metadata.`
				: `pi.dev is unavailable (${reason}); using bundled models.`,
		};
		recentFailures.set(storage, { checkedAt: Date.now(), result });
		return result;
	}
}
