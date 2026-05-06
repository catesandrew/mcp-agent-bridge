#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOTFILES_DIR="${DOTFILES_DIR:-${HOME}/.dotfiles}"
DOTFILES_BIN="${DOTFILES_DIR}/home/.bin"
DOTFILES_LAUNCH_AGENTS="${DOTFILES_DIR}/home/Library/LaunchAgents"

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Installs mcp-agent-bridge into your dotfiles structure.

Options:
  --load      Load the LaunchAgents immediately after install
  --unload    Unload the LaunchAgents
  --help      Show this help message

What it does:
  1. Symlinks launchd/osx.mcp.*.plist → ~/.dotfiles/home/Library/LaunchAgents/
  2. Symlinks launchd/launch-agent-*-mcp-http → ~/.dotfiles/home/.bin/
  3. Runs 'dfm install' to activate symlinks
  4. Optionally loads the LaunchAgents via launchctl
EOF
  exit 0
}

log() { printf '  %s\n' "$*"; }
ok()  { printf '  ✓ %s\n' "$*"; }
err() { printf '  ✗ %s\n' "$*" >&2; }

LOAD_AGENTS=false
UNLOAD_AGENTS=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --load)   LOAD_AGENTS=true; shift ;;
    --unload) UNLOAD_AGENTS=true; shift ;;
    --help)   usage ;;
    *)        err "Unknown option: $1"; usage ;;
  esac
done

if [[ "${UNLOAD_AGENTS}" == "true" ]]; then
  log "Unloading LaunchAgents..."
  for label in osx.mcp.claude osx.mcp.codex osx.mcp.copilot; do
    if launchctl list "${label}" >/dev/null 2>&1; then
      launchctl unload "${HOME}/Library/LaunchAgents/${label}.plist" 2>/dev/null || true
      ok "Unloaded ${label}"
    else
      log "Not loaded: ${label}"
    fi
  done
  exit 0
fi

# Build the project first
log "Building TypeScript..."
if ! npm run build --prefix "${SCRIPT_DIR}" >/dev/null 2>&1; then
  err "Build failed. Run 'npm run build' to see errors."
  exit 1
fi
ok "Build successful"

# Ensure dotfiles directories exist
mkdir -p "${DOTFILES_BIN}"
mkdir -p "${DOTFILES_LAUNCH_AGENTS}"

# Symlink plist files
log "Symlinking LaunchAgent plists..."
for plist in "${SCRIPT_DIR}"/launchd/osx.mcp.*.plist; do
  name="$(basename "${plist}")"
  target="${DOTFILES_LAUNCH_AGENTS}/${name}"
  ln -sf "${plist}" "${target}"
  ok "${name} → ${target}"
done

# Symlink launcher scripts
log "Symlinking launcher scripts..."
for script in "${SCRIPT_DIR}"/launchd/launch-agent-*-mcp-http; do
  name="$(basename "${script}")"
  target="${DOTFILES_BIN}/${name}"
  ln -sf "${script}" "${target}"
  chmod +x "${script}"
  ok "${name} → ${target}"
done

# Run dfm install if available
if command -v dfm >/dev/null 2>&1; then
  log "Running dfm install..."
  dfm install
  ok "dfm install complete"
else
  log "dfm not found — skipping. Symlinks are in place but not activated."
fi

# Optionally load the LaunchAgents
if [[ "${LOAD_AGENTS}" == "true" ]]; then
  log "Loading LaunchAgents..."
  for plist in "${HOME}/Library/LaunchAgents"/osx.mcp.*.plist; do
    if [[ -f "${plist}" ]]; then
      label="$(basename "${plist}" .plist)"
      launchctl unload "${plist}" 2>/dev/null || true
      launchctl load "${plist}"
      ok "Loaded ${label}"
    fi
  done
fi

printf '\nInstall complete.\n'
printf 'Ports: Claude=8940  Codex=8941  Copilot=8942\n'
printf 'Use --load to start the agents, or load individually with:\n'
printf '  launchctl load ~/Library/LaunchAgents/osx.mcp.claude.plist\n'
