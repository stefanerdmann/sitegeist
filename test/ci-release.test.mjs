import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
	configureRelease,
	extractReleaseNotes,
	prepareDependencies,
	readDependencies,
	recordBuild,
	validateSource,
	versionFromTag,
} from "../scripts/ci-release.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const parentRoot = resolve(projectRoot, "..");
const config = readDependencies();
const scratch = mkdtempSync(resolve(tmpdir(), "sitegeist-ci-release-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

function git(directory, ...args) {
	return execFileSync("git", ["-C", directory, ...args], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
}

function clone(source, destination, commit) {
	// Borrow immutable objects locally without hydrating the complete history of partial clones.
	execFileSync("git", ["clone", "--quiet", "--shared", "--no-checkout", "--no-tags", source, destination], {
		stdio: "pipe",
	});
	git(destination, "checkout", "--quiet", "--detach", commit);
}

let seed;
function cleanDependencies(label) {
	if (!seed) {
		seed = resolve(scratch, "seed");
		mkdirSync(seed);
		clone(resolve(parentRoot, "mini-lit"), resolve(seed, "mini-lit"), config.miniLit.commit);
		clone(resolve(parentRoot, "pi-mono"), resolve(seed, "pi-mono"), config.piMono.commit);
	}
	const workspace = resolve(scratch, label);
	cpSync(seed, workspace, { recursive: true });
	return workspace;
}

function toolingCopy(label) {
	const root = resolve(scratch, label);
	mkdirSync(root);
	cpSync(resolve(projectRoot, "ci"), resolve(root, "ci"), { recursive: true });
	return root;
}

test("release inputs are restricted to version tags and never become shell commands or arbitrary checkout refs", () => {
	assert.equal(versionFromTag("v1.1.0"), "1.1.0");
	const selected = configureRelease("v1.1.0");
	assert.equal(selected.tag_ref, "refs/tags/v1.1.0");
	assert.equal(selected.pi_mono_commit, config.piMono.commit);
	assert.equal(selected.mini_lit_commit, config.miniLit.commit);
	for (const tag of [
		undefined,
		"main",
		"v1.1.0; echo secret",
		"v1.1.0\n",
		"../v1.1.0",
		"v01.1.0",
		"refs/tags/v1.1.0",
		"v1.1.0-rc1",
	]) {
		assert.throws(() => configureRelease(tag), /existing release tag/);
	}
});

test("CI pins and patch exactly reproduce the committed Pi changes without generated models", () => {
	const patch = readFileSync(resolve(projectRoot, "ci", config.piMono.patch));
	assert.equal(createHash("sha256").update(patch).digest("hex"), config.piMono.patchSha256);
	assert.doesNotMatch(patch.toString(), /diff --git .*models\.generated\.ts/);
	const workspace = cleanDependencies("reviewed-patch");
	const pi = resolve(workspace, "pi-mono");
	const catalog = resolve(pi, "packages/ai/src/models.generated.ts");
	const originalCatalog = readFileSync(catalog);
	prepareDependencies(workspace);
	assert.equal(git(pi, "write-tree"), config.piMono.patchedTree);
	assert.deepEqual(readFileSync(catalog), originalCatalog);
	assert.equal(git(pi, "hash-object", "packages/ai/src/models.generated.ts"), config.piMono.modelCatalogBlob);
	assert.match(readFileSync(resolve(pi, "packages/ai/src/models.ts"), "utf8"), /getSelectableThinkingLevels/);
	assert.match(readFileSync(resolve(pi, "packages/ai/src/types.ts"), "utf8"), /reasoningEffort\?: "none"/);
	assert.match(readFileSync(resolve(pi, "packages/web-ui/src/ChatPanel.ts"), "utf8"), /onModelSelect/);
	assert.throws(
		() => prepareDependencies(workspace),
		/not clean/,
		"Never silently reapply a patch to modified dependencies",
	);
});

test("unexpected source revisions and dirty model catalogs fail before patch application", () => {
	const workspace = cleanDependencies("wrong-revision");
	const alteredTooling = toolingCopy("wrong-pins");
	const altered = structuredClone(config);
	altered.piMono.commit = "0".repeat(40);
	writeFileSync(resolve(alteredTooling, "ci/dependencies.json"), JSON.stringify(altered));
	assert.throws(() => prepareDependencies(workspace, alteredTooling), /Unexpected dependency revision/);
	const pi = resolve(workspace, "pi-mono");
	assert.equal(git(pi, "status", "--porcelain"), "");
	writeFileSync(resolve(pi, "packages/ai/src/models.generated.ts"), "user generated data\n");
	assert.throws(() => prepareDependencies(workspace), /not clean/);
	assert.equal(readFileSync(resolve(pi, "packages/ai/src/models.generated.ts"), "utf8"), "user generated data\n");
});

test("corrupted patches and incorrect resulting-tree expectations fail closed", () => {
	const workspace = cleanDependencies("corrupted-patch");
	const alteredTooling = toolingCopy("corrupted-tooling");
	const patch = resolve(alteredTooling, "ci", config.piMono.patch);
	writeFileSync(patch, `${readFileSync(patch, "utf8")}\ncorrupted patch\n`);
	assert.throws(() => prepareDependencies(workspace, alteredTooling), /checksum/);
	assert.equal(git(resolve(workspace, "pi-mono"), "status", "--porcelain"), "");
	cpSync(resolve(projectRoot, "ci", config.piMono.patch), patch);
	const altered = structuredClone(config);
	altered.piMono.patchedTree = "0".repeat(40);
	writeFileSync(resolve(alteredTooling, "ci/dependencies.json"), JSON.stringify(altered));
	assert.throws(() => prepareDependencies(workspace, alteredTooling), /reviewed Sitegeist dependency/);
});

test("release notes include the entire selected section, not Unreleased or an older release", () => {
	const changelog =
		"# Changelog\n\n## [Unreleased]\n\nFuture changes\n\n## [1.1.0] - 2026-10-04\n\n### Added\n\n- First feature\n- Second feature\n\n### Fixed\n\n- A fix\n\n## [1.0.0] - 2026-03-15\n\nOld changes\n";
	const notes = extractReleaseNotes(changelog, "1.1.0");
	assert.match(notes, /First feature/);
	assert.match(notes, /Second feature/);
	assert.match(notes, /A fix/);
	assert.match(notes, /sitegeist\.zip/);
	assert.doesNotMatch(notes, /Future changes|Old changes/);
	assert.throws(() => extractReleaseNotes(changelog, "2.0.0"), /No changelog section/);
});

test("build provenance binds a tagged source tree to pinned and verified dependencies", () => {
	const workspace = cleanDependencies("build-provenance");
	prepareDependencies(workspace);
	const source = resolve(workspace, "sitegeist");
	clone(projectRoot, source, git(projectRoot, "rev-parse", "HEAD"));
	const manifest = JSON.parse(readFileSync(resolve(source, "static/manifest.chrome.json"), "utf8"));
	const tag = `v${manifest.version}`;
	// A fresh, throwaway fixture tag; this never changes any real repository tag.
	git(source, "tag", tag);
	assert.equal(validateSource(tag, source).version, manifest.version);
	mkdirSync(resolve(source, "dist-chrome"));
	cpSync(resolve(source, "static/manifest.chrome.json"), resolve(source, "dist-chrome/manifest.json"));
	const info = recordBuild(tag, workspace);
	assert.equal(info.sourceCommit, git(source, "rev-parse", "HEAD"));
	assert.equal(info.dependencies.piMono.patchedTree, config.piMono.patchedTree);
	assert.ok(existsSync(resolve(source, "release-notes.md")));
	assert.deepEqual(JSON.parse(readFileSync(resolve(source, "dist-chrome/build-info.json"), "utf8")), info);
	const builtManifest = resolve(source, "dist-chrome/manifest.json");
	writeFileSync(builtManifest, JSON.stringify({ version: "0.0.0" }));
	assert.throws(() => recordBuild(tag, workspace), /Built manifest version differs/);
	cpSync(resolve(source, "static/manifest.chrome.json"), builtManifest);
	writeFileSync(resolve(workspace, "pi-mono/packages/ai/src/models.generated.ts"), "regenerated models\n");
	assert.throws(() => recordBuild(tag, workspace), /regenerated the bundled model catalog/);
});

test("manual workflow uses current repair tooling but immutable tagged extension sources and gated publication", () => {
	const workflow = readFileSync(resolve(projectRoot, ".github/workflows/build.yml"), "utf8");
	assert.match(workflow, /workflow_dispatch:/);
	assert.match(workflow, /release_tag:/);
	assert.match(workflow, /path: release-tooling/);
	assert.match(workflow, /ref: \$\{\{ steps\.release\.outputs\.tag_ref \}\}/);
	assert.match(workflow, /prepare-dependencies/);
	assert.match(workflow, /\.\/build-all\.sh --install/);
	assert.match(workflow, /npm test/);
	assert.match(workflow, /needs: build/);
	assert.match(workflow, /gh release upload .*--clobber/);
	assert.match(workflow, /--verify-tag/);
	assert.doesNotMatch(workflow, /git clone .*pi-mono|npm run build\b|generate-models|git push/);
	const cli = spawnSync(process.execPath, [resolve(projectRoot, "scripts/ci-release.mjs"), "configure"], {
		encoding: "utf8",
		env: { ...process.env, RELEASE_TAG: "v1.1.0; exit 0" },
	});
	assert.equal(cli.status, 1);
	assert.match(cli.stderr, /existing release tag/);
});
