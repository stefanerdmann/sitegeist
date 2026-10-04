import { i18n } from "@mariozechner/mini-lit";
import { Button } from "@mariozechner/mini-lit/dist/Button.js";
import { SettingsTab } from "@mariozechner/pi-web-ui";
import { html } from "lit";
import type { ReadonlyWorkspace } from "../workspace/readonly-workspace.js";
import "../utils/i18n-extension.js";

export class WorkspaceTab extends SettingsTab {
	private unsubscribe?: () => void;
	private busy = false;
	private errorMessage = "";

	constructor(private workspace: ReadonlyWorkspace) {
		super();
	}

	getTabName(): string {
		return i18n("Folder");
	}

	connectedCallback(): void {
		super.connectedCallback();
		this.unsubscribe = this.workspace.subscribe(() => this.requestUpdate());
		void this.workspace.refresh();
	}

	disconnectedCallback(): void {
		this.unsubscribe?.();
		this.unsubscribe = undefined;
		super.disconnectedCallback();
	}

	private async runAction(action: () => Promise<unknown>): Promise<void> {
		if (this.busy) return;
		this.busy = true;
		this.errorMessage = "";
		this.requestUpdate();
		try {
			// Invoke before any await so picker/permission requests run within the click gesture.
			await action();
		} catch (error) {
			this.errorMessage = error instanceof Error ? error.message : String(error);
		} finally {
			this.busy = false;
			this.requestUpdate();
		}
	}

	render() {
		const state = this.workspace.state;
		return html`
			<div class="flex flex-col gap-4">
				<h3 class="font-semibold text-foreground">${i18n("Working folder")}</h3>
				<p class="text-sm text-muted-foreground">
					${i18n("Choose a local folder that Sitegeist can list and read. Access starts read-only; writing requires a separate opt-in. Files cannot be deleted.")}
				</p>
				<p class="text-sm text-muted-foreground">
					${i18n("Selecting a folder does not upload its contents. Only files read for your request are included in the chat and sent to the selected AI provider.")}
				</p>
				<p class="text-xs text-muted-foreground">
					${i18n("The selected folder is shared across chats and windows. Chrome may ask you to grant read access again after restarting.")}
				</p>

				${
					state.name
						? html`
						<div class="rounded-lg border border-border p-4 space-y-2">
							<div class="font-medium break-all">${state.name}</div>
							<div class="text-xs text-muted-foreground">${state.writeEnabled ? i18n("Read and write") : i18n("Read-only")}</div>
							<p class="text-sm ${state.permission === "granted" ? "text-muted-foreground" : "text-warning"}" role="status">
								${
									state.permission === "granted"
										? i18n("Read access is ready. Ask Sitegeist to list files or read a file in this folder.")
										: i18n(
												"Read access needs confirmation. Click Grant read access or choose the folder again.",
											)
								}
							</p>
							${
								state.writeEnabled
									? html`
								<p class="text-sm ${state.writePermission === "granted" ? "text-muted-foreground" : "text-warning"}" role="status">
									${
										state.writePermission === "granted"
											? i18n(
													"Writing is enabled. Every save requires a separate confirmation for the exact file and content.",
												)
											: i18n("Write access needs confirmation. Click Read and write to renew it.")
									}
								</p>
							`
									: ""
							}
						</div>
					`
						: html`<p class="text-sm text-muted-foreground" role="status">${i18n("No working folder selected")}</p>`
				}

				${
					!state.supported
						? html`<p class="text-sm text-warning">${i18n("Folder access is unavailable in this browser. Use chat attachments instead.")}</p>`
						: ""
				}

				<div class="flex flex-wrap gap-2">
					${Button({
						variant: "outline",
						disabled: this.busy || !state.supported,
						children: state.name ? i18n("Change folder") : i18n("Choose folder"),
						onClick: () => this.runAction(() => this.workspace.chooseFolder()),
					})}
					${
						state.name && state.permission !== "granted"
							? Button({
									variant: "default",
									disabled: this.busy,
									children: i18n("Grant read access"),
									onClick: () => this.runAction(() => this.workspace.grantReadAccess()),
								})
							: ""
					}
					${
						state.name && (!state.writeEnabled || state.writePermission !== "granted")
							? Button({
									variant: "outline",
									disabled: this.busy,
									children: i18n("Read and write"),
									onClick: () => this.runAction(() => this.workspace.grantWriteAccess()),
								})
							: ""
					}
					${
						state.writeEnabled
							? Button({
									variant: "outline",
									disabled: this.busy,
									children: i18n("Use read-only access"),
									onClick: () => this.runAction(() => this.workspace.useReadOnly()),
								})
							: ""
					}
					${
						state.name || state.error
							? Button({
									variant: "outline",
									disabled: this.busy,
									children: i18n("Disconnect folder"),
									onClick: () => this.runAction(() => this.workspace.disconnect()),
								})
							: ""
					}
				</div>

				${
					this.errorMessage || state.error
						? html`<div class="text-sm text-destructive break-words" role="alert">${this.errorMessage || state.error}</div>`
						: ""
				}

				<p class="text-xs text-muted-foreground">
					${i18n("Read-only mode blocks Sitegeist writes even if Chrome remembers write permission. It does not undo changes already saved.")}
				</p>
				<p class="text-xs text-muted-foreground">
					${i18n("Disconnecting stops future folder access. Previously read content remains in the conversation; delete the session to remove its local copy.")}
				</p>
				<p class="text-xs text-muted-foreground">
					${i18n("Supports text/code, PDF, Word, Excel, PowerPoint and common images, up to 20 MB per file. Generated artifacts can be saved to the folder only with write access and confirmation.")}
				</p>
			</div>
		`;
	}
}

customElements.define("workspace-tab", WorkspaceTab);
