import { Store, type StoreConfig } from "@mariozechner/pi-web-ui";
import type { WorkspaceRepository, WorkspaceSelection } from "../../workspace/file-system.js";

/** File-system handles require IndexedDB structured cloning, not JSON or chrome.storage. */
export class WorkspaceStore extends Store implements WorkspaceRepository {
	getConfig(): StoreConfig {
		return { name: "workspace" };
	}

	async get(): Promise<WorkspaceSelection | null> {
		return this.getBackend().get("workspace", "selected");
	}

	async save(selection: WorkspaceSelection): Promise<void> {
		await this.getBackend().set("workspace", "selected", selection);
	}

	async replace(expectedId: string, selection: WorkspaceSelection): Promise<boolean> {
		return this.getBackend().transaction(["workspace"], "readwrite", async (transaction) => {
			const current = await transaction.get<WorkspaceSelection>("workspace", "selected");
			if (current?.id !== expectedId) return false;
			await transaction.set("workspace", "selected", selection);
			return true;
		});
	}

	async clear(): Promise<void> {
		await this.getBackend().delete("workspace", "selected");
	}
}
