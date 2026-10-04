import type {
	WorkspaceDirectoryHandle,
	WorkspaceDirectoryPicker,
	WorkspaceRepository,
	WorkspaceSelection,
} from "./file-system.js";

export const WORKSPACE_MAX_FILE_BYTES = 20 * 1024 * 1024;
export const WORKSPACE_MAX_LIST_LIMIT = 200;
export const WORKSPACE_MAX_LIST_OFFSET = Number.MAX_SAFE_INTEGER;
export const WORKSPACE_MAX_TEXT_LIMIT = 50000;

export interface WorkspaceState {
	supported: boolean;
	name?: string;
	permission?: PermissionState;
	writeEnabled: boolean;
	writePermission?: PermissionState;
	error?: string;
}

export interface WorkspaceListOptions {
	path?: string;
	offset?: number;
	limit?: number;
}

export interface WorkspaceDirectoryEntry {
	name: string;
	path: string;
	kind: "file" | "directory";
}

export interface WorkspaceDirectoryListing {
	folder: string;
	path: string;
	entries: WorkspaceDirectoryEntry[];
	offset: number;
	nextOffset: number | null;
}

export interface WorkspaceReadOptions {
	path: string;
	offset?: number;
	limit?: number;
}

export interface WorkspaceFileMetadata {
	folder: string;
	path: string;
	size: number;
	mimeType: string;
	lastModified: number;
}

export interface WorkspaceTextFile extends WorkspaceFileMetadata {
	kind: "text";
	text: string;
	offset: number;
	totalCharacters: number;
	nextOffset: number | null;
}

export interface WorkspaceImageFile extends WorkspaceFileMetadata {
	kind: "image";
	data: string;
}

export type WorkspaceFile = WorkspaceTextFile | WorkspaceImageFile;

interface WorkspaceOptions {
	picker?: WorkspaceDirectoryPicker;
	extractDocumentText?: (file: File) => Promise<string>;
	onSelectionChange?: () => void;
}

const DOCUMENT_MIME_TYPES = new Set([
	"application/pdf",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"application/vnd.ms-excel",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

const IMAGE_MIME_TYPES = new Map([
	["png", "image/png"],
	["jpg", "image/jpeg"],
	["jpeg", "image/jpeg"],
	["gif", "image/gif"],
	["webp", "image/webp"],
]);

function errorName(error: unknown): string | undefined {
	return typeof error === "object" && error !== null && "name" in error && typeof error.name === "string"
		? error.name
		: undefined;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function assertNotAborted(signal?: AbortSignal): void {
	if (signal?.aborted) throw new Error("Working folder operation aborted.");
}

function checkInteger(value: number, name: string, minimum: number, maximum: number): number {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
		throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
	}
	return value;
}

export function parseWorkspacePath(path: string, allowRoot: boolean): string[] {
	if (
		typeof path !== "string" ||
		path.length > 2048 ||
		path.startsWith("/") ||
		/[\\:\u0000-\u001f\u007f]/.test(path)
	) {
		throw new Error("Use a relative path inside the working folder, not an absolute path or URL.");
	}
	if (allowRoot && (path === "" || path === "." || path === "./")) return [];
	const relativePath = path.startsWith("./") ? path.slice(2) : path;
	const parts = relativePath.split("/");
	if (parts.length > 64 || parts.some((part) => !part || part === "." || part === "..")) {
		throw new Error("Paths must stay inside the working folder; empty, '.' and '..' segments are not allowed.");
	}
	return parts;
}

function decodeText(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	const encoding =
		bytes[0] === 0xff && bytes[1] === 0xfe
			? "utf-16le"
			: bytes[0] === 0xfe && bytes[1] === 0xff
				? "utf-16be"
				: "utf-8";
	let text: string;
	try {
		text = new TextDecoder(encoding, { fatal: true }).decode(buffer);
	} catch {
		throw new Error(
			"This file is not supported text (UTF-8 or UTF-16). Attach it to the chat in a supported format.",
		);
	}
	if (/[\u0000-\u0008\u000e-\u001f]/.test(text)) {
		throw new Error("This file contains binary data, not text. Attach it to the chat in a supported format.");
	}
	return text;
}

function toBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary);
}

/** The selected handle stays in the extension. Tools receive only bounded, serializable results. */
export class ReadonlyWorkspace {
	private selection: WorkspaceSelection | null = null;
	private currentState: WorkspaceState;
	private stateVersion = 0;
	private listeners = new Set<() => void>();

	constructor(
		private repository: WorkspaceRepository,
		private options: WorkspaceOptions = {},
	) {
		this.currentState = { supported: Boolean(options.picker), writeEnabled: false };
	}

	get state(): WorkspaceState {
		return { ...this.currentState };
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private updateState(
		selection: WorkspaceSelection | null,
		permission?: PermissionState,
		error?: string,
		writePermission?: PermissionState,
	): void {
		this.stateVersion++;
		this.selection = selection;
		const next = {
			supported: Boolean(this.options.picker),
			name: selection?.handle.name,
			permission,
			writeEnabled: selection?.writeEnabled === true,
			writePermission,
			error,
		};
		if (
			next.name === this.currentState.name &&
			next.permission === this.currentState.permission &&
			next.writeEnabled === this.currentState.writeEnabled &&
			next.writePermission === this.currentState.writePermission &&
			next.error === this.currentState.error
		) {
			return;
		}
		this.currentState = next;
		for (const listener of this.listeners) listener();
	}

	/** Restore the handle, not file contents. This never prompts for permission. */
	async refresh(): Promise<void> {
		const version = ++this.stateVersion;
		let selection: WorkspaceSelection | null = null;
		try {
			selection = await this.repository.get();
			const permission = await selection?.handle.queryPermission({ mode: "read" });
			const writePermission =
				selection?.writeEnabled === true
					? await selection.handle.queryPermission({ mode: "readwrite" })
					: undefined;
			if (version === this.stateVersion) this.updateState(selection, permission, undefined, writePermission);
		} catch (error) {
			if (version === this.stateVersion) {
				this.updateState(selection, undefined, `Could not restore working folder access: ${errorMessage(error)}`);
			}
		}
	}

	/** Call directly from a click handler so the picker retains transient user activation. */
	async chooseFolder(): Promise<boolean> {
		if (!this.options.picker) {
			throw new Error("Working folders are not supported in this browser. Use chat attachments instead.");
		}
		let handle: WorkspaceDirectoryHandle;
		try {
			handle = await this.options.picker({ id: "sitegeist-working-folder", mode: "read" });
		} catch (error) {
			if (errorName(error) === "AbortError") return false;
			throw error;
		}
		const permission = await handle.queryPermission({ mode: "read" });
		const selection = { id: crypto.randomUUID(), handle };
		await this.repository.save(selection);
		this.updateState(selection, permission);
		this.options.onSelectionChange?.();
		return true;
	}

	/** Only this explicit UI action can request permission. Tools never call it. */
	async grantReadAccess(): Promise<boolean> {
		const selection = this.selection;
		if (!selection) throw new Error("Choose a working folder first.");
		const permission = await selection.handle.requestPermission({ mode: "read" });
		const current = await this.repository.get();
		if (current?.id !== selection.id) {
			await this.refresh();
			return false;
		}
		await this.refresh();
		this.options.onSelectionChange?.();
		return permission === "granted";
	}

	/** Application-level opt-in is separate from any write grant retained by Chrome. */
	async grantWriteAccess(): Promise<boolean> {
		const selection = this.selection;
		if (!selection) throw new Error("Choose a working folder first.");
		// Keep the permission request inside the user's click gesture.
		const permission = await selection.handle.requestPermission({ mode: "readwrite" });
		if (permission !== "granted") {
			await this.refresh();
			return false;
		}
		const changed = await this.repository.replace(selection.id, {
			...selection,
			id: crypto.randomUUID(),
			writeEnabled: true,
		});
		await this.refresh();
		if (changed) this.options.onSelectionChange?.();
		return changed;
	}

	async useReadOnly(): Promise<void> {
		const selection = await this.repository.get();
		if (selection) {
			const changed = await this.repository.replace(selection.id, {
				...selection,
				id: crypto.randomUUID(),
				writeEnabled: false,
			});
			if (changed) this.options.onSelectionChange?.();
		}
		await this.refresh();
	}

	/** Trusted writer access only. Never pass this handle to models, REPLs or pages. */
	async getWritableSelection(signal?: AbortSignal): Promise<WorkspaceSelection> {
		const selection = await this.getReadableSelection(signal);
		if (selection.writeEnabled !== true) {
			throw new Error("Working folder is read-only. Ask the user to enable Read and write in Settings > Folder.");
		}
		const permission = await selection.handle.queryPermission({ mode: "readwrite" });
		assertNotAborted(signal);
		if (permission !== "granted") {
			throw new Error(
				"Working folder write access is not granted. Ask the user to enable Read and write in Settings > Folder.",
			);
		}
		return selection;
	}

	async assertStillWritable(selection: WorkspaceSelection, signal?: AbortSignal): Promise<void> {
		const current = await this.getWritableSelection(signal);
		if (current.id !== selection.id) {
			throw new Error("Working folder or access mode changed during the write. Nothing was saved.");
		}
	}

	async disconnect(): Promise<void> {
		await this.repository.clear();
		this.updateState(null);
		this.options.onSelectionChange?.();
	}

	private async getReadableSelection(signal?: AbortSignal): Promise<WorkspaceSelection> {
		assertNotAborted(signal);
		const version = ++this.stateVersion;
		// Read the saved selection on every operation, including changes in another side panel.
		const selection = await this.repository.get();
		assertNotAborted(signal);
		if (!selection) {
			if (version === this.stateVersion) this.updateState(null);
			throw new Error(
				"No working folder selected. Ask the user to choose one via the folder icon or Settings > Folder.",
			);
		}
		let permission: PermissionState;
		try {
			permission = await selection.handle.queryPermission({ mode: "read" });
		} catch (error) {
			if (version === this.stateVersion) this.updateState(selection, undefined, errorMessage(error));
			throw this.fileAccessError(error, "");
		}
		const writePermission =
			selection.writeEnabled === true ? await selection.handle.queryPermission({ mode: "readwrite" }) : undefined;
		assertNotAborted(signal);
		if (version === this.stateVersion) this.updateState(selection, permission, undefined, writePermission);
		if (permission !== "granted") {
			throw new Error(
				"Working folder read access is not granted. Ask the user to click Grant read access in Settings > Folder.",
			);
		}
		return selection;
	}

	private async assertStillReadable(selection: WorkspaceSelection, signal?: AbortSignal): Promise<void> {
		assertNotAborted(signal);
		const current = await this.getReadableSelection(signal);
		if (current.id !== selection.id) {
			throw new Error(
				"The working folder changed during this operation. No file contents were returned; retry with the current folder.",
			);
		}
	}

	private async getDirectory(
		root: WorkspaceDirectoryHandle,
		parts: string[],
		signal?: AbortSignal,
	): Promise<WorkspaceDirectoryHandle> {
		let directory = root;
		for (const part of parts) {
			assertNotAborted(signal);
			// Omitting 'create' means missing entries cannot be created.
			directory = await directory.getDirectoryHandle(part);
		}
		assertNotAborted(signal);
		return directory;
	}

	private fileAccessError(error: unknown, path: string): Error {
		switch (errorName(error)) {
			case "NotFoundError":
				return new Error(
					`Working folder entry not found: ${JSON.stringify(path)}. List the folder again to see current files.`,
				);
			case "TypeMismatchError":
				return new Error(
					`Wrong entry type at ${JSON.stringify(path)}. Use list_workspace_files for a directory or read_workspace_file for a file.`,
				);
			case "NotAllowedError":
			case "SecurityError":
				return new Error(
					"Working folder access was blocked. Ask the user to grant read access or choose the folder again in Settings > Folder.",
				);
			default:
				return error instanceof Error ? error : new Error(String(error));
		}
	}

	async listFiles(options: WorkspaceListOptions = {}, signal?: AbortSignal): Promise<WorkspaceDirectoryListing> {
		const parts = parseWorkspacePath(options.path ?? "", true);
		const path = parts.join("/");
		const offset = checkInteger(options.offset ?? 0, "offset", 0, WORKSPACE_MAX_LIST_OFFSET);
		const limit = checkInteger(options.limit ?? 100, "limit", 1, WORKSPACE_MAX_LIST_LIMIT);
		const selection = await this.getReadableSelection(signal);
		try {
			const directory = await this.getDirectory(selection.handle, parts, signal);
			const entries: WorkspaceDirectoryEntry[] = [];
			let index = 0;
			let nextOffset: number | null = null;
			for await (const entry of directory.values()) {
				assertNotAborted(signal);
				if (index++ < offset) continue;
				if (entries.length === limit) {
					nextOffset = offset + entries.length;
					break;
				}
				entries.push({ name: entry.name, path: [...parts, entry.name].join("/"), kind: entry.kind });
			}
			await this.assertStillReadable(selection, signal);
			return { folder: selection.handle.name, path, entries, offset, nextOffset };
		} catch (error) {
			throw this.fileAccessError(error, path);
		}
	}

	async readFile(options: WorkspaceReadOptions, signal?: AbortSignal): Promise<WorkspaceFile> {
		const parts = parseWorkspacePath(options.path, false);
		const path = parts.join("/");
		const offset = checkInteger(options.offset ?? 0, "offset", 0, Number.MAX_SAFE_INTEGER);
		const limit = checkInteger(options.limit ?? 20000, "limit", 1, WORKSPACE_MAX_TEXT_LIMIT);
		const selection = await this.getReadableSelection(signal);
		try {
			const directory = await this.getDirectory(selection.handle, parts.slice(0, -1), signal);
			const fileHandle = await directory.getFileHandle(parts[parts.length - 1]);
			assertNotAborted(signal);
			const file = await fileHandle.getFile();
			assertNotAborted(signal);
			if (file.size > WORKSPACE_MAX_FILE_BYTES) {
				throw new Error("File is too large. Working folder reads are limited to 20 MB per file.");
			}
			// Stop before reading bytes if the folder was disconnected while opening the file.
			await this.assertStillReadable(selection, signal);
			const dot = file.name.lastIndexOf(".");
			const extension = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : "";
			const imageMimeType =
				IMAGE_MIME_TYPES.get(extension) ??
				([...IMAGE_MIME_TYPES.values()].includes(file.type) ? file.type : undefined);
			const metadata: WorkspaceFileMetadata = {
				folder: selection.handle.name,
				path,
				size: file.size,
				mimeType: file.type || "application/octet-stream",
				lastModified: file.lastModified,
			};
			if (imageMimeType) {
				if (offset !== 0) throw new Error("Character offsets apply only to text, not images.");
				const buffer = await file.arrayBuffer();
				assertNotAborted(signal);
				const data = toBase64(buffer);
				await this.assertStillReadable(selection, signal);
				return { ...metadata, kind: "image", mimeType: imageMimeType, data };
			}

			let text: string;
			if (["pdf", "docx", "xlsx", "xls", "pptx"].includes(extension) || DOCUMENT_MIME_TYPES.has(file.type)) {
				if (!this.options.extractDocumentText) throw new Error("Document text extraction is not available.");
				text = await this.options.extractDocumentText(file);
			} else {
				const buffer = await file.arrayBuffer();
				assertNotAborted(signal);
				text = decodeText(buffer);
			}
			assertNotAborted(signal);
			if (offset > text.length) throw new Error(`offset exceeds the file's ${text.length} text characters.`);
			const end = Math.min(offset + limit, text.length);
			const result: WorkspaceTextFile = {
				...metadata,
				kind: "text",
				text: text.slice(offset, end),
				offset,
				totalCharacters: text.length,
				nextOffset: end < text.length ? end : null,
			};
			await this.assertStillReadable(selection, signal);
			return result;
		} catch (error) {
			throw this.fileAccessError(error, path);
		}
	}
}
