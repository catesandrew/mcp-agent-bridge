# Windows MSI installer

This directory contains the WiX v5 sources for the Windows MSI installer
that registers the three mcp-agent-bridge MCP servers (Claude, Codex,
Copilot) as Windows Services, wrapped with NSSM. See
`.omc/plans/2026-07-16-windows-msi-installer.md` for the full design and
task breakdown.

## Layout

- `Product.wxs` — the WiX v5 package definition (currently a placeholder
  skeleton; see Tasks 4-8 of the plan for the full authoring work).
- `build.ps1` — orchestrates binary staging and the `wix build` invocation
  (currently a stub; see Tasks 3 and 9).
- `vendor/` — checked-in build inputs (NSSM, a vendored `mcp-proxy@6.4.4`)
  so the MSI never needs to fetch anything over the network at build or
  install time. Populated by Task 2.
- `bin/`, `dist/` — build outputs (git-ignored, not checked in).

## Building locally (once complete)

Install the WiX v5 dotnet tool. **Pin to exactly `5.0.2`** — do NOT install
the latest version. Newer WiX CLI releases (v7+) require accepting a paid
"Open Source Maintenance Fee" EULA before they'll run at all (confirmed via
direct testing in this session):

```
dotnet tool install --global wix --version 5.0.2
```

Then build the MSI:

```
wix build installer/windows/Product.wxs -out installer/windows/dist/mcp-agent-bridge-windows-x64.msi -arch x64
```

Once `build.ps1` is fully implemented (Task 9), the preferred entry point
will be running that script directly, which stages/renames the release
binaries and invokes `wix build` with all required preprocessor variables.

## A note on build verification

WiX only runs on Windows — even the `wix` CLI tool itself fails with a
path-handling bug when run on macOS/Linux (confirmed by direct testing), so
this cannot be build-verified from a Mac. All WiX authoring in this
directory was written carefully against the WiX v5 schema and NSSM's
documented behavior, but has NOT been build-tested locally. First real
verification must happen on Windows or via the `windows-latest` GitHub
Actions CI runner.
