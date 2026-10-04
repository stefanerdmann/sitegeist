import assert from "node:assert/strict";
import { test } from "node:test";
import { createListWorkspaceTool, createReadWorkspaceTool } from "../src/tools/workspace.ts";
import { getWorkspaceDirectoryPicker } from "../src/workspace/file-system.ts";
import {
	parseWorkspacePath,
	ReadonlyWorkspace,
	WORKSPACE_MAX_FILE_BYTES,
} from "../src/workspace/readonly-workspace.ts";

function repository(initial = null) {
	let selection = initial;
	return {
		reads: 0,
		saves: [],
		clears: 0,
		async get() {
			this.reads++;
			return selection;
		},
		async save(value) {
			this.saves.push(value);
			selection = value;
		},
		async replace(expectedId, value) {
			if (selection?.id !== expectedId) return false;
			this.saves.push(value);
			selection = value;
			return true;
		},
		async clear() {
			this.clears++;
			selection = null;
		},
	};
}

function fileHandle(name, content, type = "") {
	return {
		kind: "file",
		name,
		file: new File([content], name, { type, lastModified: 12345 }),
		reads: 0,
		async getFile() {
			this.reads++;
			return this.file;
		},
		createWritable() {
			assert.fail("Workspace must never write files");
		},
	};
}

function directory(name, children = []) {
	return {
		kind: "directory",
		name,
		children: new Map(children.map((entry) => [entry.name, entry])),
		permission: "granted",
		permissionRequests: [],
		permissionQueries: [],
		traversals: [],
		listCalls: 0,
		async queryPermission(options) {
			this.permissionQueries.push(options);
			return this.permission;
		},
		async requestPermission(options) {
			this.permissionRequests.push(options);
			this.permission = "granted";
			return this.permission;
		},
		async getDirectoryHandle(entryName, options) {
			assert.equal(options, undefined, "Directory access must not enable creation");
			this.traversals.push(entryName);
			const entry = this.children.get(entryName);
			if (!entry) throw new DOMException("Missing directory", "NotFoundError");
			if (entry.kind !== "directory") throw new DOMException("Not a directory", "TypeMismatchError");
			return entry;
		},
		async getFileHandle(entryName, options) {
			assert.equal(options, undefined, "File access must not enable creation");
			const entry = this.children.get(entryName);
			if (!entry) throw new DOMException("Missing file", "NotFoundError");
			if (entry.kind !== "file") throw new DOMException("Not a file", "TypeMismatchError");
			return entry;
		},
		async *values() {
			this.listCalls++;
			yield* this.children.values();
		},
		removeEntry() {
			assert.fail("Workspace must never delete entries");
		},
	};
}

function selectedWorkspace(root, options = {}) {
	const repo = repository({ id: "selected", handle: root });
	return { repo, workspace: new ReadonlyWorkspace(repo, options) };
}

function deferred() {
	let resolve;
	const promise = new Promise((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

test("folder selection preserves a real handle and requests only read access without reading files", async () => {
	const entry = fileHandle("private.txt", "not automatically uploaded");
	const root = directory("Inbox", [entry]);
	const repo = repository();
	let pickerOptions;
	let notifications = 0;
	let selectionChanges = 0;
	const workspace = new ReadonlyWorkspace(repo, {
		picker: (options) => {
			assert.equal(repo.reads, 0, "Picker must run before asynchronous storage operations");
			pickerOptions = options;
			return Promise.resolve(root);
		},
		onSelectionChange: () => selectionChanges++,
	});
	const unsubscribe = workspace.subscribe(() => notifications++);
	const choosing = workspace.chooseFolder();
	assert.deepEqual(pickerOptions, { id: "sitegeist-working-folder", mode: "read" });
	assert.equal(await choosing, true);
	assert.equal(repo.saves[0].handle, root, "Do not JSON serialize the handle");
	assert.deepEqual(workspace.state, {
		supported: true,
		name: "Inbox",
		permission: "granted",
		writeEnabled: false,
		writePermission: undefined,
		error: undefined,
	});
	assert.equal(selectionChanges, 1);
	assert.equal(notifications, 1);
	assert.equal(root.listCalls, 0);
	assert.equal(entry.reads, 0);
	assert.deepEqual(root.permissionQueries, [{ mode: "read" }]);
	assert.deepEqual(root.permissionRequests, []);

	const restored = new ReadonlyWorkspace(repo);
	await restored.refresh();
	assert.equal(restored.state.name, "Inbox");
	assert.equal(restored.state.permission, "granted");
	assert.equal(root.listCalls, 0);
	assert.equal(entry.reads, 0);
	unsubscribe();
	await workspace.disconnect();
	assert.equal(notifications, 1);
	assert.equal(selectionChanges, 2);
});

test("cancelled folder picking keeps the previous selection and unsupported browsers fall back to attachments", async () => {
	const root = directory("Inbox");
	const { repo, workspace } = selectedWorkspace(root, {
		picker: async () => {
			throw new DOMException("Cancelled", "AbortError");
		},
	});
	await workspace.refresh();
	assert.equal(await workspace.chooseFolder(), false);
	assert.equal(workspace.state.name, "Inbox");
	assert.equal((await repo.get()).handle, root);
	assert.equal(repo.saves.length, 0);
	await assert.rejects(new ReadonlyWorkspace(repository()).chooseFolder(), /Use chat attachments/);
	const blocked = new ReadonlyWorkspace(repo, {
		picker: async () => {
			throw new DOMException("Blocked picker", "SecurityError");
		},
	});
	await assert.rejects(blocked.chooseFolder(), /Blocked picker/);
	assert.equal((await repo.get()).handle, root);
	assert.equal(getWorkspaceDirectoryPicker(), undefined, "Node has no browser directory picker");
});

test("permission restoration never prompts; explicit reauthorization runs before any await", async () => {
	const root = directory("Inbox", [fileHandle("notes.txt", "notes")]);
	root.permission = "prompt";
	const { repo, workspace } = selectedWorkspace(root);
	await workspace.refresh();
	assert.equal(workspace.state.permission, "prompt");
	await assert.rejects(workspace.listFiles(), /Grant read access/);
	await assert.rejects(workspace.readFile({ path: "notes.txt" }), /Grant read access/);
	assert.deepEqual(root.permissionRequests, []);
	assert.equal(root.listCalls, 0);
	const readsBeforeGrant = repo.reads;
	const granting = workspace.grantReadAccess();
	assert.deepEqual(root.permissionRequests, [{ mode: "read" }]);
	assert.equal(repo.reads, readsBeforeGrant, "Permission prompt must run before asynchronous storage checks");
	assert.equal(await granting, true);
	assert.equal(workspace.state.permission, "granted");
	assert.equal((await workspace.readFile({ path: "notes.txt" })).text, "notes");

	root.permission = "denied";
	await assert.rejects(workspace.listFiles(), /Grant read access/);
	assert.equal(workspace.state.permission, "denied");
	assert.equal(root.permissionRequests.length, 1);
});

test("directory listing is paginated, non-recursive and does not read file contents", async () => {
	const first = fileHandle("a.txt", "a");
	const second = fileHandle("b.csv", "name,value\na,1");
	const childFile = fileHandle("notes.md", "# Notes");
	const child = directory("docs", [childFile]);
	const root = directory("Inbox", [first, second, child]);
	const { workspace } = selectedWorkspace(root);
	const page1 = await workspace.listFiles({ path: ".", limit: 2 });
	assert.deepEqual(page1, {
		folder: "Inbox",
		path: "",
		entries: [
			{ name: "a.txt", path: "a.txt", kind: "file" },
			{ name: "b.csv", path: "b.csv", kind: "file" },
		],
		offset: 0,
		nextOffset: 2,
	});
	const page2 = await workspace.listFiles({ offset: page1.nextOffset, limit: 2 });
	assert.deepEqual(page2.entries, [{ name: "docs", path: "docs", kind: "directory" }]);
	assert.equal(page2.nextOffset, null);
	assert.equal(child.listCalls, 0);
	assert.equal(first.reads + second.reads + childFile.reads, 0);
	assert.deepEqual((await workspace.listFiles({ path: "./docs" })).entries, [
		{ name: "notes.md", path: "docs/notes.md", kind: "file" },
	]);
	assert.deepEqual(root.traversals, ["docs"]);
	assert.equal(childFile.reads, 0);
	assert.equal((await workspace.listFiles({ offset: 10 })).entries.length, 0);
	assert.doesNotMatch(JSON.stringify(page1), /handle|permissionQueries|not automatically uploaded/);
});

test("text/code/CSV reads use live files, return bounded characters and handle empty text", async () => {
	const entry = fileHandle("data.csv", "name,value\na,1");
	const root = directory("Inbox", [directory("data", [entry]), fileHandle("README", "")]);
	const { workspace } = selectedWorkspace(root);
	const page = await workspace.readFile({ path: "./data/data.csv", limit: 5 });
	assert.equal(page.kind, "text");
	assert.equal(page.path, "data/data.csv");
	assert.equal(page.text, "name,");
	assert.equal(page.totalCharacters, 14);
	assert.equal(page.nextOffset, 5);
	assert.equal(page.lastModified, 12345);
	assert.equal((await workspace.readFile({ path: "data/data.csv", offset: 5 })).text, "value\na,1");
	entry.file = new File(["changed on disk"], "data.csv");
	assert.equal((await workspace.readFile({ path: "data/data.csv" })).text, "changed on disk");
	assert.equal((await workspace.readFile({ path: "README" })).text, "");
	assert.equal((await workspace.readFile({ path: "README" })).nextOffset, null);
	root.children.set("new.py", fileHandle("new.py", "print('new file')"));
	assert.equal((await workspace.readFile({ path: "new.py" })).text, "print('new file')");
	await assert.rejects(workspace.readFile({ path: "README", offset: 1 }), /offset exceeds/);
});

test("UTF-8 and BOM-marked UTF-16 are decoded without exposing arbitrary binary data", async () => {
	const root = directory("Inbox", [
		fileHandle("unicode.txt", "Grüße 世界"),
		fileHandle("source.constructor", "ordinary text"),
		fileHandle("png", "not an image extension"),
		fileHandle("windows.txt", new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0xe4, 0x00])),
		fileHandle("big-endian.txt", new Uint8Array([0xfe, 0xff, 0x00, 0x41, 0x00, 0xe4])),
		fileHandle("archive.zip", new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00])),
		fileHandle("invalid.bin", new Uint8Array([0xff, 0x80])),
	]);
	const { workspace } = selectedWorkspace(root);
	assert.equal((await workspace.readFile({ path: "unicode.txt" })).text, "Grüße 世界");
	assert.equal((await workspace.readFile({ path: "source.constructor" })).text, "ordinary text");
	assert.equal((await workspace.readFile({ path: "png" })).text, "not an image extension");
	assert.equal((await workspace.readFile({ path: "windows.txt" })).text, "Aä");
	assert.equal((await workspace.readFile({ path: "big-endian.txt" })).text, "Aä");
	await assert.rejects(workspace.readFile({ path: "archive.zip" }), /binary data/);
	await assert.rejects(workspace.readFile({ path: "invalid.bin" }), /not supported text/);
});

test("path validation rejects traversal, absolute paths and URLs before accessing a handle", async () => {
	const { repo, workspace } = selectedWorkspace(directory("Inbox"));
	for (const path of [
		"../secret.txt",
		"docs/../../secret.txt",
		"docs/../secret.txt",
		"docs//secret.txt",
		"docs/./secret.txt",
		"/etc/passwd",
		"C:/Users/private.txt",
		"C:\\Users\\private.txt",
		"\\\\server\\share\\private.txt",
		"https://example.com/file.txt",
		"file:///tmp/private.txt",
		"docs\\secret.txt",
		"docs/secret\u0000.txt",
		"docs/secret\n.txt",
		"a".repeat(2049),
		Array(66).fill("dir").join("/"),
	]) {
		await assert.rejects(workspace.readFile({ path }), /relative path|inside the working folder/);
		await assert.rejects(workspace.listFiles({ path }), /relative path|inside the working folder/);
	}
	assert.equal(repo.reads, 0);
	assert.deepEqual(parseWorkspacePath("./docs/my file.txt", false), ["docs", "my file.txt"]);
	assert.deepEqual(parseWorkspacePath("%2e%2e/file.txt", false), ["%2e%2e", "file.txt"], "Never URL-decode paths");
	await assert.rejects(workspace.readFile({ path: "" }), /empty/);
	await assert.rejects(workspace.readFile({ path: "." }), /segments/);
});

test("pagination arguments are validated even outside agent schema validation", async () => {
	const { repo, workspace } = selectedWorkspace(directory("Inbox"));
	for (const limit of [0, -1, 201, 1.5, Number.NaN, "2"]) {
		await assert.rejects(workspace.listFiles({ limit }), /limit must be an integer/);
	}
	for (const offset of [-1, Number.MAX_SAFE_INTEGER + 1, 0.5, Number.POSITIVE_INFINITY]) {
		await assert.rejects(workspace.listFiles({ offset }), /offset must be an integer/);
	}
	for (const limit of [0, 50001, 1.5]) {
		await assert.rejects(workspace.readFile({ path: "data.txt", limit }), /limit must be an integer/);
	}
	assert.equal(repo.reads, 0);
});

test("default and maximum page sizes bound listings and text without scanning an entire directory", async () => {
	const root = directory("Inbox", [fileHandle("large.txt", "x".repeat(60000))]);
	let yielded = 0;
	root.values = async function* () {
		for (let i = 0; i < 1000; i++) {
			yielded++;
			yield { kind: "file", name: `file-${i}.txt` };
		}
	};
	const { workspace } = selectedWorkspace(root);
	assert.equal((await workspace.listFiles()).entries.length, 100);
	assert.equal(yielded, 101, "Only one extra entry is needed to determine nextOffset");
	yielded = 0;
	assert.equal((await workspace.listFiles({ limit: 200 })).entries.length, 200);
	assert.equal(yielded, 201);
	const defaultPage = await workspace.readFile({ path: "large.txt" });
	assert.equal(defaultPage.text.length, 20000);
	assert.equal(defaultPage.nextOffset, 20000);
	const maxPage = await workspace.readFile({ path: "large.txt", limit: 50000 });
	assert.equal(maxPage.text.length, 50000);
	assert.equal(maxPage.nextOffset, 50000);
});

test("file-size limits run before decoding or document extraction", async () => {
	const entry = fileHandle("huge.pdf", "unused", "application/pdf");
	Object.defineProperty(entry.file, "size", { value: WORKSPACE_MAX_FILE_BYTES + 1 });
	entry.file.arrayBuffer = async () => assert.fail("Oversized files must not be read");
	const { workspace } = selectedWorkspace(directory("Inbox", [entry]), {
		extractDocumentText: async () => assert.fail("Oversized documents must not be parsed"),
	});
	await assert.rejects(workspace.readFile({ path: "huge.pdf" }), /20 MB/);
});

test("supported documents use local extraction and text pagination", async () => {
	const entries = ["pdf", "docx", "xlsx", "xls", "pptx"].map((extension) =>
		fileHandle(`report.${extension}`, new Uint8Array([0xff, 0x00])),
	);
	const seen = [];
	const { workspace } = selectedWorkspace(directory("Inbox", entries), {
		extractDocumentText: async (file) => {
			seen.push(file.name);
			return "locally extracted document text";
		},
	});
	for (const entry of entries) {
		const result = await workspace.readFile({ path: entry.name, offset: 8, limit: 9 });
		assert.equal(result.text, "extracted");
		assert.equal(result.nextOffset, 17);
	}
	assert.deepEqual(
		seen,
		entries.map((entry) => entry.name),
	);
});

test("read tools return image content, not base64 in model text or persistent metadata", async () => {
	const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
	const root = directory("Inbox", [fileHandle("screen.png", bytes)]);
	const { workspace } = selectedWorkspace(root);
	const tool = createReadWorkspaceTool(workspace);
	const result = await tool.execute("read-image", { path: "screen.png" });
	assert.equal(result.content[0].type, "text");
	assert.deepEqual(result.content[1], { type: "image", data: "iVBORw==", mimeType: "image/png" });
	assert.equal(result.details.path, "screen.png");
	assert.equal(result.details.kind, "image");
	assert.doesNotMatch(JSON.stringify(result.details), /data|handle/);
	assert.doesNotMatch(result.content[0].text, /iVBORw/);
	await assert.rejects(workspace.readFile({ path: "screen.png", offset: 1 }), /only to text/);
});

test("text/list tools return only selected content and serializable metadata, never the saved handle", async () => {
	const read = fileHandle("notes.md", "# Notes\nhello");
	const unrelated = fileHandle("secrets.txt", "not requested");
	const { workspace } = selectedWorkspace(directory("Inbox", [read, unrelated]));
	const listTool = createListWorkspaceTool(workspace);
	const readTool = createReadWorkspaceTool(workspace);
	assert.equal(listTool.name, "list_workspace_files");
	assert.equal(readTool.name, "read_workspace_file");
	const listing = await listTool.execute("list", {});
	assert.equal(JSON.parse(listing.content[0].text).entries.length, 2);
	assert.equal(read.reads, 0);
	assert.equal(unrelated.reads, 0);
	const result = await readTool.execute("read", { path: "notes.md", limit: 7 });
	assert.equal(JSON.parse(result.content[0].text).text, "# Notes");
	assert.equal(result.details.nextOffset, 7);
	assert.equal(result.details.text, undefined);
	assert.doesNotMatch(JSON.stringify(result), /permissionQueries|not requested|"handle"/);
	assert.equal(unrelated.reads, 0);
});

test("disconnecting stops reads in other side panels too, without touching local files", async () => {
	const entry = fileHandle("notes.txt", "still on disk");
	const root = directory("Inbox", [entry]);
	const { repo, workspace } = selectedWorkspace(root);
	const otherPanel = new ReadonlyWorkspace(repo);
	await otherPanel.refresh();
	assert.equal(otherPanel.state.name, "Inbox");
	await workspace.disconnect();
	await assert.rejects(otherPanel.readFile({ path: "notes.txt" }), /No working folder selected/);
	assert.equal(otherPanel.state.name, undefined);
	assert.equal(entry.reads, 0);
	assert.equal(root.children.get("notes.txt"), entry);
	assert.equal(repo.clears, 1);
});

test("in-flight file contents are withheld if the folder is disconnected, switched or revoked", async () => {
	for (const change of ["disconnect", "switch", "revoke"]) {
		const opened = deferred();
		const finish = deferred();
		const entry = fileHandle("notes.txt", "private content");
		entry.file.arrayBuffer = async () => assert.fail("Disconnected or revoked files must not be decoded");
		entry.getFile = async () => {
			opened.resolve();
			await finish.promise;
			return entry.file;
		};
		const root = directory("Inbox", [entry]);
		const { repo, workspace } = selectedWorkspace(root);
		const reading = workspace.readFile({ path: "notes.txt" });
		await opened.promise;
		if (change === "disconnect") await workspace.disconnect();
		if (change === "switch") await repo.save({ id: "new-selection", handle: directory("Other") });
		if (change === "revoke") root.permission = "denied";
		finish.resolve();
		await assert.rejects(reading, /No working folder|folder changed|not granted/);
	}
});

test("contents extracted during a folder change are withheld by the final permission check", async () => {
	for (const change of ["disconnect", "switch", "revoke"]) {
		const extracting = deferred();
		const finish = deferred();
		const root = directory("Inbox", [fileHandle("report.pdf", "PDF data")]);
		const { repo, workspace } = selectedWorkspace(root, {
			extractDocumentText: async () => {
				extracting.resolve();
				await finish.promise;
				return "private extracted document content";
			},
		});
		const reading = workspace.readFile({ path: "report.pdf" });
		await extracting.promise;
		if (change === "disconnect") await workspace.disconnect();
		if (change === "switch") await repo.save({ id: "replacement", handle: directory("Other") });
		if (change === "revoke") root.permission = "denied";
		finish.resolve();
		await assert.rejects(reading, /No working folder|folder changed|not granted/);
	}
});

test("aborted folder operations return no contents and do not request permission", async () => {
	const root = directory("Inbox", [fileHandle("notes.txt", "private content")]);
	const { workspace } = selectedWorkspace(root);
	const controller = new AbortController();
	controller.abort();
	await assert.rejects(workspace.listFiles({}, controller.signal), /aborted/);
	await assert.rejects(workspace.readFile({ path: "notes.txt" }, controller.signal), /aborted/);
	assert.equal(root.listCalls, 0);
	assert.deepEqual(root.permissionQueries, []);
	assert.deepEqual(root.permissionRequests, []);

	const opened = deferred();
	const finish = deferred();
	const active = new AbortController();
	const entry = root.children.get("notes.txt");
	entry.getFile = async () => {
		opened.resolve();
		await finish.promise;
		return entry.file;
	};
	const reading = workspace.readFile({ path: "notes.txt" }, active.signal);
	await opened.promise;
	active.abort();
	finish.resolve();
	await assert.rejects(reading, /aborted/);
});

test("a delayed permission refresh cannot restore disconnected or replaced folder state", async () => {
	for (const change of ["disconnect", "replace"]) {
		const queried = deferred();
		const finish = deferred();
		const old = directory("Old folder");
		old.queryPermission = async () => {
			queried.resolve();
			return finish.promise;
		};
		const replacement = directory("New folder");
		const { workspace } = selectedWorkspace(old, { picker: async () => replacement });
		const refreshing = workspace.refresh();
		await queried.promise;
		if (change === "disconnect") await workspace.disconnect();
		else await workspace.chooseFolder();
		finish.resolve("granted");
		await refreshing;
		assert.equal(workspace.state.name, change === "disconnect" ? undefined : "New folder");
	}
});

test("missing files, wrong entry types and inaccessible stored handles have actionable errors", async () => {
	const root = directory("Inbox", [directory("docs"), fileHandle("notes.txt", "text")]);
	const { workspace } = selectedWorkspace(root);
	await assert.rejects(workspace.readFile({ path: "missing.txt" }), /not found/);
	await assert.rejects(workspace.readFile({ path: "docs" }), /Wrong entry type/);
	await assert.rejects(workspace.listFiles({ path: "notes.txt" }), /Wrong entry type/);
	root.queryPermission = async () => {
		throw new DOMException("Handle unavailable", "SecurityError");
	};
	await assert.rejects(workspace.readFile({ path: "notes.txt" }), /access was blocked/);
	await workspace.refresh();
	assert.match(workspace.state.error, /Could not restore/);
	assert.equal(workspace.state.name, "Inbox");
	await workspace.disconnect();
	assert.equal(workspace.state.error, undefined);
});
