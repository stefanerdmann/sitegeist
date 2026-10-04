<p align="center">
  <img src="media/hero.png" alt="Sitegeist" width="400">
</p>

An AI assistant that lives in your browser sidebar. Built for collaboration, not autonomy theater. You guide, it executes.

Sitegeist can automate repetitive web tasks, extract data from any website, navigate across pages, fill out forms, compare products, compile research, and transform what it finds into documents, spreadsheets, or whatever you need. It works on any website through a Chrome/Edge side panel, using the AI provider of your choice.

Bring your own API key or log in with an existing subscription (Anthropic Claude, OpenAI/ChatGPT, GitHub Copilot, Google Gemini). Your data stays on your machine. Nothing is collected or tracked.

## Download & Install

Visit [sitegeist.ai](https://sitegeist.ai) for download links and step-by-step installation instructions.

Requires Chrome 141+ or Edge equivalent.

## Development

Clone this repo plus its sibling dependencies into the same parent directory:

```
parent/
  mini-lit/          # https://github.com/badlogic/mini-lit
  pi-mono/           # https://github.com/badlogic/pi-mono
  sitegeist/         # this repo
```

Install dependencies in each repo:

```bash
(cd ../mini-lit && npm install)
(cd ../pi-mono && npm install)
npm install
```

`npm install` sets up the Husky pre-commit hook automatically.

Start all dev watchers (mini-lit, pi-mono, sitegeist extension, marketing site):

```bash
./dev.sh
```

Changes in `../mini-lit` or `../pi-mono` are rebuilt automatically and picked up by the sitegeist watcher.

To run only the extension watcher without dependencies or the marketing site:

```bash
npm run dev
```

### Loading the extension

1. Open `chrome://extensions/` or `edge://extensions/`
2. Enable Developer mode
3. Click Load unpacked
4. Select `sitegeist/dist-chrome/`
5. Click "Details" on the Sitegeist extension and enable:
   - **Allow user scripts**
   - **Allow access to file URLs**

The extension hot-reloads when the dev watcher rebuilds.

### First run

On first launch, Sitegeist prompts you to connect at least one AI provider. You can log in with a subscription or enter an API key.

For GitHub Copilot, enter your GitHub Enterprise hostname (for example, `company.ghe.com`) in the login form if your account uses a custom host. Leave it blank to use `github.com`. The model picker loads the models available to your account from Copilot. If a model is missing or the catalog is unavailable, you can enter its exact model ID and select an API protocol manually. Manually added models are saved per Enterprise domain and can be removed from the picker. The model still has to be enabled for your account.

The model picker checks [pi.dev's JSON model catalog](https://pi.dev/api/models) for Anthropic, OpenAI (API keys and ChatGPT/Codex login), and GitHub Copilot. Model IDs, API protocols, context limits and other supported metadata (including available thinking levels) are refreshed at most once per hour or with **Refresh models**. If pi.dev is unreachable, the last cached catalog or bundled models are used. No credentials are sent to pi.dev. pi.dev describes providers' models, not which ones your subscription can access; Copilot models are additionally checked against the signed-in account. The thinking dropdown hides unsupported efforts and translates model-specific aliases (such as Minimal to Low). When pi.dev advertises `off: none`, selecting **Off** sends `reasoning.effort: none`; models that cannot disable reasoning show **Default** instead. The current runtime does not offer pi.dev's separate Max level. For example, OpenAI lists `none` for [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), but not for every reasoning model.

Some subscription logins require the CORS proxy (configurable in Settings > Proxy). The default proxy is `https://proxy.mariozechner.at/proxy`.

## Local working folder

Click the **folder icon** in the header or open **Settings > Folder** to choose a folder on your computer. Access starts **read-only**; choosing a folder does not enable writing, even if Chrome remembers an earlier write grant. The selected folder is shared across chats and windows; its handle is remembered locally in IndexedDB. After restarting Chrome, you may need to click **Grant read access** or select the folder again.

You can place files in that folder and ask, for example:

- "List the files in my working folder."
- "Read `documents/report.pdf` and summarize it."
- "Compare `data/prices.csv` with the prices on this website."

Sitegeist lists one directory at a time with `list_workspace_files` and reads specific files with `read_workspace_file`. Both tools use relative paths inside the selected folder. Text/code/CSV/JSON (UTF-8 or UTF-16), PDF, Word (`.docx`), Excel (`.xlsx`/`.xls`), PowerPoint (`.pptx`), and PNG/JPEG/GIF/WebP images are supported, up to **20 MB per file**. Listings and text reads are paginated to limit model context. Each read sees the current file, including files added or changed after selection; there is no automatic folder watcher or bulk upload.

**Privacy:** Selecting a folder does not send its files to an AI provider. When Sitegeist uses a listing or reads a file for your request, the returned names/content become part of the conversation and are sent to the selected provider. Choose a task-specific folder rather than your entire home directory. **Disconnect folder** stops future access in all Sitegeist windows and forgets the handle, but does not remove previous tool results from chats or undo data already sent. Delete the relevant sessions to remove their local copies.

### Optional write access

Choose **Read and write** in **Settings > Folder** to explicitly enable writing and grant Chrome's `readwrite` permission. This applies to the selected folder across chats/windows. **Use read-only access** disables Sitegeist's write tools again even if Chrome retains its browser permission. After a restart or revocation, click **Read and write** to renew access.

You can then ask, for example, "Save the summary as `documents/summary.md`" or "Save the generated `report.xlsx` artifact in my working folder." `write_workspace_file` accepts UTF-8 text, base64 binary content, or an existing session artifact with an explicit encoding. Reads and writes are limited to **20 MB per file**; replacing larger existing files is also blocked.

**Every save requires a separate human confirmation**, including new files. The dialog shows the exact target, byte count, source artifact (if applicable) and a preview for text. Existing files require explicit replacement confirmation; the model cannot approve the dialog itself or bypass it with a tool flag. New files also require confirmation because the browser API has no atomic exclusive-create operation. Cancel, close or stop the agent to decline a pending save.

Writes use exclusive browser locks and staged streams. Existing contents are checked locally for changes before staging and committing; their bytes are not sent to the AI by the write tool. Changed destinations, revoked access and cancellation before commit abort staging rather than saving the proposed data. This is not an OS-wide lock against unrelated applications: keep backups of important files. Once the stream commits, cancellation cannot undo a saved change. An interrupted new-file creation may leave an empty file; Sitegeist does not delete it.

There is **no deletion, renaming or directory-creation tool**. Destination parent directories must already exist. Generated artifacts remain independently downloadable. Folder handles are never exposed to REPL code, HTML artifacts or browser pages. Regular chat attachments continue to work independently. The extension's **Allow access to file URLs** setting is not a substitute for choosing and granting access to a folder. If the browser does not support folder access, use attachments instead.

## Checks

```bash
./check.sh
```

Runs formatting, linting, and type checking for the extension and the `site/` subproject. Run `npm test` for the extension's targeted unit and UI tests, including folder permissions, path containment, live reads, pagination, write opt-in, confirmation, staging, concurrent changes, and cancellation.

The Husky pre-commit hook runs the same checks before each commit.

## Building

From the `sitegeist/` directory, build the extension and its local dependencies in one command:

```bash
npm run build:all
```

This builds `mini-lit`, the required `pi-mono` packages (TUI, AI, agent, web-ui), and the Chrome extension in order. It does not regenerate `pi-mono/packages/ai/src/models.generated.ts` or build unrelated monorepo packages. The unpacked extension is written to `dist-chrome/`; reload it in `chrome://extensions/` after building.

If native dependencies were installed on another OS (for example, Linux instead of macOS), use `npm run build:all -- --install` to reinstall dependencies for the current machine before building. Add `--with-site` to also build the marketing website, or `--dry-run` to show the build steps without running them. `npm run build` continues to build only the extension.

### GitHub release builds

The release workflow pins `mini-lit` and `pi-mono` to the source revisions in [`ci/dependencies.json`](ci/dependencies.json), verifies and applies the bundled Pi compatibility patch, and runs `build-all.sh --install`. It never regenerates model data or runs the full Pi monorepo build. Extension type checks and regression tests must pass before publication. The ZIP includes a `build-info.json` recording tagged extension sources, release tooling and exact dependency revisions.

To rebuild the already-pushed `v1.1.0` with the repaired workflow, first commit and push the workflow changes to `main`. In GitHub **Actions > Release Extension > Run workflow**, choose branch `main` and enter `v1.1.0` as **release_tag**. This uses the new build tooling but keeps the extension's existing tag unchanged; do not move or force-push it. A successful run creates the release or replaces its `sitegeist.zip` asset. Merely re-running the old tag job still uses the old workflow. See [`ci/README.md`](ci/README.md) for provenance checks and dependency updates.

## Updating the website

```bash
cd site && ./run.sh deploy
```

Builds the static site and uploads it to `sitegeist.ai`. Requires SSH access to `slayer.marioslab.io`.

## Releasing

```bash
./release.sh patch   # 1.0.0 -> 1.0.1
./release.sh minor   # 1.0.0 -> 1.1.0
./release.sh major   # 1.0.0 -> 2.0.0
```

Bumps the version in `static/manifest.chrome.json`, commits, tags, and pushes. GitHub Actions builds the extension and creates a release in [this repository's Releases](https://github.com/stefanerdmann/sitegeist/releases).

## License

AGPL-3.0. See [LICENSE](LICENSE).
