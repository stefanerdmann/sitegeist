#!/usr/bin/env bash
# Build the extension and all of its local dependencies, without regenerating model data.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MINI_LIT="$ROOT/../mini-lit"
PI_MONO="$ROOT/../pi-mono"

usage() {
    printf 'Usage: %s [--install] [--with-site] [--dry-run]\n' "$0"
    printf '  --install    Reinstall dependencies for the current OS before building\n'
    printf '  --with-site  Also build the marketing website (does not deploy)\n'
    printf '  --dry-run    Show build steps without running them\n'
}

install_deps=false
with_site=false
dry_run=false
for arg in "$@"; do
    case "$arg" in
        --install) install_deps=true ;;
        --with-site) with_site=true ;;
        --dry-run) dry_run=true ;;
        --help|-h) usage; exit 0 ;;
        *) printf 'Unknown option: %s\n' "$arg" >&2; usage >&2; exit 2 ;;
    esac
done

for repo in "$MINI_LIT" "$PI_MONO" "$ROOT"; do
    if [[ ! -f "$repo/package.json" ]]; then
        printf 'Missing dependency at %s (expected package.json)\n' "$repo" >&2
        exit 1
    fi
done
if $with_site && [[ ! -f "$ROOT/site/package.json" ]]; then
    printf 'Missing website at %s/site\n' "$ROOT" >&2
    exit 1
fi

step() {
    local description="$1" directory="$2"
    shift 2
    printf '\n%s\n' "$description"
    if $dry_run; then
        printf '  (cd %q && ' "$directory"
        printf '%q ' "$@"
        printf ')\n'
        return
    fi
    if ! (cd "$directory" && "$@"); then
        printf '\nBuild failed: %s\n' "$description" >&2
        exit 1
    fi
}

if $install_deps; then
    # mini-lit has a lockfile that is not compatible with npm ci on every platform.
    step 'Install mini-lit dependencies' "$MINI_LIT" npm install --no-package-lock --include=optional
    step 'Install pi-mono dependencies' "$PI_MONO" npm ci --include=optional
    step 'Install sitegeist dependencies' "$ROOT" npm ci --include=optional
    if $with_site; then
        step 'Install website dependencies' "$ROOT/site" npm ci --include=optional
    fi
fi

if ! $dry_run; then
    for binary in "$MINI_LIT/node_modules/.bin/tsc" "$PI_MONO/node_modules/.bin/tsgo" \
                  "$PI_MONO/node_modules/.bin/tsc" "$PI_MONO/node_modules/.bin/tailwindcss"; do
        if [[ ! -x "$binary" ]]; then
            printf 'Missing build tool: %s\nRun %s --install to install dependencies.\n' "$binary" "$0" >&2
            exit 1
        fi
    done
    # These tools ship platform-specific executables. Fail early with a useful hint if
    # node_modules were copied from another OS instead of silently rebuilding only some packages.
    if ! "$PI_MONO/node_modules/.bin/tsgo" --version >/dev/null 2>&1 || \
       ! (cd "$ROOT" && node -e 'require("esbuild").transformSync("1 + 1")' >/dev/null 2>&1); then
        printf 'Native build tools do not match this machine. Run %s --install and retry.\n' "$0" >&2
        exit 1
    fi
fi

step 'Build mini-lit' "$MINI_LIT" ./node_modules/.bin/tsc -p tsconfig.json
step 'Build pi-mono: tui' "$PI_MONO" ./node_modules/.bin/tsgo -p packages/tui/tsconfig.build.json
step 'Build pi-mono: ai (without regenerating models)' "$PI_MONO" ./node_modules/.bin/tsgo -p packages/ai/tsconfig.build.json
step 'Build pi-mono: agent' "$PI_MONO" ./node_modules/.bin/tsgo -p packages/agent/tsconfig.build.json
step 'Build pi-mono: web-ui TypeScript' "$PI_MONO" ./node_modules/.bin/tsc -p packages/web-ui/tsconfig.build.json
step 'Build pi-mono: web-ui CSS' "$PI_MONO/packages/web-ui" ../../node_modules/.bin/tailwindcss -i ./src/app.css -o ./dist/app.css --minify
step 'Build sitegeist Chrome extension' "$ROOT" npm run build:chrome
if $with_site; then
    step 'Build website' "$ROOT/site" npm run build
fi

printf '\nBuild complete. Load/reload %s/dist-chrome in chrome://extensions/.\n' "$ROOT"
