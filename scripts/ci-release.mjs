import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolingRoot = fileURLToPath(new URL("../", import.meta.url));
const catalogPath = "packages/ai/src/models.generated.ts";
const commitPattern = /^[0-9a-f]{40}$/;

function git(directory, ...args) {
	return execFileSync("git", ["-C", directory, ...args], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
}

export function versionFromTag(tag) {
	if (typeof tag !== "string" || !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag)) {
		throw new Error("Use an existing release tag such as v1.1.0, not a branch name or arbitrary ref.");
	}
	return tag.slice(1);
}

export function readDependencies(root = toolingRoot) {
	const config = JSON.parse(readFileSync(resolve(root, "ci/dependencies.json"), "utf8"));
	for (const dependency of [config.miniLit, config.piMono]) {
		if (!dependency || !/^[\w.-]+\/[\w.-]+$/.test(dependency.repository) || !commitPattern.test(dependency.commit)) {
			throw new Error("CI dependencies must specify a GitHub repository and a full immutable commit SHA.");
		}
	}
	const pi = config.piMono;
	if (
		!commitPattern.test(pi.patchedTree) ||
		!commitPattern.test(pi.modelCatalogBlob) ||
		!/^[0-9a-f]{64}$/.test(pi.patchSha256)
	) {
		throw new Error("The Pi patch requires an expected tree, bundled catalog blob and SHA-256 checksum.");
	}
	if (
		typeof pi.patch !== "string" ||
		isAbsolute(pi.patch) ||
		pi.patch.split(/[\\/]/).some((part) => !part || part === "..")
	) {
		throw new Error("The Pi patch must be a relative path inside ci/.");
	}
	return config;
}

export function configureRelease(tag, root = toolingRoot) {
	const version = versionFromTag(tag);
	const dependencies = readDependencies(root);
	return {
		tag,
		tag_ref: `refs/tags/${tag}`,
		version,
		mini_lit_repository: dependencies.miniLit.repository,
		mini_lit_commit: dependencies.miniLit.commit,
		pi_mono_repository: dependencies.piMono.repository,
		pi_mono_commit: dependencies.piMono.commit,
	};
}

function verifyCheckout(directory, dependency) {
	if (git(directory, "rev-parse", "HEAD") !== dependency.commit) {
		throw new Error(`Unexpected dependency revision in ${directory}; expected ${dependency.commit}.`);
	}
	if (git(directory, "status", "--porcelain")) {
		throw new Error(`Dependency checkout is not clean: ${directory}. This helper only patches fresh CI checkouts.`);
	}
}

export function prepareDependencies(workspace, root = toolingRoot) {
	const config = readDependencies(root);
	verifyCheckout(resolve(workspace, "mini-lit"), config.miniLit);
	const piDirectory = resolve(workspace, "pi-mono");
	verifyCheckout(piDirectory, config.piMono);
	const patchPath = resolve(root, "ci", config.piMono.patch);
	const patch = readFileSync(patchPath);
	if (createHash("sha256").update(patch).digest("hex") !== config.piMono.patchSha256) {
		throw new Error("Pi patch checksum does not match ci/dependencies.json.");
	}
	if (git(piDirectory, "hash-object", catalogPath) !== config.piMono.modelCatalogBlob) {
		throw new Error("The bundled model catalog does not match the pinned Pi release.");
	}
	git(piDirectory, "apply", "--check", "--index", patchPath);
	git(piDirectory, "apply", "--index", patchPath);
	if (git(piDirectory, "write-tree") !== config.piMono.patchedTree) {
		throw new Error("Patched Pi tree does not match the reviewed Sitegeist dependency commits.");
	}
	if (git(piDirectory, "hash-object", catalogPath) !== config.piMono.modelCatalogBlob) {
		throw new Error("The Pi patch unexpectedly changed the bundled model catalog.");
	}
	return config;
}

export function validateSource(tag, sourceDirectory) {
	const expected = versionFromTag(tag);
	const sourceCommit = git(sourceDirectory, "rev-parse", "HEAD");
	if (git(sourceDirectory, "rev-parse", `refs/tags/${tag}^{commit}`) !== sourceCommit) {
		throw new Error("Extension sources must be checked out from the selected release tag, not the workflow branch.");
	}
	if (git(sourceDirectory, "diff", "HEAD", "--name-only")) {
		throw new Error("Tagged extension source files were modified in the build checkout.");
	}
	const manifest = JSON.parse(readFileSync(resolve(sourceDirectory, "static/manifest.chrome.json"), "utf8"));
	if (manifest.version !== expected)
		throw new Error(`Tag ${tag} does not match manifest version ${manifest.version}.`);
	if (!existsSync(resolve(sourceDirectory, "build-all.sh"))) {
		throw new Error("This source tag does not contain build-all.sh; select a supported Sitegeist release.");
	}
	return { version: expected, source_commit: sourceCommit };
}

export function extractReleaseNotes(changelog, version) {
	versionFromTag(`v${version}`);
	const escaped = version.replaceAll(".", "\\.");
	const match = changelog.match(new RegExp(`(?:^|\\n)## \\[${escaped}\\][^\\n]*\\n(.*?)(?=\\n## \\[|$)`, "s"));
	if (!match) throw new Error(`No changelog section found for ${version}.`);
	return `${match[1].trim()}\n\n---\n\nDownload \`sitegeist.zip\`, unzip, and load its directory as an unpacked extension in Chrome/Edge.\n`;
}

export function recordBuild(tag, workspace, root = toolingRoot) {
	const sourceDirectory = resolve(workspace, "sitegeist");
	const source = validateSource(tag, sourceDirectory);
	const dependencies = readDependencies(root);
	const manifest = JSON.parse(readFileSync(resolve(sourceDirectory, "dist-chrome/manifest.json"), "utf8"));
	if (manifest.version !== source.version)
		throw new Error("Built manifest version differs from the selected release tag.");
	const piDirectory = resolve(workspace, "pi-mono");
	if (
		git(piDirectory, "write-tree") !== dependencies.piMono.patchedTree ||
		git(piDirectory, "diff", "--name-only") ||
		git(piDirectory, "hash-object", catalogPath) !== dependencies.piMono.modelCatalogBlob
	) {
		throw new Error("Build modified tracked Pi sources or regenerated the bundled model catalog.");
	}
	if (git(resolve(workspace, "mini-lit"), "rev-parse", "HEAD") !== dependencies.miniLit.commit) {
		throw new Error("Build changed the pinned mini-lit revision.");
	}
	const info = {
		tag,
		version: source.version,
		sourceCommit: source.source_commit,
		toolingCommit: git(root, "rev-parse", "HEAD"),
		dependencies,
	};
	writeFileSync(resolve(sourceDirectory, "dist-chrome/build-info.json"), `${JSON.stringify(info, null, 2)}\n`);
	writeFileSync(
		resolve(sourceDirectory, "release-notes.md"),
		extractReleaseNotes(readFileSync(resolve(sourceDirectory, "CHANGELOG.md"), "utf8"), source.version),
	);
	return info;
}

function output(values) {
	const text = `${Object.entries(values)
		.map(([key, value]) => `${key}=${value}`)
		.join("\n")}\n`;
	if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, text);
	else process.stdout.write(text);
}

function main() {
	const [command, argument, directory] = process.argv.slice(2);
	switch (command) {
		case "configure":
			output(configureRelease(process.env.RELEASE_TAG));
			break;
		case "prepare-dependencies":
			if (!argument) throw new Error("Provide the workspace containing fresh mini-lit and pi-mono checkouts.");
			prepareDependencies(resolve(argument));
			console.log("Pinned dependency sources and Pi compatibility patch verified.");
			break;
		case "validate-source":
			if (!directory) throw new Error("Provide the release tag and source directory.");
			output(validateSource(argument, resolve(directory)));
			break;
		case "record-build":
			if (!directory) throw new Error("Provide the release tag and workspace directory.");
			recordBuild(argument, resolve(directory));
			break;
		default:
			throw new Error("Use configure, prepare-dependencies, validate-source or record-build.");
	}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
