# Changelog

## [Unreleased]

## [1.1.0] - 2026-10-04

### Added

- GitHub Copilot login for GitHub Enterprise domains, including token refresh and Enterprise model API routing
- Account-specific GitHub Copilot models in the model picker, with saved manual model IDs and API protocol overrides
- Hourly model metadata refresh from pi.dev for Anthropic, OpenAI/Codex, and Copilot, with local cache and bundled offline fallback
- Model-specific thinking levels and effort aliases from pi.dev where supported by the installed runtime
- `build-all.sh` / `npm run build:all` to build the extension and local dependencies without regenerating models
- Read-only local working folder with a header shortcut and Settings > Folder, remembered via IndexedDB, explicit permission renewal, and disconnect across windows
- Scoped, paginated folder-listing and file-reading tools for current text/code/documents/images, with path validation, 20 MB size limits, and no automatic file uploads
- Optional working-folder write access with explicit opt-in/opt-out, per-file human confirmation, text/binary/artifact export, exclusive staged writes, and changed-file checks; no deletion or directory creation

### Fixed

- Model picker now filters providers to configured accounts instead of showing every built-in provider
- Setup flow can finish when the settings dialog closes
- Thinking selector now displays and applies the selected level instead of appearing unchanged
- Off sends explicit `none` for supported models; otherwise the dropdown shows Default instead of implying disabled reasoning
- Debugger and native-input automation reject privileged browser/extension contexts, including navigation changes, so agent tools cannot operate Sitegeist's file-save or permission dialogs
- File-save confirmation dialogs now explicitly apply theme-aware text, preview backgrounds, and contrasting warnings in dark mode

## [1.0.0] - 2026-03-15

### Added

- Browser-based OAuth login for Anthropic (Claude Pro/Max), OpenAI Codex (ChatGPT Plus/Pro), GitHub Copilot, and Google Gemini CLI
- Combined "API Keys & OAuth" settings tab with subscription login and API key entry
- Welcome setup dialog on first launch when no providers are configured
- Auto-select default model for the first provider with a key
- Provider and auth type indicator in the header bar
- Image extraction tool (`extract_image`) with selector and screenshot modes
- Subsequence-based fuzzy search in the model selector
- CORS proxy warning in OAuth sections (orange when enabled, red when disabled)
- GitHub Actions workflow for tagged releases
- `release.sh` script for version bumping and tagged releases

### Changed

- Default model changed to `claude-sonnet-4-6` with `medium` thinking level
- CORS proxy enabled by default
- Model selector only shows models from providers with configured keys
- API key prompt dialog now shows both OAuth login and API key entry for supported providers
- Tool execution set to sequential mode (parallel caused rendering issues in sidebar)
- Site converted to static (removed backend, admin, waitlist signups)
- Download links point to GitHub Releases
- License changed from MIT to AGPL-3.0

### Fixed

- Settings dialog tabs not responding to clicks (upstream `pi-web-ui` built with `tsgo` broke Lit decorator reactivity)
- CORS proxy toggle not updating (same root cause)
- Proxy not applied to API requests (esbuild bundled duplicate `streamSimple` references, breaking identity check)
- Model selector button not updating after picking a model (added `state_change` event to Agent)
- Duplicate tool component rendering during streaming (cleared streaming container on `message_end`)
- Screenshot tool capturing sidepanel instead of the webpage
