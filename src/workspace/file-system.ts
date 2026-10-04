// TypeScript's DOM library does not include Chrome's picker and permission methods.
// Expose only scoped reads and writes; no deletion, renaming or directory creation.
export type WorkspacePermissionMode = "read" | "readwrite";
export type WorkspaceWritableStream = Pick<FileSystemWritableFileStream, "write" | "truncate" | "close" | "abort">;

export interface WorkspaceFileHandle extends Pick<FileSystemFileHandle, "kind" | "name" | "getFile"> {
	createWritable(options: { keepExistingData: true; mode: "exclusive" }): Promise<WorkspaceWritableStream>;
}

export interface WorkspaceDirectoryHandle extends Pick<FileSystemDirectoryHandle, "kind" | "name"> {
	queryPermission(options: { mode: WorkspacePermissionMode }): Promise<PermissionState>;
	requestPermission(options: { mode: WorkspacePermissionMode }): Promise<PermissionState>;
	getDirectoryHandle(name: string): Promise<WorkspaceDirectoryHandle>;
	getFileHandle(name: string, options?: { create: true }): Promise<WorkspaceFileHandle>;
	values(): AsyncIterableIterator<WorkspaceDirectoryHandle | WorkspaceFileHandle>;
}

export type WorkspaceDirectoryPicker = (options: { id: string; mode: "read" }) => Promise<WorkspaceDirectoryHandle>;

export interface WorkspaceSelection {
	id: string;
	handle: WorkspaceDirectoryHandle;
	// Missing in old records: default to read-only even if Chrome remembers write permission.
	writeEnabled?: boolean;
}

export interface WorkspaceRepository {
	get(): Promise<WorkspaceSelection | null>;
	save(selection: WorkspaceSelection): Promise<void>;
	replace(expectedId: string, selection: WorkspaceSelection): Promise<boolean>;
	clear(): Promise<void>;
}

export function getWorkspaceDirectoryPicker(): WorkspaceDirectoryPicker | undefined {
	if (typeof window === "undefined") return undefined;
	const pickerWindow = window as Window & { showDirectoryPicker?: WorkspaceDirectoryPicker };
	return typeof pickerWindow.showDirectoryPicker === "function"
		? pickerWindow.showDirectoryPicker.bind(window)
		: undefined;
}
