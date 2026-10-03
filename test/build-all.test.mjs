import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const buildScript = fileURLToPath(new URL("../build-all.sh", import.meta.url));

function dryRun(...args) {
	return spawnSync("bash", [buildScript, ...args, "--dry-run"], {
		cwd: "/tmp",
		encoding: "utf8",
	});
}

test("build-all builds extension dependencies in order without regenerating models", () => {
	const result = dryRun();
	assert.equal(result.status, 0, result.stderr);
	const stages = [
		"Build mini-lit",
		"Build pi-mono: tui",
		"Build pi-mono: ai (without regenerating models)",
		"Build pi-mono: agent",
		"Build pi-mono: web-ui TypeScript",
		"Build pi-mono: web-ui CSS",
		"Build sitegeist Chrome extension",
	];
	let position = -1;
	for (const stage of stages) {
		const next = result.stdout.indexOf(stage);
		assert.ok(next > position, `Missing or out-of-order stage: ${stage}`);
		position = next;
	}
	assert.match(result.stdout, /npm run build:chrome/);
	assert.doesNotMatch(result.stdout, /generate-models\.ts|npm run generate-models|Build website/);
});

test("website and platform reinstall steps are opt-in", () => {
	const result = dryRun("--install", "--with-site");
	assert.equal(result.status, 0, result.stderr);
	assert.ok(result.stdout.indexOf("Install sitegeist dependencies") < result.stdout.indexOf("Build mini-lit"));
	assert.ok(result.stdout.indexOf("Build sitegeist Chrome extension") < result.stdout.indexOf("Build website"));
	assert.match(result.stdout, /npm ci --include=optional/);
	assert.match(result.stdout, /npm install --no-package-lock --include=optional/);
});

test("invalid arguments fail without building anything", () => {
	const result = dryRun("--unknown");
	assert.equal(result.status, 2);
	assert.match(result.stderr, /Unknown option/);
	assert.doesNotMatch(result.stdout, /Build mini-lit/);
});
