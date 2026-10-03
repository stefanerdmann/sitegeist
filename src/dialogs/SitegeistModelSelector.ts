import { Button } from "@mariozechner/mini-lit/dist/Button.js";
import { DialogHeader } from "@mariozechner/mini-lit/dist/Dialog.js";
import { DialogBase } from "@mariozechner/mini-lit/dist/DialogBase.js";
import { Input } from "@mariozechner/mini-lit/dist/Input.js";
import type { Api, Model } from "@mariozechner/pi-ai";
import { getAppStorage, ModelSelector } from "@mariozechner/pi-web-ui";
import { html, type TemplateResult } from "lit";
import {
	type CopilotModelApi,
	createManualCopilotModel,
	getCopilotAccountDomain,
	getManualCopilotBaseUrl,
	parseManualCopilotModels,
} from "../models/copilot-models.js";
import { isPiProvider, loadPiModelCatalog } from "../models/pi-model-catalog.js";
import { getProviderModels } from "../models/provider-models.js";

const MANUAL_COPILOT_MODELS_KEY = "github-copilot.manualModels";

export class SitegeistModelSelector extends DialogBase {
	private currentModel: Model<Api> | null = null;
	private providers: string[] = [];
	private onSelect?: (model: Model<Api>) => void;
	private models: Model<Api>[] = [];
	private manualModelIds = new Set<string>();
	private modelsLoading = false;
	private copilotError = "";
	private modelWarnings: string[] = [];
	private manualError = "";
	private searchQuery = "";
	private manualId = "";
	private manualApi: CopilotModelApi = "openai-completions";
	private selectedIndex = 0;

	protected override modalWidth = "min(480px, 95vw)";
	protected override modalHeight = "min(650px, 85vh)";

	static open(currentModel: Model<Api> | null, providers: string[], onSelect: (model: Model<Api>) => void) {
		const selector = new SitegeistModelSelector();
		selector.currentModel = currentModel;
		selector.providers = providers;
		selector.onSelect = onSelect;
		selector.open();
		void selector.loadModels();
	}

	private get hasCopilot(): boolean {
		return this.providers.includes("github-copilot");
	}

	private async loadModels(forceRefresh = false) {
		const storage = getAppStorage();
		this.models = [];
		this.copilotError = "";
		this.modelWarnings = [];
		this.manualModelIds.clear();
		this.modelsLoading = true;
		this.selectedIndex = 0;
		this.requestUpdate();

		try {
			// Keep manually configured custom provider models available. Auto-discovery providers
			// remain accessible through the original selector ("Other/custom providers" below).
			const customProviders = await storage.customProviders.getAll();
			this.models.push(...customProviders.flatMap((provider) => provider.models ?? []));
			this.requestUpdate();
		} catch (error) {
			console.warn("Could not load custom provider models:", error);
		}

		const catalogResult = this.providers.some(isPiProvider)
			? await loadPiModelCatalog(storage.settings, forceRefresh)
			: undefined;
		for (const provider of this.providers) {
			try {
				const result = await getProviderModels(provider, storage.providerKeys, storage.settings, { catalogResult });
				this.models.push(...result.models);
				if (result.warning && !this.modelWarnings.includes(result.warning)) this.modelWarnings.push(result.warning);
			} catch (error) {
				const message = error instanceof Error ? error.message : "Could not load models";
				if (provider === "github-copilot") this.copilotError = message;
				else this.modelWarnings.push(`${provider}: ${message}`);
			}
		}

		if (this.hasCopilot) {
			try {
				await this.loadManualModels();
			} catch (error) {
				console.warn("Could not load manually configured Copilot models:", error);
			}
		}
		this.modelsLoading = false;
		this.requestUpdate();
	}

	private async loadManualModels() {
		const storage = getAppStorage();
		const domain = await getCopilotAccountDomain(storage.providerKeys);
		const stored = await storage.settings.get<unknown>(MANUAL_COPILOT_MODELS_KEY);
		const saved = [
			...new Map(
				parseManualCopilotModels(stored)
					.filter((item) => item.domain === domain)
					.map((item) => [item.id, item]),
			).values(),
		];
		if (saved.length === 0) return;

		const baseUrl = await getManualCopilotBaseUrl(storage.providerKeys);
		const ids = new Set(saved.map((item) => item.id));
		this.models = this.models.filter((model) => model.provider !== "github-copilot" || !ids.has(model.id));
		this.models.push(...saved.map(({ id, api }) => createManualCopilotModel(id, api, baseUrl)));
		this.manualModelIds = ids;
	}

	private get filteredModels(): Model<Api>[] {
		const terms = this.searchQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);
		return this.models
			.filter((model) => {
				const text = `${model.provider} ${model.id} ${model.name}`.toLowerCase();
				return terms.every((term) => text.includes(term));
			})
			.sort((a, b) => {
				const aCurrent = a.provider === this.currentModel?.provider && a.id === this.currentModel.id;
				const bCurrent = b.provider === this.currentModel?.provider && b.id === this.currentModel.id;
				if (aCurrent !== bCurrent) return aCurrent ? -1 : 1;
				return a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name);
			});
	}

	private select(model: Model<Api>) {
		this.onSelect?.(model);
		this.close();
	}

	private async selectManualModel() {
		this.manualError = "";
		try {
			const storage = getAppStorage();
			const baseUrl = await getManualCopilotBaseUrl(storage.providerKeys);
			const model = createManualCopilotModel(this.manualId, this.manualApi, baseUrl);
			const domain = await getCopilotAccountDomain(storage.providerKeys);
			const stored = parseManualCopilotModels(await storage.settings.get<unknown>(MANUAL_COPILOT_MODELS_KEY));
			await storage.settings.set(MANUAL_COPILOT_MODELS_KEY, [
				...stored.filter((item) => item.domain !== domain || item.id !== model.id),
				{ domain, id: model.id, api: this.manualApi },
			]);
			this.select(model);
		} catch (error) {
			this.manualError = error instanceof Error ? error.message : "Could not use this model";
			this.requestUpdate();
		}
	}

	private async removeManualModel(id: string) {
		try {
			const storage = getAppStorage();
			const domain = await getCopilotAccountDomain(storage.providerKeys);
			const stored = parseManualCopilotModels(await storage.settings.get<unknown>(MANUAL_COPILOT_MODELS_KEY));
			await storage.settings.set(
				MANUAL_COPILOT_MODELS_KEY,
				stored.filter((item) => item.domain !== domain || item.id !== id),
			);
			await this.loadModels();
		} catch (error) {
			this.manualError = error instanceof Error ? error.message : "Could not remove this model";
			this.requestUpdate();
		}
	}

	private showAllModels() {
		this.close();
		void ModelSelector.open(this.currentModel, (model) => this.onSelect?.(model));
	}

	protected override renderContent(): TemplateResult {
		const filtered = this.filteredModels;
		const currentCopilotMissing =
			this.currentModel?.provider === "github-copilot" &&
			!this.modelsLoading &&
			!this.copilotError &&
			!this.models.some((model) => model.provider === "github-copilot" && model.id === this.currentModel?.id);

		return html`
			<div class="flex flex-col h-full min-h-0 text-foreground">
				<div class="p-5 pb-3 flex flex-col gap-3 border-b border-border">
					${DialogHeader({ title: "Select model" })}
					${Input({
						type: "search",
						placeholder: "Search provider models...",
						value: this.searchQuery,
						onInput: (e) => {
							this.searchQuery = (e.target as HTMLInputElement).value;
							this.selectedIndex = 0;
							this.requestUpdate();
						},
						onKeyDown: (e) => {
							if (e.key === "ArrowDown" || e.key === "ArrowUp") {
								e.preventDefault();
								this.selectedIndex = Math.max(
									0,
									Math.min(this.selectedIndex + (e.key === "ArrowDown" ? 1 : -1), filtered.length - 1),
								);
								this.requestUpdate();
							} else if (e.key === "Enter" && filtered[this.selectedIndex]) {
								e.preventDefault();
								this.select(filtered[this.selectedIndex]);
							}
						},
					})}
					${this.modelsLoading ? html`<p class="text-xs text-muted-foreground">Loading model metadata${this.hasCopilot ? " and your Copilot models" : ""}...</p>` : ""}
					<p class="text-xs text-muted-foreground">Provider models from pi.dev. Subscription access can differ; Copilot is checked against your account.</p>
					${this.modelWarnings.map((warning) => html`<p class="text-xs text-orange-500">${warning}</p>`)}
					${this.copilotError ? html`<p class="text-xs text-destructive">Copilot models could not be loaded: ${this.copilotError}</p>` : ""}
					${currentCopilotMissing ? html`<p class="text-xs text-orange-500">The current model is not in your Copilot catalog. Choose an available model below.</p>` : ""}
				</div>
				<div class="flex-1 min-h-0 overflow-y-auto">
					${filtered.length === 0 && !this.modelsLoading ? html`<p class="p-4 text-sm text-muted-foreground">${this.hasCopilot ? "No matching models. You can enter a Copilot model ID below." : "No matching models."}</p>` : ""}
					${filtered.map(
						(model, index) => html`
						<div class="flex border-b border-border hover:bg-muted ${index === this.selectedIndex ? "bg-accent" : ""}">
							<button type="button" class="flex-1 min-w-0 text-left px-5 py-3" @click=${() => this.select(model)}>
								<div class="flex justify-between gap-2 text-sm font-medium">
									<span class="truncate">${model.name}${this.currentModel?.id === model.id && this.currentModel.provider === model.provider ? " ✓" : ""}</span>
									<span class="text-xs text-muted-foreground shrink-0">${model.provider}</span>
								</div>
								<div class="text-xs text-muted-foreground truncate">${model.id}${this.manualModelIds.has(model.id) && model.provider === "github-copilot" ? " · Manual" : ""}</div>
							</button>
							${
								this.manualModelIds.has(model.id) && model.provider === "github-copilot"
									? Button({
											variant: "ghost",
											size: "sm",
											className: "self-center mr-2",
											title: `Remove manual model ${model.id}`,
											onClick: () => {
												void this.removeManualModel(model.id);
											},
											children: "Remove",
										})
									: ""
							}
						</div>
					`,
					)}
				</div>
				<div class="p-4 border-t border-border flex flex-col gap-2">
					${
						this.hasCopilot
							? html`
						<p class="text-xs text-muted-foreground">Model not listed? Enter its exact Copilot ID. For unknown models, choose the compatible API protocol.</p>
						<div class="flex gap-2 items-end">
							<div class="flex-1 min-w-0">${Input({
								label: "Copilot model ID",
								placeholder: "e.g. sol or luna",
								value: this.manualId,
								onInput: (e) => {
									this.manualId = (e.target as HTMLInputElement).value;
								},
								onKeyDown: (e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										void this.selectManualModel();
									}
								},
							})}</div>
							${Button({
								variant: "outline",
								size: "sm",
								onClick: () => {
									void this.selectManualModel();
								},
								children: "Use ID",
							})}
						</div>
						<label class="text-xs text-muted-foreground" for="copilot-model-api">API protocol for manually entered models</label>
						<select
							id="copilot-model-api"
							class="w-full h-9 px-3 text-sm border border-input rounded-md bg-background text-foreground"
							.value=${this.manualApi}
							@change=${(e: Event) => {
								this.manualApi = (e.target as HTMLSelectElement).value as CopilotModelApi;
							}}
						>
							<option value="openai-completions">OpenAI Chat Completions</option>
							<option value="openai-responses">OpenAI Responses</option>
							<option value="anthropic-messages">Anthropic Messages</option>
						</select>
						${this.manualError ? html`<p class="text-xs text-destructive">${this.manualError}</p>` : ""}
					`
							: ""
					}
					${Button({
						variant: "ghost",
						size: "sm",
						disabled: this.modelsLoading,
						onClick: () => {
							void this.loadModels(true);
						},
						children: "Refresh models",
					})}
					${Button({ variant: "ghost", size: "sm", onClick: () => this.showAllModels(), children: "Other/custom providers (unfiltered)" })}
				</div>
			</div>
		`;
	}
}

if (!customElements.get("sitegeist-model-selector")) {
	customElements.define("sitegeist-model-selector", SitegeistModelSelector);
}
