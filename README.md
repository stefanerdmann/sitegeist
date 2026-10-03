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

## Checks

```bash
./check.sh
```

Runs formatting, linting, and type checking for the extension and the `site/` subproject.

The Husky pre-commit hook runs the same checks before each commit.

## Building

From the `sitegeist/` directory, build the extension and its local dependencies in one command:

```bash
npm run build:all
```

This builds `mini-lit`, the required `pi-mono` packages (TUI, AI, agent, web-ui), and the Chrome extension in order. It does not regenerate `pi-mono/packages/ai/src/models.generated.ts` or build unrelated monorepo packages. The unpacked extension is written to `dist-chrome/`; reload it in `chrome://extensions/` after building.

If native dependencies were installed on another OS (for example, Linux instead of macOS), use `npm run build:all -- --install` to reinstall dependencies for the current machine before building. Add `--with-site` to also build the marketing website, or `--dry-run` to show the build steps without running them. `npm run build` continues to build only the extension.

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

Bumps the version in `static/manifest.chrome.json`, commits, tags, and pushes. GitHub Actions builds the extension and creates a release at [github.com/badlogic/sitegeist/releases](https://github.com/badlogic/sitegeist/releases).

## License

AGPL-3.0. See [LICENSE](LICENSE).
