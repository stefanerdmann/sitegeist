import assert from "node:assert/strict";
import { getModels } from "@mariozechner/pi-ai";
import { MessageEditor } from "../../../pi-mono/packages/web-ui/dist/components/MessageEditor.js";

const editor = new MessageEditor();
editor.currentModel = {
	...getModels("openai-codex")[0],
	id: "gpt-5.6-luna",
	reasoning: true,
	thinkingLevelMap: { off: "none", minimal: "low", xhigh: "xhigh" },
};
editor.thinkingLevel = "medium";
let selected;
editor.onThinkingChange = (level) => {
	selected = level;
};
document.body.appendChild(editor);
await editor.updateComplete;

assert.match(editor.querySelector('[role="combobox"]').textContent, /Medium/);
editor.querySelector('[role="combobox"]').click();
const option = Array.from(document.querySelectorAll('[role="option"]')).find((item) =>
	item.textContent?.includes("Extra High"),
);
assert.ok(option, "xhigh should be offered for models with pi.dev metadata");
option.click();
await editor.updateComplete;
assert.equal(selected, "xhigh");
assert.equal(editor.thinkingLevel, "xhigh");
assert.match(editor.querySelector('[role="combobox"]').textContent, /XHigh|Extra High/);
editor.querySelector('[role="combobox"]').click();
const offOption = Array.from(document.querySelectorAll('[role="option"]')).find(
	(item) => item.textContent?.trim() === "Off",
);
assert.ok(offOption, "models advertising off: none should show Off");
offOption.click();
await editor.updateComplete;
assert.equal(selected, "off");
assert.match(editor.querySelector('[role="combobox"]').textContent, /Off/);

const defaultEffortModel = getModels("openai").find((model) => model.id === "gpt-5.4");
assert.ok(defaultEffortModel);
editor.currentModel = defaultEffortModel;
editor.thinkingLevel = "medium";
await editor.updateComplete;
editor.querySelector('[role="combobox"]').click();
const defaultOption = Array.from(document.querySelectorAll('[role="option"]')).find(
	(item) => item.textContent?.trim() === "Default",
);
assert.ok(defaultOption, "models with no off mapping should not claim reasoning is disabled");
console.log("Thinking selector updated and accurately labels Off/Default");
