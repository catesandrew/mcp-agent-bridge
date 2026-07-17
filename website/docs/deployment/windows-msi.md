---
sidebar_position: 1.5
---

# Windows MSI Installer

MCP Agent Bridge ships a double-click **MSI installer** for Windows as an alternative to the
[PowerShell-based install](./windows) (`install.ps1`). It registers the same three NSSM-wrapped
background services -- Claude, Codex, and Copilot -- but through a standard Windows Installer
package instead of a script you run by hand in an elevated shell.

Use the MSI if you want a normal Windows "Next, Next, Finish" install experience, or if you need to
deploy silently across multiple machines with `msiexec /quiet`. Use `install.ps1` (see
[Windows Deployment](./windows)) if you want a scriptable, source-driven install -- for example, as
part of your own provisioning/CI pipeline, or on a machine where MSI installs are restricted but
running a signed-off PowerShell script is not.

The installer source lives in [`installer/windows/`](https://github.com/catesandrew/mcp-agent-bridge/tree/main/installer/windows)
(WiX v5). See that directory's `README.md` if you want to build the MSI yourself.

:::caution Not yet build- or install-tested
This installer has been authored carefully against WiX v5's and NSSM's documented behavior, but
`wix build` does not run on macOS (confirmed by direct testing -- a genuine cross-platform bug, not
just an advisory warning), so it has **not** been build-tested or installed on a real machine as
part of this documentation pass. First real-world verification happens either on an actual Windows
machine or via the `windows-latest` GitHub Actions CI runner. Treat the behavior below as the
documented design, not a field-tested guarantee, until that verification lands.
:::

## Download and verify

`.github/workflows/release-windows.yml` has a `build-msi` job (tag-triggered releases only) that
builds `mcp-agent-bridge-windows-x64.msi` and a matching `checksums-windows-x64-msi.txt` and attaches
both to the GitHub Release, alongside the three raw `.exe` server binaries.

:::caution CI job not yet run for real
This job is authored and YAML-syntax-validated but has not actually been exercised by a real tag push
in this project's authoring environment (no working `gh` auth here to trigger/observe one). Treat it
as the documented, intended release flow until the first real tagged release confirms it end-to-end.
:::

1. Download `mcp-agent-bridge-windows-x64.msi` and `checksums-windows-x64-msi.txt` from the
   [GitHub Releases](https://github.com/catesandrew/mcp-agent-bridge/releases) page.
2. Verify the checksum in PowerShell before running anything downloaded from the internet:

   ```powershell
   $expected = (Get-Content .\checksums-windows-x64-msi.txt).Split(" ")[0]
   $actual = (Get-FileHash .\mcp-agent-bridge-windows-x64.msi -Algorithm SHA256).Hash.ToLower()
   if ($actual -ne $expected) { throw "Checksum mismatch -- do not run this installer." }
   ```

To build the MSI yourself instead (requires the WiX v5 dotnet tool, pinned to `5.0.2` -- see
`installer/windows/README.md`):

```powershell
dotnet tool install --global wix --version 5.0.2
wix extension add WixToolset.Util.wixext/5.0.2
.\installer\windows\build.ps1 -ArtifactsDir <directory containing the 3 raw release .exe files + checksums-windows-x64.txt>
```

`build.ps1` handles staging/renaming the binaries and the full `wix build` invocation (all
preprocessor variables, the `-ext WixToolset.Util.wixext` flag) for you -- see the script's own
comment-based help for parameter details if you need to override the version or output location.

## The SmartScreen warning

The MSI is **unsigned** in this release (no code-signing certificate yet -- a documented, accepted
tradeoff for v1). Windows will show:

> **Windows protected your PC**
> Microsoft Defender SmartScreen prevented an unrecognized app from starting. Running this app might
> put your PC at risk.

To proceed anyway (after you've verified the checksum above):

1. Click **More info** on the SmartScreen dialog.
2. Click **Run anyway**.

This is expected for any unsigned installer and isn't specific to a broken build -- it goes away once
a real Authenticode signing certificate is added in a future release.

## Feature selection

During an interactive install, the wizard offers three independent, individually selectable features,
**all checked by default**:

| Feature | Windows service name | Default port | Port property |
|---|---|---|---|
| Claude MCP Server | `McpBridgeClaude` | 8940 | `CLAUDEPORT` |
| Codex MCP Server | `McpBridgeCodex` | 8941 | `CODEXPORT` |
| Copilot MCP Server | `McpBridgeCopilot` | 8945 | `COPILOTPORT` |

Deselecting a feature skips registering that service entirely -- it's not installed in a disabled
state, it's just not there. Shared files (vendored NSSM, vendored `mcp-proxy`, the PATH entry) install
regardless of which of the three you pick.

The install requires UAC elevation: services are registered under `LocalSystem` and files land in
`%ProgramFiles%\mcp-agent-bridge\`, both machine-wide (`perMachine`) rather than per-user.

## Silent / unattended install

```powershell
msiexec /i mcp-agent-bridge-windows-x64.msi /quiet CLAUDEPORT=9940
```

Any of `CLAUDEPORT`, `CODEXPORT`, `COPILOTPORT` can be overridden this way. Each must be a number
between 1024 and 65535, and no two of the three may resolve to the same value -- the installer
rejects the install (with a clear message) otherwise, whether interactive or silent.

To install only a subset of features silently, add the standard MSI `ADDLOCAL`/`REMOVE` properties,
e.g. `REMOVE=CopilotService` to skip the Copilot service.

## Uninstall

Either:

- **Control Panel → Apps & features** (or **Settings → Apps**) → find "mcp-agent-bridge" → **Uninstall**, or
- From an elevated prompt, using the original installer file:

  ```powershell
  msiexec /x mcp-agent-bridge-windows-x64.msi /quiet
  ```

Uninstall stops and removes all three Windows services (`ServiceControl Remove="uninstall"` in the
WiX package handles this natively, even though NSSM -- not WiX -- originally registered them), removes
the install directory, and removes the PATH entry. No `Component` in the package owns
`%ProgramData%\mcp-agent-bridge\logs\`, so an uninstall never deletes those log files (see
[Logs](#logs) below).

## Post-install customization

The MSI's configurable surface is deliberately limited to **ports and feature selection** -- it does
not expose the other tunables `examples\windows\env-setup.ps1` sets today (`CLAUDE_REVIEW_CWD`,
`CLAUDE_ALLOWED_CWD_ROOTS`, `CODEX_REVIEW_AGENT_PATH`, timeouts, etc.). This is intentional, to avoid
installer-dialog creep, not an oversight.

To set any of those after install, use the vendored `nssm.exe` directly against the target service:

```powershell
& "$env:ProgramFiles\mcp-agent-bridge\vendor\nssm\nssm.exe" set McpBridgeClaude AppEnvironmentExtra `
  CLAUDE_MCP_HTTP_PORT=8940 CLAUDE_REVIEW_CWD=C:\repos\my-project

nssm restart McpBridgeClaude
```

`AppEnvironmentExtra` is a multi-value NSSM parameter -- **each `nssm set` call replaces the entire
list**, it does not append. If you only pass `CLAUDE_REVIEW_CWD=...`, you'll wipe out the
`CLAUDE_MCP_HTTP_PORT` entry the installer set for you. Always pass every `KEY=VALUE` pair you want
in one call (check the current list first with `nssm get McpBridgeClaude AppEnvironmentExtra`), and
restart the service afterward for the change to take effect.

The same applies to `McpBridgeCodex` and `McpBridgeCopilot`.

## Logs

Each service writes its stdout/stderr to `%ProgramData%\mcp-agent-bridge\logs\<ServiceName>.out.log`
and `.err.log` (e.g. `McpBridgeClaude.out.log`) -- machine-wide, consistent with the services running
as `LocalSystem`. This is set up automatically by `register-service.ps1` via NSSM's `AppStdout`/
`AppStderr` parameters at install time, with size-based rotation (`AppRotateFiles`, 10MB) so logs
don't grow unbounded across restarts.

:::note Different location than install.ps1
`install.ps1`'s services (see [Windows Deployment](./windows)) write to
`%LOCALAPPDATA%\mcp-agent-bridge\logs\` -- a per-user location, which made sense there since those
services aren't necessarily `LocalSystem`-scoped the same way. The MSI's `%ProgramData%` location is
the correct one for a `LocalSystem`/`perMachine` install: a per-user path wouldn't be meaningfully
associated with any particular user for a machine-wide service.
:::

To inspect a service's log directly:

```powershell
Get-Content "$env:ProgramData\mcp-agent-bridge\logs\McpBridgeClaude.out.log" -Tail 50 -Wait
```

Uninstall never deletes this directory (no WiX `Component` in the package owns it), so logs survive
an uninstall/reinstall for diagnostics -- clean it up manually if you want it gone.

## Troubleshooting

### Port already in use

The prerequisite check (see below) does not currently probe port availability. If a service fails to
start or doesn't respond on its expected port, check what else is bound to it:

```powershell
Get-NetTCPConnection -LocalPort 8940 -ErrorAction SilentlyContinue
```

The simplest fix is to uninstall and reinstall with a different port property (e.g. `CLAUDEPORT=9940`).
It's technically possible to change a running service's port by editing its NSSM `AppParameters` (which
embeds `--port <N>`) and `AppEnvironmentExtra` values directly, but that's a manual, unsupported path --
prefer reinstalling with the MSI property when you can.

### "Missing CLI" warning during install

During interactive installs (not `/quiet` or `/passive`), the installer runs a prerequisite check for
`node.exe`/`npx` and each **selected** feature's underlying agent CLI (`claude`, `codex`, `copilot`) on
the **machine-wide** PATH -- not your own user PATH, since the services run as `LocalSystem`. This
check is informational only: a missing CLI **never blocks install**. It just means that feature's
service will be running but non-functional until the CLI is installed and available on the machine
PATH.

In this release, the result is written only to the MSI install log (there is no popup dialog yet --
see the note below). To see it, run the installer with logging enabled:

```powershell
msiexec /i mcp-agent-bridge-windows-x64.msi /l*v install.log
```

Then search `install.log` for the line starting with `MCPBRIDGE_MISSING::` -- it lists exactly which
prerequisites were missing (or `NONE` if everything was found).

:::note No warning dialog yet
The plan for this installer originally called for an interactive warning dialog listing missing
prerequisites. That dialog has not been authored in this release -- it would require the separate
`WixToolset.UI.wixext` extension and dialog/control XML that couldn't be rendered or build-tested
from this project's authoring environment. The non-blocking, always-logged check above ships instead;
the dialog is a scoped fast-follow.
:::

### Checking service status

```powershell
Get-Service McpBridge*
```

All three should show `Running` if their features were selected during install. A service that's
`Stopped` shortly after install (rather than crash-looping, which NSSM's `AppExit Default Restart` +
`AppThrottle 5000` will retry) is worth checking against the install log for the deferred
service-registration `CustomAction`'s own output.
