import assert from "node:assert/strict";
import { loadAttachment } from "@mariozechner/pi-web-ui";
import * as XLSX from "xlsx";
import { WorkspaceTab } from "../../src/dialogs/WorkspaceTab.ts";
import { WorkspaceWriteDialog } from "../../src/dialogs/WorkspaceWriteDialog.ts";
import { SitegeistAppStorage } from "../../src/storage/app-storage.ts";
import { WorkspaceStore } from "../../src/storage/stores/workspace-store.ts";
import { getWorkspaceDirectoryPicker } from "../../src/workspace/file-system.ts";
import { ReadonlyWorkspace } from "../../src/workspace/readonly-workspace.ts";

localStorage.setItem("language", "en");
let selection = null;
const store = new WorkspaceStore();
const writes = [];
store.setBackend({
	get: async (storeName, key) => {
		assert.equal(storeName, "workspace");
		assert.equal(key, "selected");
		return selection;
	},
	set: async (storeName, key, value) => {
		assert.equal(storeName, "workspace");
		assert.equal(key, "selected");
		writes.push(value);
		selection = value;
	},
	transaction: async (stores, mode, operation) => {
		assert.deepEqual(stores, ["workspace"]);
		assert.equal(mode, "readwrite");
		return operation({
			get: async () => selection,
			set: async (_storeName, _key, value) => {
				selection = value;
				writes.push(value);
			},
		});
	},
	delete: async (storeName, key) => {
		assert.equal(storeName, "workspace");
		assert.equal(key, "selected");
		selection = null;
	},
});
assert.deepEqual(store.getConfig(), { name: "workspace" });
assert.ok(new SitegeistAppStorage().workspace instanceof WorkspaceStore);

let permission = "granted";
let writePermission = "prompt";
let writeRequests = 0;
let requests = 0;
let pickerCalls = 0;
let fileReads = 0;
let cancel = false;
const root = {
	kind: "directory",
	name: "Test inbox",
	queryPermission: async (options) => {
		assert.ok(options.mode === "read" || options.mode === "readwrite");
		return options.mode === "readwrite" ? writePermission : permission;
	},
	requestPermission: (options) => {
		if (options.mode === "readwrite") {
			writeRequests++;
			writePermission = "granted";
		} else {
			requests++;
			assert.deepEqual(options, { mode: "read" });
			permission = "granted";
		}
		return Promise.resolve(options.mode === "readwrite" ? writePermission : permission);
	},
	getFileHandle: async () => {
		fileReads++;
		assert.fail("Folder settings must not read files");
	},
	getDirectoryHandle: async () => assert.fail("Folder settings must not traverse directories"),
	values() {
		assert.fail("Folder settings must not list files");
	},
};
window.showDirectoryPicker = function (options) {
	assert.equal(this, window, "The picker must remain bound to its browser window");
	pickerCalls++;
	assert.deepEqual(options, { id: "sitegeist-working-folder", mode: "read" });
	if (cancel) return Promise.reject(new DOMException("Cancelled", "AbortError"));
	return Promise.resolve(root);
};
const workspace = new ReadonlyWorkspace(store, { picker: getWorkspaceDirectoryPicker() });
const tab = new WorkspaceTab(workspace);
const tick = async () => {
	await new Promise((resolve) => setImmediate(resolve));
	await tab.updateComplete;
};
const button = (label) => Array.from(tab.querySelectorAll("button")).find((item) => item.textContent.trim() === label);
document.body.appendChild(tab);
await tick();
assert.match(tab.textContent, /No working folder selected/);
assert.match(tab.textContent, /does not upload/);
button("Choose folder").click();
assert.equal(pickerCalls, 1, "Picker must execute synchronously within the click handler");
await tick();
assert.match(tab.textContent, /Test inbox/);
assert.match(tab.textContent, /Read-only/);
assert.match(tab.textContent, /Read access is ready/);
assert.ok(button("Change folder"));
assert.ok(button("Disconnect folder"));
assert.equal(button("Grant read access"), undefined);
assert.equal(writes.length, 1);
assert.equal(writes[0].handle, root);
assert.equal(fileReads, 0);

cancel = true;
button("Change folder").click();
await tick();
assert.match(tab.textContent, /Test inbox/);
assert.equal(tab.querySelector('[role="alert"]'), null, "Cancelling is not an error");
assert.equal(writes.length, 1);

permission = "prompt";
await workspace.refresh();
await tick();
assert.match(tab.textContent, /Read access needs confirmation/);
button("Grant read access").click();
assert.equal(requests, 1, "Reauthorization must execute synchronously within the click handler");
await tick();
assert.match(tab.textContent, /Read access is ready/);
button("Read and write").click();
assert.equal(writeRequests, 1, "Write permission must execute synchronously within the click gesture");
await tick();
assert.equal(selection.writeEnabled, true);
assert.match(tab.textContent, /Writing is enabled/);
writePermission = "prompt";
await workspace.refresh();
await tick();
assert.match(tab.textContent, /Write access needs confirmation/);
button("Read and write").click();
await tick();
assert.equal(writeRequests, 2);
button("Use read-only access").click();
await tick();
assert.equal(selection.writeEnabled, false);
assert.equal(writePermission, "granted", "Application opt-out must block writes even if Chrome retains its grant");
assert.equal(fileReads, 0);
button("Disconnect folder").click();
await tick();
assert.match(tab.textContent, /No working folder selected/);
assert.equal(selection, null);
assert.equal(fileReads, 0);

localStorage.setItem("language", "de");
tab.requestUpdate();
await tick();
assert.equal(tab.getTabName(), "Ordner");
assert.match(tab.textContent, /Arbeitsordner/);
assert.ok(button("Ordner auswählen"));
tab.remove();

const unsupported = new WorkspaceTab(new ReadonlyWorkspace(store));
document.body.appendChild(unsupported);
await new Promise((resolve) => setImmediate(resolve));
await unsupported.updateComplete;
assert.match(unsupported.textContent, /nicht verfügbar/);
assert.equal(unsupported.querySelector("button").disabled, true);
unsupported.remove();

// Exercise the actual existing spreadsheet extractor, not a mocked document parser.
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
	workbook,
	XLSX.utils.aoa_to_sheet([
		["Product", "Price"],
		["Example", 42],
	]),
	"Prices",
);
const workbookFile = new File([XLSX.write(workbook, { bookType: "xlsx", type: "array" })], "prices.xlsx", {
	type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
});
await store.save({
	id: "spreadsheet-folder",
	handle: {
		...root,
		getFileHandle: async (name) => {
			assert.equal(name, "prices.xlsx");
			return { kind: "file", name, getFile: async () => workbookFile };
		},
	},
});
const documentWorkspace = new ReadonlyWorkspace(store, {
	extractDocumentText: async (file) => (await loadAttachment(file)).extractedText,
});
const spreadsheet = await documentWorkspace.readFile({ path: "prices.xlsx" });
assert.match(spreadsheet.text, /Product,Price/);
assert.match(spreadsheet.text, /Example,42/);
localStorage.setItem("language", "en");
const request = {
	folder: "Inbox",
	path: "report.txt",
	exists: true,
	existingSize: 20,
	size: 32,
	encoding: "utf8",
	preview: '<img src="x" onerror="danger()">',
};
// The dialog is a body-level portal, outside the chat's text-foreground container.
// Explicit theme classes must cover metadata and previews in both theme modes.
for (const dark of [false, true]) {
	document.documentElement.classList.toggle("dark", dark);
	for (const variant of [
		{ ...request, exists: false },
		request,
		{ ...request, encoding: "base64", preview: undefined, artifact: "report.pdf" },
	]) {
		const confirmation = WorkspaceWriteDialog.confirm(variant);
		const themedDialog = document.querySelector("workspace-write-dialog");
		await themedDialog.updateComplete;
		const content = themedDialog.querySelector(".bg-background.text-foreground");
		assert.ok(content, "Body-level dialogs must supply a theme-aware foreground and background");
		assert.equal(themedDialog.querySelector("code").closest(".text-foreground"), content);
		assert.equal(themedDialog.querySelector("strong").closest(".text-foreground"), content);
		const warning = themedDialog.querySelector(".text-amber-700");
		assert.ok(warning?.classList.contains("dark:text-amber-300"), "Warnings need contrasting colors in both themes");
		assert.equal(themedDialog.querySelector(".text-warning"), null, "The installed theme has no warning color token");
		const preview = themedDialog.querySelector("pre");
		if (variant.preview !== undefined) {
			assert.ok(preview?.classList.contains("bg-muted"));
			assert.ok(preview?.classList.contains("text-foreground"));
		}
		themedDialog.close();
		assert.equal(await confirmation, false);
	}
}
document.documentElement.classList.remove("dark");

const approved = WorkspaceWriteDialog.confirm(request);
let dialog = document.querySelector("workspace-write-dialog");
await dialog.updateComplete;
assert.match(dialog.textContent, /Replace existing file/);
assert.match(dialog.textContent, /report.txt/);
assert.equal(dialog.querySelector("img"), null, "Proposed content is plain text, never executable HTML");
Array.from(dialog.querySelectorAll("button"))
	.find((item) => item.textContent.trim() === "Replace existing file")
	.click();
assert.equal(await approved, true);
assert.equal(document.querySelector("workspace-write-dialog"), null);

const cancelled = WorkspaceWriteDialog.confirm(request);
dialog = document.querySelector("workspace-write-dialog");
await dialog.updateComplete;
Array.from(dialog.querySelectorAll("button"))
	.find((item) => item.textContent.trim() === "Cancel")
	.click();
assert.equal(await cancelled, false);

const bidi = WorkspaceWriteDialog.confirm({ ...request, path: "report\u202etxt" });
dialog = document.querySelector("workspace-write-dialog");
await dialog.updateComplete;
assert.match(dialog.querySelector("code").textContent, /\\u202e/);
assert.doesNotMatch(dialog.querySelector("code").textContent, /\u202e/);
dialog.close();
assert.equal(await bidi, false);

const closed = WorkspaceWriteDialog.confirm(request);
document.querySelector("workspace-write-dialog").close();
assert.equal(await closed, false);
const abortedController = new AbortController();
const aborted = WorkspaceWriteDialog.confirm(request, abortedController.signal);
abortedController.abort();
assert.equal(await aborted, false);
assert.equal(document.querySelector("workspace-write-dialog"), null);

console.log("Workspace UI, handle storage and document extraction verified");
