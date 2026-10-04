import type { WorkspaceDirectoryHandle, WorkspaceFileHandle, WorkspaceWritableStream } from "./file-system.js";
import { parseWorkspacePath, type ReadonlyWorkspace, WORKSPACE_MAX_FILE_BYTES } from "./readonly-workspace.js";

export type WorkspaceWriteEncoding = "utf8" | "base64";

export interface WorkspaceWriteOptions {
	path: string;
	content: string;
	encoding?: WorkspaceWriteEncoding;
	artifact?: string;
}

export interface WorkspaceWriteRequest {
	folder: string;
	path: string;
	exists: boolean;
	existingSize?: number;
	size: number;
	encoding: WorkspaceWriteEncoding;
	preview?: string;
	artifact?: string;
}

export interface WorkspaceWriteResult {
	folder: string;
	path: string;
	size: number;
	status: "saved";
}

interface WriterOptions {
	confirmWrite: (request: WorkspaceWriteRequest, signal?: AbortSignal) => Promise<boolean>;
	runExclusive?: (task: () => Promise<WorkspaceWriteResult>, signal?: AbortSignal) => Promise<WorkspaceWriteResult>;
}

interface FileSnapshot {
	size: number;
	lastModified: number;
	digest: string;
}

function assertNotAborted(signal?: AbortSignal): void {
	if (signal?.aborted) throw new Error("Working folder write aborted.");
}

function encodeContent(content: string, encoding: WorkspaceWriteEncoding): Blob {
	if (typeof content !== "string") throw new Error("File content must be a string.");
	if (encoding === "utf8") {
		if (content.length > WORKSPACE_MAX_FILE_BYTES) throw new Error("File writes are limited to 20 MB.");
		const blob = new Blob([content]);
		if (blob.size > WORKSPACE_MAX_FILE_BYTES) throw new Error("File writes are limited to 20 MB.");
		return blob;
	}
	if (encoding !== "base64") throw new Error("Use utf8 for text or base64 for binary file content.");
	if (content.length > Math.ceil(WORKSPACE_MAX_FILE_BYTES / 3) * 4 + 4096)
		throw new Error("File writes are limited to 20 MB.");
	const data = content.startsWith("data:") ? content.replace(/^data:[^,]*;base64,/, "") : content;
	if (data.length > Math.ceil(WORKSPACE_MAX_FILE_BYTES / 3) * 4) throw new Error("File writes are limited to 20 MB.");
	if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) throw new Error("Invalid base64 file content.");
	const binary = atob(data);
	if (btoa(binary) !== data) throw new Error("Invalid base64 file content.");
	if (binary.length > WORKSPACE_MAX_FILE_BYTES) throw new Error("File writes are limited to 20 MB.");
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return new Blob([bytes]);
}

async function findFile(directory: WorkspaceDirectoryHandle, name: string): Promise<WorkspaceFileHandle | null> {
	try {
		return await directory.getFileHandle(name);
	} catch (error) {
		if (typeof error === "object" && error !== null && "name" in error && error.name === "NotFoundError") return null;
		throw error;
	}
}

async function snapshot(handle: WorkspaceFileHandle, signal?: AbortSignal): Promise<FileSnapshot> {
	assertNotAborted(signal);
	const file = await handle.getFile();
	if (file.size > WORKSPACE_MAX_FILE_BYTES) throw new Error("Cannot safely replace a file larger than 20 MB.");
	const buffer = await file.arrayBuffer();
	assertNotAborted(signal);
	const digest = await crypto.subtle.digest("SHA-256", buffer);
	assertNotAborted(signal);
	return {
		size: file.size,
		lastModified: file.lastModified,
		digest: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""),
	};
}

function sameSnapshot(first: FileSnapshot, second: FileSnapshot): boolean {
	return first.size === second.size && first.lastModified === second.lastModified && first.digest === second.digest;
}

/** All filesystem mutation stays in the extension, behind UI consent and an exclusive writer. */
export class WorkspaceWriter {
	constructor(
		private workspace: ReadonlyWorkspace,
		private options: WriterOptions,
	) {}

	async writeFile(options: WorkspaceWriteOptions, signal?: AbortSignal): Promise<WorkspaceWriteResult> {
		assertNotAborted(signal);
		const captured = { ...options };
		const parts = parseWorkspacePath(captured.path, false);
		const encoding = captured.encoding ?? "utf8";
		const data = encodeContent(captured.content, encoding);
		const task = () => this.writeLocked(parts, data, encoding, captured, signal);
		if (this.options.runExclusive) return this.options.runExclusive(task, signal);
		if (typeof navigator === "undefined" || !navigator.locks) {
			throw new Error("Safe working folder writes require browser Web Locks. Use downloadable artifacts instead.");
		}
		// Shared across extension windows. Native exclusive streams also exclude other browser writers.
		return navigator.locks.request("sitegeist-working-folder-write", { mode: "exclusive", signal }, task);
	}

	private async writeLocked(
		parts: string[],
		data: Blob,
		encoding: WorkspaceWriteEncoding,
		options: WorkspaceWriteOptions,
		signal?: AbortSignal,
	): Promise<WorkspaceWriteResult> {
		const selection = await this.workspace.getWritableSelection(signal);
		const path = parts.join("/");
		let directory = selection.handle;
		for (const part of parts.slice(0, -1)) {
			assertNotAborted(signal);
			// No directory creation: users must explicitly prepare destination subfolders.
			directory = await directory.getDirectoryHandle(part);
		}
		const name = parts[parts.length - 1];
		const existing = await findFile(directory, name);
		const original = existing ? await snapshot(existing, signal) : null;
		await this.workspace.assertStillWritable(selection, signal);
		// Confirm even new files: FSA has no exclusive-create operation, so a path-specific
		// approval explicitly covers create/replace rather than assuming an absent path stays absent.
		const approved = await this.options.confirmWrite(
			{
				folder: selection.handle.name,
				path,
				exists: Boolean(existing),
				existingSize: original?.size,
				size: data.size,
				encoding,
				preview: encoding === "utf8" ? options.content.slice(0, 2000) : undefined,
				artifact: options.artifact,
			},
			signal,
		);
		assertNotAborted(signal);
		if (!approved) throw new Error("File save cancelled by the user. Nothing was written.");
		await this.workspace.assertStillWritable(selection, signal);

		const current = await findFile(directory, name);
		if (
			Boolean(current) !== Boolean(existing) ||
			(original && current && !sameSnapshot(original, await snapshot(current, signal)))
		) {
			throw new Error(
				"The destination file changed during confirmation. Nothing was written; retry for a new confirmation.",
			);
		}
		await this.workspace.assertStillWritable(selection, signal);
		let stream: WorkspaceWritableStream | undefined;
		let created = false;
		try {
			const handle = current ?? (await directory.getFileHandle(name, { create: true }));
			created = !current;
			const expected = original ?? (await snapshot(handle, signal));
			if (!original && expected.size !== 0)
				throw new Error("A file appeared at the destination. Retry for a new confirmation.");
			await this.workspace.assertStillWritable(selection, signal);
			// Preserve original bytes in staging until all checks have passed and close commits.
			stream = await handle.createWritable({ keepExistingData: true, mode: "exclusive" });
			await this.assertDestination(directory, name, expected, signal);
			await this.workspace.assertStillWritable(selection, signal);
			await stream.write(data);
			assertNotAborted(signal);
			await stream.truncate(data.size);
			await this.assertDestination(directory, name, expected, signal);
			await this.workspace.assertStillWritable(selection, signal);
			// Closing is the commit point. Cancellation afterwards cannot undo saved data.
			await stream.close();
			return { folder: selection.handle.name, path, size: data.size, status: "saved" };
		} catch (error) {
			if (stream) {
				try {
					await stream.abort();
				} catch (abortError) {
					console.warn("Could not abort the working folder stream:", abortError);
				}
			}
			if (created) {
				const message = error instanceof Error ? error.message : String(error);
				throw new Error(`${message} An empty new file may remain; Sitegeist does not delete files.`, {
					cause: error,
				});
			}
			throw error;
		}
	}

	private async assertDestination(
		directory: WorkspaceDirectoryHandle,
		name: string,
		expected: FileSnapshot,
		signal?: AbortSignal,
	): Promise<void> {
		const current = await findFile(directory, name);
		if (!current || !sameSnapshot(expected, await snapshot(current, signal))) {
			throw new Error(
				"The destination file changed while saving. The staged write was cancelled; retry for a new confirmation.",
			);
		}
	}
}
