# Windows MSI installer

This directory contains the WiX v5 sources for the Windows MSI installer
that registers the three mcp-agent-bridge MCP servers (Claude, Codex,
Copilot) as Windows Services, wrapped with NSSM. See
`.omc/plans/2026-07-16-windows-msi-installer.md` for the full design and
task breakdown.

## Layout

- `Product.wxs` — the full WiX v5 package definition: 3 NSSM-wrapped
  Windows Services (Claude/Codex/Copilot), PATH, port properties, upgrade
  handling, and a non-blocking prerequisite check.
- `build.ps1` — orchestrates binary staging (`scripts/stage-binaries.ps1`)
  and the `wix build` invocation with all required preprocessor variables.
- `scripts/` — `stage-binaries.ps1` (checksum-verifies + renames the 3
  release binaries), `register-service.ps1` (the actual NSSM registration
  logic, invoked once per service via a WiX deferred CustomAction),
  `check-prereqs.ps1` (the non-blocking Node/CLI prerequisite check).
- `vendor/` — checked-in build inputs (NSSM, a vendored `mcp-proxy@6.4.4`
  with its own runtime dependencies installed) so the MSI never needs to
  fetch anything over the network at build or install time.
- `bin/`, `dist/` — build outputs (git-ignored, not checked in).

## Building locally

Install the WiX v5 dotnet tool. **Pin to exactly `5.0.2`** — do NOT install
the latest version. Newer WiX CLI releases (v7+) require accepting a paid
"Open Source Maintenance Fee" EULA before they'll run at all (confirmed via
direct testing in this session):

```
dotnet tool install --global wix --version 5.0.2
wix extension add --global WixToolset.Util.wixext/5.0.2
wix extension add --global WixToolset.UI.wixext/5.0.2
```

**Use `--global` (`-g`)** — a non-global `wix extension add` caches the extension under a
`.wix\extensions\` folder rooted at whatever directory you ran it from, not a directory-independent
cache, and WiX does not search parent directories the way git/npm/dotnet-tool manifests do.
`build.ps1` runs `wix build` from inside `installer/windows/`, so adding the extension without
`--global` from the repo root (or anywhere else) leaves that build unable to find it at all —
confirmed by a real CI failure (`error WIX0144: The extension 'WixToolset.Util.wixext' could not
be found`) before this note was added.

Then run the build script, pointing it at a directory containing the 3
raw release binaries + `checksums-windows-x64.txt` (e.g. downloaded from a
`release-windows.yml` run):

```
./installer/windows/build.ps1 -ArtifactsDir <path-to-release-assets>
```

This stages/renames the binaries and invokes `wix build` with all required
preprocessor variables, producing
`installer/windows/dist/mcp-agent-bridge-windows-x64.msi`.

## A note on build verification

WiX only runs on Windows — even the `wix` CLI tool itself fails with a
path-handling bug when run on macOS/Linux (confirmed by direct testing), so
this cannot be build-verified from a Mac. All WiX authoring in this
directory was written carefully against the WiX v5 schema and NSSM's
documented behavior, but has NOT been build-tested locally. First real
verification must happen on Windows or via the `windows-latest` GitHub
Actions CI runner.
