import {
	type Api,
	getModels,
	type KnownProvider,
	type Model,
	mapReasoningLevel,
	type SimpleStreamOptions,
} from "@mariozechner/pi-ai";
import { getAvailableCopilotModels } from "./copilot-models.js";
import {
	type CatalogResult,
	type CatalogStorage,
	isPiProvider,
	loadPiModelCatalog,
	modelFromPiCatalog,
} from "./pi-model-catalog.js";

export interface ProviderModelsResult {
	models: Model<Api>[];
	warning?: string;
}

/** Translate the UI's Off choice to an explicit API effort only for models that advertise it. */
export function adaptReasoningOptions(
	model: Model<Api>,
	options?: SimpleStreamOptions,
): SimpleStreamOptions | undefined {
	const mapped = mapReasoningLevel(model, options?.reasoning ?? "off");
	if (mapped === "none") return { ...options, reasoning: undefined, reasoningEffort: "none" };
	if (!options) return undefined;
	return mapped !== options.reasoning ? { ...options, reasoning: mapped } : options;
}

export async function getProviderModels(
	provider: string,
	keys: { get: (provider: string) => Promise<string | null>; set: (provider: string, value: string) => Promise<void> },
	settings: CatalogStorage,
	options: { forceRefresh?: boolean; catalogResult?: CatalogResult } = {},
): Promise<ProviderModelsResult> {
	if (!isPiProvider(provider)) return { models: getModels(provider as KnownProvider) };

	const { catalog, warning } = options.catalogResult ?? (await loadPiModelCatalog(settings, options.forceRefresh));
	if (provider === "github-copilot") {
		// pi.dev describes the models, but only Copilot's account catalog grants access to them.
		return { models: await getAvailableCopilotModels(keys, catalog?.[provider]), warning };
	}

	const models =
		catalog?.[provider]
			.map((metadata) => modelFromPiCatalog(provider, metadata))
			.filter((model): model is Model<Api> => model !== null) ?? [];
	if (models.length) return { models, warning };

	return {
		models: getModels(provider),
		warning: warning ?? `No compatible ${provider} models in pi.dev; using bundled models.`,
	};
}
