import assert from "node:assert/strict";
import { test } from "node:test";
import { createWriteWorkspaceTool } from "../src/tools/workspace.ts";
import { ReadonlyWorkspace, WORKSPACE_MAX_FILE_BYTES } from "../src/workspace/readonly-workspace.ts";
import { WorkspaceWriter } from "../src/workspace/workspace-writer.ts";

function deferred() {
	let resolve;
	const promise = new Promise((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

function file(name, content = "", lastModified = 1000) {
	return {
		kind: "file",
		name,
		file: new File([content], name, { lastModified }),
		opens: 0,
		closes: 0,
		aborts: 0,
		async getFile() {
			return this.file;
		},
		async createWritable(options) {
			assert.deepEqual(options, { keepExistingData: true, mode: "exclusive" });
			assert.equal(this.active, undefined, "Only one writer may be open");
			this.opens++;
			this.active = true;
			const owner = this;
			let staged = new Uint8Array(await this.file.arrayBuffer());
			return {
				async write(data) {
					const bytes = new Uint8Array(await data.arrayBuffer());
					const next = new Uint8Array(Math.max(staged.length, bytes.length));
					next.set(staged);
					next.set(bytes);
					staged = next;
					await owner.onWrite?.();
				},
				async truncate(size) {
					staged = staged.slice(0, size);
					await owner.onTruncate?.();
				},
				async close() {
					await owner.onClose?.();
					owner.file = new File([staged], name, { lastModified: owner.file.lastModified + 1 });
					owner.closes++;
					owner.active = undefined;
				},
				async abort() {
					owner.aborts++;
					owner.active = undefined;
				},
			};
		},
	};
}

function folder(name, entries = []) {
	return {
		kind: "directory",
		name,
		entries: new Map(entries.map((entry) => [entry.name, entry])),
		readPermission: "granted",
		writePermission: "granted",
		requests: [],
		creates: 0,
		async queryPermission({ mode }) {
			return mode === "read" ? this.readPermission : this.writePermission;
		},
		requestPermission({ mode }) {
			this.requests.push(mode);
			if (mode === "readwrite") this.writePermission = this.denyWrite ? "denied" : "granted";
			return Promise.resolve(mode === "read" ? this.readPermission : this.writePermission);
		},
		async getDirectoryHandle(entryName, options) {
			assert.equal(options, undefined, "Do not create parent directories");
			const entry = this.entries.get(entryName);
			if (!entry) throw new DOMException("Missing directory", "NotFoundError");
			if (entry.kind !== "directory") throw new DOMException("Not a directory", "TypeMismatchError");
			return entry;
		},
		async getFileHandle(entryName, options) {
			let entry = this.entries.get(entryName);
			if (options) {
				assert.deepEqual(options, { create: true });
				this.creates++;
				if (!entry) {
					entry = file(entryName);
					this.entries.set(entryName, entry);
				}
			}
			if (!entry) throw new DOMException("Missing file", "NotFoundError");
			if (entry.kind !== "file") throw new DOMException("Not a file", "TypeMismatchError");
			return entry;
		},
		async *values() {
			yield* this.entries.values();
		},
		removeEntry() {
			assert.fail("Deletion must never be used, including rollback");
		},
	};
}

function setup(root, options = {}) {
	let selection = { id: "selected", handle: root, ...options.selection };
	const repo = {
		async get() {
			return selection;
		},
		async save(next) {
			selection = next;
		},
		async replace(expectedId, next) {
			if (selection?.id !== expectedId) return false;
			selection = next;
			return true;
		},
		async clear() {
			selection = null;
		},
	};
	const workspace = new ReadonlyWorkspace(repo, { picker: async () => root });
	const confirmations = [];
	const writer = new WorkspaceWriter(workspace, {
		confirmWrite: async (request, signal) => {
			confirmations.push(request);
			return options.confirm ? options.confirm(request, signal) : true;
		},
		runExclusive: options.runExclusive ?? ((task) => task()),
	});
	return { repo, workspace, writer, confirmations };
}

function writable(root, options = {}) {
	return setup(root, { ...options, selection: { writeEnabled: true } });
}

test("old selections remain read-only even if the browser remembers write permission", async () => {
	const root = folder("Inbox");
	const { writer, workspace, confirmations } = setup(root);
	await workspace.refresh();
	assert.equal(workspace.state.writeEnabled, false);
	await assert.rejects(writer.writeFile({ path: "new.txt", content: "text" }), /read-only/);
	assert.equal(root.creates, 0);
	assert.equal(confirmations.length, 0);
	assert.deepEqual(root.requests, []);
});

test("write opt-in requests readwrite permission in the click gesture and opting out blocks retained grants", async () => {
	const root = folder("Inbox");
	const { workspace, writer, repo } = setup(root);
	await workspace.refresh();
	const initialId = (await repo.get()).id;
	const granting = workspace.grantWriteAccess();
	assert.deepEqual(root.requests, ["readwrite"]);
	assert.equal(await granting, true);
	assert.equal(workspace.state.writeEnabled, true);
	assert.equal(workspace.state.writePermission, "granted");
	assert.notEqual((await repo.get()).id, initialId, "Mode changes invalidate old operations");
	await workspace.useReadOnly();
	assert.equal(root.writePermission, "granted");
	assert.equal((await repo.get()).writeEnabled, false);
	await assert.rejects(writer.writeFile({ path: "new.txt", content: "text" }), /read-only/);
	assert.equal(root.creates, 0);
	await workspace.chooseFolder();
	assert.equal(workspace.state.writeEnabled, false, "Picking a folder always resets to read-only");
});

test("denied write permission cannot enable the application policy", async () => {
	const root = folder("Inbox");
	root.denyWrite = true;
	const { workspace, repo } = setup(root);
	await workspace.refresh();
	assert.equal(await workspace.grantWriteAccess(), false);
	assert.equal((await repo.get()).writeEnabled, undefined);
	assert.equal(workspace.state.writeEnabled, false);
});

test("a delayed write grant cannot resurrect a disconnected or replaced folder", async () => {
	for (const change of ["disconnect", "replace"]) {
		const root = folder("Inbox");
		const permission = deferred();
		root.requestPermission = () => permission.promise;
		const { workspace, repo } = setup(root);
		await workspace.refresh();
		const granting = workspace.grantWriteAccess();
		if (change === "disconnect") await workspace.disconnect();
		else await repo.save({ id: "replacement", handle: folder("Other") });
		permission.resolve("granted");
		assert.equal(await granting, false);
		assert.equal((await repo.get())?.writeEnabled, undefined);
		assert.equal(workspace.state.name, change === "disconnect" ? undefined : "Other");
	}
});

test("revoked write permission never prompts from a tool and does not impair read access", async () => {
	const root = folder("Inbox", [file("notes.txt", "readable")]);
	root.writePermission = "prompt";
	const { writer, workspace, confirmations } = writable(root);
	await workspace.refresh();
	assert.equal(workspace.state.writePermission, "prompt");
	assert.equal((await workspace.readFile({ path: "notes.txt" })).text, "readable");
	await assert.rejects(writer.writeFile({ path: "notes.txt", content: "new" }), /write access is not granted/);
	assert.equal(confirmations.length, 0);
	assert.deepEqual(root.requests, []);
});

test("new UTF-8 files require concrete human confirmation and save only in existing subfolders", async () => {
	const sub = folder("documents");
	const root = folder("Inbox", [sub]);
	const { writer, confirmations } = writable(root);
	const result = await writer.writeFile({ path: "./documents/report.txt", content: "Grüße 世界" });
	assert.deepEqual(result, { folder: "Inbox", path: "documents/report.txt", size: 14, status: "saved" });
	assert.equal(await sub.entries.get("report.txt").file.text(), "Grüße 世界");
	assert.equal(confirmations.length, 1);
	assert.equal(confirmations[0].exists, false);
	assert.equal(confirmations[0].path, "documents/report.txt");
	assert.equal(confirmations[0].preview, "Grüße 世界");
	assert.equal(root.creates, 0);
	await assert.rejects(writer.writeFile({ path: "missing/new.txt", content: "x" }), /Missing directory/);
	assert.equal(root.entries.has("missing"), false);
});

test("replacement requires confirmation and removes trailing bytes only on commit", async () => {
	const entry = file("report.txt", "old content with a long tail");
	const root = folder("Inbox", [entry]);
	const { writer, confirmations } = writable(root);
	await writer.writeFile({ path: "report.txt", content: "new" });
	assert.equal(confirmations[0].exists, true);
	assert.equal(confirmations[0].existingSize, 28);
	assert.equal(confirmations[0].preview, "new");
	assert.equal(await entry.file.text(), "new");
	assert.equal(entry.opens, 1);
	assert.equal(entry.closes, 1);
	assert.equal(entry.aborts, 0);
	assert.equal(root.creates, 0);
});

test("cancelled confirmation performs no filesystem mutation for new or existing files", async () => {
	for (const exists of [false, true]) {
		const entry = file("report.txt", "original");
		const root = folder("Inbox", exists ? [entry] : []);
		const { writer } = writable(root, { confirm: () => false });
		await assert.rejects(writer.writeFile({ path: "report.txt", content: "new" }), /cancelled by the user/);
		assert.equal(root.creates, 0);
		assert.equal(entry.opens, 0);
		assert.equal(await entry.file.text(), "original");
		assert.equal(root.entries.has("report.txt"), exists);
	}
});

test("path and payload validation runs before asking for access or creating files", async () => {
	const root = folder("Inbox");
	const { writer, confirmations } = writable(root);
	for (const path of ["../secret", "/tmp/file", "C:/file", "docs/../file", "file:///tmp/file", "", "docs\\file"]) {
		await assert.rejects(writer.writeFile({ path, content: "data" }), /relative path|inside the working folder/);
	}
	for (const content of ["x".repeat(WORKSPACE_MAX_FILE_BYTES + 1), "é".repeat(11 * 1024 * 1024)]) {
		await assert.rejects(writer.writeFile({ path: "big.txt", content }), /20 MB/);
	}
	for (const content of ["bad*base64", "YQ=", "YR==", "data:text/plain,not-base64"]) {
		await assert.rejects(writer.writeFile({ path: "file.bin", content, encoding: "base64" }), /Invalid base64/);
	}
	await assert.rejects(writer.writeFile({ path: "file.txt", content: "text", encoding: "other" }), /Use utf8/);
	assert.equal(confirmations.length, 0);
	assert.equal(root.creates, 0);
});

test("binary files are decoded from base64 or data URLs, not saved as base64 text", async () => {
	for (const content of ["AP+AQQ==", "data:application/octet-stream;base64,AP+AQQ=="]) {
		const root = folder("Inbox");
		const { writer, confirmations } = writable(root);
		await writer.writeFile({ path: "output.bin", content, encoding: "base64" });
		assert.deepEqual(
			new Uint8Array(await root.entries.get("output.bin").file.arrayBuffer()),
			new Uint8Array([0, 255, 128, 65]),
		);
		assert.equal(confirmations[0].size, 4);
		assert.equal(confirmations[0].preview, undefined);
	}
});

test("permission and folder changes while confirming prevent any staged write", async () => {
	for (const change of ["disconnect", "readonly", "replace", "revoke"]) {
		const entry = file("report.txt", "original");
		const root = folder("Inbox", [entry]);
		let context;
		context = writable(root, {
			confirm: async () => {
				if (change === "disconnect") await context.workspace.disconnect();
				if (change === "readonly") await context.workspace.useReadOnly();
				if (change === "replace")
					await context.repo.save({ id: "other", handle: folder("Other"), writeEnabled: true });
				if (change === "revoke") root.writePermission = "denied";
				return true;
			},
		});
		await assert.rejects(
			context.writer.writeFile({ path: "report.txt", content: "new" }),
			/No working folder|read-only|changed|not granted/,
		);
		assert.equal(entry.opens, 0);
		assert.equal(await entry.file.text(), "original");
	}
});

test("files changed during confirmation require fresh consent, including same-size same-timestamp edits", async () => {
	const entry = file("report.txt", "old");
	const root = folder("Inbox", [entry]);
	const { writer } = writable(root, {
		confirm: () => {
			entry.file = new File(["ext"], entry.name, { lastModified: 1000 });
			return true;
		},
	});
	await assert.rejects(writer.writeFile({ path: "report.txt", content: "new" }), /changed during confirmation/);
	assert.equal(entry.opens, 0);
	assert.equal(await entry.file.text(), "ext");
});

test("a file appearing at a new destination during confirmation is not silently replaced", async () => {
	const root = folder("Inbox");
	const { writer } = writable(root, {
		confirm: () => {
			root.entries.set("new.txt", file("new.txt", "external"));
			return true;
		},
	});
	await assert.rejects(writer.writeFile({ path: "new.txt", content: "new" }), /changed during confirmation/);
	assert.equal(root.creates, 0);
	assert.equal(await root.entries.get("new.txt").file.text(), "external");
});

test("aborts, revoked grants and application opt-out during staging preserve original contents", async () => {
	for (const change of ["abort", "disconnect", "readonly", "revoke"]) {
		const staged = deferred();
		const finish = deferred();
		const entry = file("report.txt", "original");
		entry.onWrite = async () => {
			staged.resolve();
			await finish.promise;
		};
		const root = folder("Inbox", [entry]);
		const { writer, workspace } = writable(root);
		const controller = new AbortController();
		const saving = writer.writeFile({ path: "report.txt", content: "new" }, controller.signal);
		await staged.promise;
		assert.equal(await entry.file.text(), "original", "Staging must not touch the original file");
		if (change === "abort") controller.abort();
		if (change === "disconnect") await workspace.disconnect();
		if (change === "readonly") await workspace.useReadOnly();
		if (change === "revoke") root.writePermission = "denied";
		finish.resolve();
		await assert.rejects(saving, /aborted|No working folder|read-only|not granted/);
		assert.equal(entry.closes, 0);
		assert.equal(entry.aborts, 1);
		assert.equal(await entry.file.text(), "original");
	}
});

test("external changes during staging are retained and the proposed replacement is aborted", async () => {
	const entry = file("report.txt", "old");
	entry.onWrite = () => {
		entry.file = new File(["ext"], entry.name, { lastModified: 1000 });
	};
	const { writer } = writable(folder("Inbox", [entry]));
	await assert.rejects(writer.writeFile({ path: "report.txt", content: "new" }), /changed while saving/);
	assert.equal(entry.aborts, 1);
	assert.equal(entry.closes, 0);
	assert.equal(await entry.file.text(), "ext");
});

test("failed stream writes or commits preserve existing data; new empty files are not deleted", async () => {
	for (const hook of ["onWrite", "onTruncate", "onClose"]) {
		const entry = file("report.txt", "original");
		entry[hook] = () => {
			throw new Error("Disk failure");
		};
		const { writer } = writable(folder("Inbox", [entry]));
		await assert.rejects(writer.writeFile({ path: "report.txt", content: "new" }), /Disk failure/);
		assert.equal(entry.aborts, 1);
		assert.equal(await entry.file.text(), "original");
	}
	const root = folder("Inbox");
	const originalGet = root.getFileHandle.bind(root);
	root.getFileHandle = async (...args) => {
		const entry = await originalGet(...args);
		entry.onWrite = () => {
			throw new Error("Disk failure");
		};
		return entry;
	};
	const { writer } = writable(root);
	await assert.rejects(writer.writeFile({ path: "new.txt", content: "new" }), /empty new file may remain/);
	assert.equal(await root.entries.get("new.txt").file.text(), "");
});

test("oversized existing files cannot be replaced without a bounded version check", async () => {
	const entry = file("large.txt", "unused");
	Object.defineProperty(entry.file, "size", { value: WORKSPACE_MAX_FILE_BYTES + 1 });
	entry.file.arrayBuffer = () => assert.fail("Oversized files must not be loaded");
	const { writer, confirmations } = writable(folder("Inbox", [entry]));
	await assert.rejects(writer.writeFile({ path: "large.txt", content: "small" }), /larger than 20 MB/);
	assert.equal(confirmations.length, 0);
	assert.equal(entry.opens, 0);
});

test("each approval is bound to the captured path and payload, not mutable call arguments", async () => {
	const release = deferred();
	const root = folder("Inbox");
	const { writer, confirmations } = writable(root, {
		runExclusive: async (task) => {
			await release.promise;
			return task();
		},
	});
	const args = { path: "approved.txt", content: "approved content" };
	const saving = writer.writeFile(args);
	args.path = "different.txt";
	args.content = "different content";
	release.resolve();
	await saving;
	assert.equal(confirmations[0].path, "approved.txt");
	assert.equal(confirmations[0].preview, "approved content");
	assert.equal(await root.entries.get("approved.txt").file.text(), "approved content");
	assert.equal(root.entries.has("different.txt"), false);
});

test("serialized writes to the same path each receive separate confirmation", async () => {
	let tail = Promise.resolve();
	const runExclusive = (task) => {
		const result = tail.then(task);
		tail = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	};
	const root = folder("Inbox");
	const { writer, confirmations } = writable(root, { runExclusive });
	await Promise.all([
		writer.writeFile({ path: "report.txt", content: "first" }),
		writer.writeFile({ path: "report.txt", content: "second" }),
	]);
	assert.deepEqual(
		confirmations.map((request) => request.exists),
		[false, true],
	);
	assert.equal(await root.entries.get("report.txt").file.text(), "second");
});

test("write tools export artifact snapshots without exposing handles or binary content to the model", async () => {
	const root = folder("Inbox");
	const { writer, confirmations } = writable(root);
	const artifacts = new Map([
		["report.bin", "AP+AQQ=="],
		["empty.txt", ""],
	]);
	const tool = createWriteWorkspaceTool(writer, (name) => artifacts.get(name));
	const result = await tool.execute("save", { path: "saved.bin", artifact: "report.bin", encoding: "base64" });
	assert.equal(result.details.status, "saved");
	assert.equal(confirmations[0].artifact, "report.bin");
	assert.doesNotMatch(JSON.stringify(result), /AP\+AQQ|handle|preview/);
	assert.doesNotMatch(JSON.stringify(result.details), /content/);
	assert.equal(result.details.size, 4);
	await tool.execute("empty", { path: "empty.txt", artifact: "empty.txt", encoding: "utf8" });
	assert.equal(root.entries.get("empty.txt").file.size, 0);
	for (const args of [
		{ path: "bad.txt" },
		{ path: "bad.txt", content: "x", artifact: "empty.txt" },
		{ path: "bad.txt", artifact: "missing.txt", encoding: "utf8" },
		{ path: "bad.txt", artifact: "report.bin" },
	]) {
		await assert.rejects(tool.execute("bad", args), /exactly one|does not exist|Specify utf8/);
	}
	assert.equal(root.entries.has("bad.txt"), false);
});
