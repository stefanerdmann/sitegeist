import { i18n } from "@mariozechner/mini-lit";
import { Button } from "@mariozechner/mini-lit/dist/Button.js";
import { DialogContent, DialogHeader } from "@mariozechner/mini-lit/dist/Dialog.js";
import { DialogBase } from "@mariozechner/mini-lit/dist/DialogBase.js";
import { html } from "lit";
import type { WorkspaceWriteRequest } from "../workspace/workspace-writer.js";
import "../utils/i18n-extension.js";

export class WorkspaceWriteDialog extends DialogBase {
	private details?: WorkspaceWriteRequest;
	private resolveConfirmation?: (approved: boolean) => void;
	private signal?: AbortSignal;
	private abortListener = () => this.close();
	protected modalWidth = "min(600px, 90vw)";
	protected modalHeight = "min(700px, 90vh)";

	static confirm(details: WorkspaceWriteRequest, signal?: AbortSignal): Promise<boolean> {
		if (signal?.aborted) return Promise.resolve(false);
		const dialog = new WorkspaceWriteDialog();
		dialog.details = { ...details };
		dialog.signal = signal;
		return new Promise((resolve) => {
			dialog.resolveConfirmation = resolve;
			signal?.addEventListener("abort", dialog.abortListener, { once: true });
			dialog.open();
			if (signal?.aborted) dialog.close();
		});
	}

	private finish(approved: boolean): void {
		this.signal?.removeEventListener("abort", this.abortListener);
		const resolve = this.resolveConfirmation;
		this.resolveConfirmation = undefined;
		resolve?.(approved);
	}

	override close(): void {
		this.finish(false);
		super.close();
	}

	override disconnectedCallback(): void {
		this.finish(false);
		super.disconnectedCallback();
	}

	private displayName(value: string): string {
		// Make bidi overrides visible rather than letting filenames spoof the confirmation target.
		return JSON.stringify(value).replace(
			/[\u202a-\u202e\u2066-\u2069]/g,
			(character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
		);
	}

	protected renderContent() {
		const details = this.details;
		if (!details) return html``;
		return DialogContent({
			className: "h-full min-h-0 bg-background text-foreground",
			children: html`
				${DialogHeader({ title: details.exists ? i18n("Replace existing file") : i18n("Save file"), className: "shrink-0" })}
				<div class="space-y-3 mt-4 text-sm min-h-0 flex-1 overflow-y-auto">
					<p>${i18n("Working folder")}: <strong>${this.displayName(details.folder)}</strong></p>
					<code class="block break-all" dir="ltr">${this.displayName(details.path)}</code>
					<p>${i18n("Bytes to save")}: ${details.size.toLocaleString()}</p>
					${details.exists ? html`<p>${i18n("Existing file size")}: ${details.existingSize?.toLocaleString()}</p>` : ""}
					${details.artifact ? html`<p>${i18n("Source artifact")}: ${this.displayName(details.artifact)}</p>` : ""}
					<p class="text-amber-700 dark:text-amber-300">
						${i18n("This saves only the shown file. Any existing contents at this path will be replaced. Saved changes cannot be undone by Sitegeist.")}
					</p>
					${
						details.preview !== undefined
							? html`
							<p class="font-medium">${i18n("New content (preview)")}</p>
							<pre class="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded border border-border bg-muted text-foreground p-3 text-xs">${details.preview}</pre>
						`
							: html`<p class="text-muted-foreground">${i18n("Binary file: review the source artifact before saving.")}</p>`
					}
				</div>
				<div class="flex justify-end gap-2 mt-6 shrink-0">
					${Button({ variant: "outline", children: i18n("Cancel"), onClick: () => this.close() })}
					${Button({
						variant: details.exists ? "destructive" : "default",
						children: details.exists ? i18n("Replace existing file") : i18n("Save file"),
						onClick: () => {
							this.finish(true);
							this.close();
						},
					})}
				</div>
			`,
		});
	}
}

customElements.define("workspace-write-dialog", WorkspaceWriteDialog);
