#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Installs mcp-agent-bridge executables and optionally sets up macOS LaunchAgents.

Options:
  --prefix DIR   Install binaries to DIR (default: ~/.local/bin)
  --launchd      Also install macOS LaunchAgent plists and launcher scripts
  --dotfiles DIR Dotfiles root for --launchd mode (default: ~/.dotfiles)
  --load         Load the LaunchAgents immediately (implies --launchd)
  --unload       Unload the LaunchAgents and exit
  --help         Show this help message

Examples:
  $(basename "$0")                     # build + install binaries to ~/.local/bin
  $(basename "$0") --prefix /usr/local/bin
  $(basename "$0") --launchd --load    # full macOS setup with LaunchAgents
EOF
  exit 0
}

log() { printf '  %s\n' "$*"; }
ok()  { printf '  ✓ %s\n' "$*"; }
err() { printf '  ✗ %s\n' "$*" >&2; }

PREFIX="${HOME}/.local/bin"
INSTALL_LAUNCHD=false
LOAD_AGENTS=false
UNLOAD_AGENTS=false
DOTFILES_DIR="${DOTFILES_DIR:-${HOME}/.dotfiles}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --prefix)    PREFIX="$2"; shift 2 ;;
    --launchd)   INSTALL_LAUNCHD=true; shift ;;
    --dotfiles)  DOTFILES_DIR="$2"; shift 2 ;;
    --load)      INSTALL_LAUNCHD=true; LOAD_AGENTS=true; shift ;;
    --unload)    UNLOAD_AGENTS=true; shift ;;
    --help)      usage ;;
    *)           err "Unknown option: $1"; usage ;;
  esac
done

# ── Unload ────────────────────────────────────────────────────────────────────
if [[ "${UNLOAD_AGENTS}" == "true" ]]; then
  log "Unloading LaunchAgents..."
  for label in osx.mcp.claude osx.mcp.codex osx.mcp.copilot osx.mcp.video-mcp-server; do
    if launchctl list "${label}" >/dev/null 2>&1; then
      launchctl unload "${HOME}/Library/LaunchAgents/${label}.plist" 2>/dev/null || true
      ok "Unloaded ${label}"
    else
      log "Not loaded: ${label}"
    fi
  done
  exit 0
fi

# ── Build ─────────────────────────────────────────────────────────────────────
log "Building standalone executables..."
if ! (cd "${SCRIPT_DIR}" && bun install --frozen-lockfile >/dev/null 2>&1 && bun run build:exe >/dev/null 2>&1); then
  err "Build failed. Run 'bun run build:exe' to see errors."
  exit 1
fi
ok "Build successful"

# ── Install binaries ──────────────────────────────────────────────────────────
mkdir -p "${PREFIX}"
log "Installing binaries to ${PREFIX}..."
for binary in "${SCRIPT_DIR}"/exe/*-mcp-server; do
  name="$(basename "${binary}")"
  rm -f "${PREFIX}/${name}"
  cp "${binary}" "${PREFIX}/${name}"
  chmod +x "${PREFIX}/${name}"
  ok "${name}"
done

printf '\nBinaries installed to %s\n' "${PREFIX}"
printf 'Ensure %s is in your PATH.\n\n' "${PREFIX}"

# ── macOS LaunchAgents (optional) ─────────────────────────────────────────────
if [[ "${INSTALL_LAUNCHD}" == "true" ]]; then
  DOTFILES_BIN="${DOTFILES_DIR}/home/.bin"
  DOTFILES_LA="${DOTFILES_DIR}/home/Library/LaunchAgents"

  mkdir -p "${DOTFILES_BIN}" "${DOTFILES_LA}"

  log "Copying LaunchAgent plists..."
  for plist in "${SCRIPT_DIR}"/examples/macos/osx.mcp.*.plist; do
    name="$(basename "${plist}")"
    target="${DOTFILES_LA}/${name}"
    rm -f "${target}"
    cp "${plist}" "${target}"
    ok "${name}"
  done

  log "Copying launcher scripts..."
  for script in "${SCRIPT_DIR}"/examples/macos/launch-agent-*-mcp-http; do
    name="$(basename "${script}")"
    target="${DOTFILES_BIN}/${name}"
    rm -f "${target}"
    cp "${script}" "${target}"
    chmod +x "${target}"
    ok "${name}"
  done

  if command -v dfm >/dev/null 2>&1; then
    log "Running dfm install..."
    dfm install
    ok "dfm install complete"
  fi

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

  printf '\nLaunchAgents installed.\n'
  printf 'Ports: Claude=8940  Codex=8941  Copilot=8945  Video=8965\n'
fi

printf 'Done.\n'
