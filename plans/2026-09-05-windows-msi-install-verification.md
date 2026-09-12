# Windows MSI Installer — Real Install/CI Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use beads-superpowers:subagent-driven-development (recommended) or beads-superpowers:executing-plans to implement this plan task-by-task. Each Task becomes a bead (`bd create -t task --parent <epic-id>`). Steps within tasks use checkbox (`- [ ]`) syntax for human readability.

**Goal:** Replace the installer's "authored per documented behavior, not install-tested" status (see `progress.txt` REMAINING UNVERIFIED note and `website/docs/deployment/windows-msi.md`'s `:::caution` callouts) with real, evidence-backed verification of build, install, service behavior, port-conflict rejection, uninstall, and upgrade — automated in CI wherever possible so it doesn't depend on anyone owning a physical Windows machine.

**Architecture:** Extend `.github/workflows/release-windows.yml` with a `test-install` job that runs on `windows-latest`, consumes the MSI artifact `build-msi` produces, and drives real `msiexec` install/uninstall/upgrade cycles plus `Get-Service`/`Get-NetTCPConnection` assertions. Manual, human-in-the-loop steps are limited to what CI genuinely cannot do and are tracked as separate tasks.

**Round-1 architect review (2026-09-05) found the initial draft had two hard blockers and a wrong service count; this revision incorporates all 8 findings — see each task's "Architect finding addressed" note.**

## Global Constraints

- Never touch code-signing scope in this plan — the MSI stays unsigned; that is a documented, accepted v1 tradeoff (`website/docs/deployment/windows-msi.md`), not something to fix here.
- CI verification must not require secrets or network fetches beyond what `release-windows.yml` already uses (vendored `mcp-proxy`/`nssm` stay vendored — no new external dependency).
- Every port/service assertion must check the **actual** installed artifact (the real `.msi` produced by `build-msi`), never a hand-rolled substitute.
- All 4 services must be accounted for everywhere a service list appears: `McpBridgeClaude` (8940), `McpBridgeCodex` (8941), `McpBridgeCopilot` (8945), `McpBridgeVideo` (8965, `-NativeHttp`, no mcp-proxy wrapping — see `Product.wxs:297-308`).

---

### Task 1: Make the MSI artifact unconditionally available to `test-install`

**Architect finding addressed:** #1 — `release-windows.yml:144-151` currently uploads the `mcp-agent-bridge-windows-x64-msi` artifact only `if: ${{ !startsWith(github.ref, 'refs/tags/') }}`; on a real tag-push release the MSI goes straight to the GitHub Release and no workflow artifact exists, so any job that does `download-artifact` on that name hard-fails on every real release run.

**Files:**
- Modify: `.github/workflows/release-windows.yml`

**Acceptance Criteria:**
- The `mcp-agent-bridge-windows-x64-msi` workflow artifact is uploaded unconditionally (both tag-push and `workflow_dispatch` runs), in addition to (not instead of) the existing tag-push Release upload.
- A tag-push dry run (or a `workflow_dispatch` run) shows the artifact present under Actions → this run → Artifacts.

- [ ] **Step 1: Remove the `if:` condition gating the workflow-artifact upload, keep the Release-upload step's own tag-only condition untouched**

```yaml
      - name: Upload MSI as workflow artifact
        uses: actions/upload-artifact@v4
        with:
          name: mcp-agent-bridge-windows-x64-msi
          path: installer/windows/dist/mcp-agent-bridge-windows-x64.msi
          if-no-files-found: error
        # no `if:` here -- always upload, tag push or not
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release-windows.yml
git commit -m "ci: always upload MSI workflow artifact, not just on non-tag runs"
```

---

### Task 2: Pre-flight port check + conflicting-port negative test (clean machine, before any install)

**Architect finding addressed:** #4 — a second `/i` against an already-installed ProductCode enters MSI maintenance mode, where a non-zero exit can mean 1618 (another install in progress) or 1638 (already installed) rather than the intended port-validation rejection — a false-positive pass. Running this test first, against a clean runner, means any non-zero exit is unambiguously the port-validation `LaunchCondition`. **Also addresses #8** (no pre-flight port check existed).

**Files:**
- Modify: `.github/workflows/release-windows.yml` (new job `test-install`, first two steps)

**Interfaces:**
- Consumes: the `mcp-agent-bridge-windows-x64-msi` artifact from Task 1.
- Produces: the `test-install` job skeleton that Tasks 3-7 append steps to (all in this one job, in the order given by their task numbers).

**Acceptance Criteria:**
- New job `test-install` runs on `windows-latest`, `needs: build-msi`, downloads the MSI artifact.
- A step asserts ports 8940, 8941, 8945, 8965 are NOT already in `Listen` state on the fresh runner (fails fast with a clear message if one is, rather than producing a confusing later failure).
- A step runs `msiexec /i <msi> /quiet CLAUDEPORT=8941 CODEXPORT=8941 /l*v "$env:GITHUB_WORKSPACE\conflict.log"` **before any other install in this job** and asserts:
  - exit code is non-zero, AND
  - `conflict.log` contains the actual `LaunchCondition` message text `"CLAUDEPORT and CODEXPORT must not be the same port"` (`Product.wxs:114-115`) — a non-zero exit alone is not sufficient evidence.
- `conflict.log` is uploaded via `actions/upload-artifact@v4` with `if-no-files-found: warn` and `if: always()`.

- [ ] **Step 1: Job skeleton + pre-flight port check**

```yaml
  test-install:
    needs: build-msi
    runs-on: windows-latest
    steps:
      - name: Download MSI artifact
        uses: actions/download-artifact@v4
        with:
          name: mcp-agent-bridge-windows-x64-msi
          path: msi

      - name: Pre-flight -- assert target ports are free
        shell: pwsh
        run: |
          foreach ($port in 8940, 8941, 8945, 8965) {
            $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
            if ($conn) { throw "Port $port is already listening on this runner before install -- cannot proceed" }
          }
          Write-Host "All target ports free"
```

- [ ] **Step 2: Conflicting-port negative test, on the clean machine**

```yaml
      - name: Verify conflicting ports are rejected (clean-machine install attempt)
        shell: pwsh
        run: |
          $msi = (Get-ChildItem msi\*.msi | Select-Object -First 1).FullName
          $log = "$env:GITHUB_WORKSPACE\conflict.log"
          $proc = Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /quiet CLAUDEPORT=8941 CODEXPORT=8941 /l*v `"$log`"" -Wait -PassThru
          if ($proc.ExitCode -eq 0) { throw "Installer accepted duplicate CLAUDEPORT/CODEXPORT values -- port-conflict validation regression" }
          $content = Get-Content $log -Raw -ErrorAction SilentlyContinue
          if (-not $content -or $content -notmatch [regex]::Escape("CLAUDEPORT and CODEXPORT must not be the same port")) {
            throw "Install was rejected (exit $($proc.ExitCode)) but not for the expected port-conflict reason -- check $log"
          }
          Write-Host "Conflicting-port install correctly rejected with the expected LaunchCondition message"

      - name: Upload conflict log
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: windows-conflict-log
          path: conflict.log
          if-no-files-found: warn
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release-windows.yml
git commit -m "ci: add pre-flight port check and clean-machine port-conflict negative test"
```

---

### Task 3: Install the MSI and verify all 4 services are running AND actually listening

**Architect finding addressed:** #2 (four services, not three — `McpBridgeVideo`/8965 was missing) and #5 (`Get-Service ... Running` is a weak assertion; NSSM reports `Running` even while the wrapped process crash-loops, and this CI runner has no `claude`/`codex`/`copilot` CLI on PATH — add a real `Get-NetTCPConnection ... -State Listen` probe, not just service status).

**Files:**
- Modify: `.github/workflows/release-windows.yml` (`test-install` job, after Task 2's steps)

**Acceptance Criteria:**
- Runs `msiexec /i <msi> /quiet /l*v "$env:GITHUB_WORKSPACE\install.log"` and asserts exit code 0.
- Asserts `Get-Service` reports `McpBridgeClaude`, `McpBridgeCodex`, `McpBridgeCopilot`, `McpBridgeVideo` (all four) as `Running`, within a bounded retry loop.
- Additionally asserts, after a short settle delay, that ports 8940, 8941, 8945, 8965 are each in `Listen` state via `Get-NetTCPConnection` — a service reported `Running` by NSSM with its port NOT listening fails the job (this is the check that would have caught a crash-looping process that `Get-Service` alone would miss, since NSSM's `AppExit Default Restart` keeps re-marking it `Running` between crashes).
- `install.log` is uploaded (`if: always()`, `if-no-files-found: warn`).

- [ ] **Step 1: Install**

```yaml
      - name: Install MSI
        shell: pwsh
        run: |
          $msi = (Get-ChildItem msi\*.msi | Select-Object -First 1).FullName
          $log = "$env:GITHUB_WORKSPACE\install.log"
          $proc = Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /quiet /l*v `"$log`"" -Wait -PassThru
          if ($proc.ExitCode -ne 0) { throw "msiexec install failed with exit code $($proc.ExitCode)" }
```

- [ ] **Step 2: Verify all 4 services reach Running**

```yaml
      - name: Verify services are running
        shell: pwsh
        run: |
          $names = "McpBridgeClaude", "McpBridgeCodex", "McpBridgeCopilot", "McpBridgeVideo"
          foreach ($name in $names) {
            $running = $false
            for ($i = 0; $i -lt 12; $i++) {
              $svc = Get-Service -Name $name -ErrorAction SilentlyContinue
              if ($svc -and $svc.Status -eq "Running") { $running = $true; break }
              Start-Sleep -Seconds 5
            }
            if (-not $running) { throw "Service $name did not reach Running state" }
            Write-Host "$name is Running"
          }
```

- [ ] **Step 3: Verify ports are actually listening (not just NSSM-reported Running)**

```yaml
      - name: Verify ports are actually listening
        shell: pwsh
        run: |
          Start-Sleep -Seconds 10
          foreach ($port in 8940, 8941, 8945, 8965) {
            $listening = $false
            for ($i = 0; $i -lt 6; $i++) {
              if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { $listening = $true; break }
              Start-Sleep -Seconds 5
            }
            if (-not $listening) { throw "Port $port is not listening -- service is Running per NSSM but the wrapped process is not actually up (likely crash-looping)" }
          }
          Write-Host "All 4 ports confirmed listening"
```

- [ ] **Step 4: Upload install log**

```yaml
      - name: Upload install log
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: windows-install-log
          path: install.log
          if-no-files-found: warn
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/release-windows.yml
git commit -m "ci: install MSI and verify all 4 services running and listening"
```

---

### Task 4: Verify NSSM AppParameters/short-path handling resolves correctly (no `ERR_UNKNOWN_FILE_EXTENSION`)

**Files:**
- Modify: `.github/workflows/release-windows.yml` (append to `test-install`, after Task 3)

**Acceptance Criteria:**
- Each service's `AppStdout`/`AppStderr` log (`%ProgramData%\mcp-agent-bridge\logs\<ServiceName>.out.log`/`.err.log`) is read.
- The job fails if any `.err.log` contains `ERR_UNKNOWN_FILE_EXTENSION` or `Cannot find module` — the exact bug class documented in `installer/windows/scripts/register-service.ps1`'s `Get-ShortPath` comment.

- [ ] **Step 1: Add the log-content assertion**

```yaml
      - name: Verify service logs have no path-mangling errors
        shell: pwsh
        run: |
          $logDir = "$env:ProgramData\mcp-agent-bridge\logs"
          $badPatterns = "ERR_UNKNOWN_FILE_EXTENSION", "Cannot find module"
          Get-ChildItem "$logDir\*.err.log" -ErrorAction SilentlyContinue | ForEach-Object {
            $content = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue
            foreach ($pattern in $badPatterns) {
              if ($content -and $content -match [regex]::Escape($pattern)) {
                throw "$($_.Name) contains '$pattern' -- NSSM path mangling regression"
              }
            }
          }
          Write-Host "No path-mangling errors found in service logs"
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release-windows.yml
git commit -m "ci: assert no NSSM path-mangling errors in installed service logs"
```

---

### Task 5: Verify PATH entry and prerequisite-check log line

**Files:**
- Modify: `.github/workflows/release-windows.yml` (append to `test-install`, after Task 4)

**Acceptance Criteria:**
- Job asserts `%ProgramFiles%\mcp-agent-bridge` was appended to the machine `PATH` environment variable.
- Job asserts `install.log` contains a line starting with `MCPBRIDGE_MISSING::` (the `check-prereqs.ps1` log line — this only confirms the deferred CustomAction ran and wrote to the log, per `check-prereqs.ps1:169-180`; it is **not** an MSI property, see Task 8).

- [ ] **Step 1: Add the assertions**

```yaml
      - name: Verify PATH entry and prerequisite check ran
        shell: pwsh
        run: |
          $machinePath = [Environment]::GetEnvironmentVariable("PATH", "Machine")
          if ($machinePath -notlike "*mcp-agent-bridge*") {
            throw "Machine PATH does not contain mcp-agent-bridge install directory"
          }
          $prereqLine = Select-String -Path "$env:GITHUB_WORKSPACE\install.log" -Pattern "MCPBRIDGE_MISSING::" -ErrorAction SilentlyContinue
          if (-not $prereqLine) {
            throw "install.log has no MCPBRIDGE_MISSING:: line -- prerequisite check did not run"
          }
          Write-Host "PATH entry present; prerequisite check line: $prereqLine"
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release-windows.yml
git commit -m "ci: assert PATH entry and prerequisite-check log line after install"
```

---

### Task 6: Real major-upgrade test (bumped-version MSI installed over the existing install)

**Architect finding addressed:** #6 — `REINSTALL=ALL REINSTALLMODE=vomus` exercises MSI *repair*, never a real `MajorUpgrade`/`RemoveExistingProducts` sequence (`Product.wxs:43-45`), which is where the actual service-duplication/removal risk lives. A repair test would pass even if the real upgrade path is broken.

**Files:**
- Modify: `.github/workflows/release-windows.yml` (the `build-msi` job, to produce a second, version-bumped MSI; and `test-install`, to consume it)
- Reference: `installer/windows/build.ps1`'s version parameter (confirm its exact flag name before wiring the second build step — read `build.ps1`'s param block, do not assume `-Version` without checking)

**Acceptance Criteria:**
- `build-msi` produces a second MSI built with a higher `ProductVersion` than the first (e.g. current version + `.1`), uploaded as a distinct workflow artifact (e.g. `mcp-agent-bridge-windows-x64-msi-upgrade`).
- `test-install` installs the bumped-version MSI over the already-running first install using a plain `/i` (letting WiX's `MajorUpgrade`/`RemoveExistingProducts` element drive the real upgrade sequence — not `REINSTALL=ALL`).
- After the upgrade install, exactly 4 `McpBridge*` services exist (no duplicates, no leftovers from the old ProductCode) and all 4 are `Running` and listening (reuse Task 3 Step 3's port-listen check).

- [ ] **Step 1: Confirm `build.ps1`'s version-override parameter name**

Read `installer/windows/build.ps1`'s `param()` block and note the exact flag before writing Step 2 — do not guess.

- [ ] **Step 2: Build a second, version-bumped MSI in `build-msi`**

```yaml
      - name: Build upgrade-test MSI (version-bumped)
        shell: pwsh
        run: |
          ./installer/windows/build.ps1 -ArtifactsDir <existing-artifacts-dir> -Version "<current-version>.1"
          # exact param name confirmed in Step 1 -- adjust if build.ps1 uses a different flag

      - name: Upload upgrade-test MSI
        uses: actions/upload-artifact@v4
        with:
          name: mcp-agent-bridge-windows-x64-msi-upgrade
          path: installer/windows/dist/mcp-agent-bridge-windows-x64.msi
          if-no-files-found: error
```

- [ ] **Step 3: Install the bumped MSI over the running install, in `test-install`**

```yaml
      - name: Download upgrade-test MSI
        uses: actions/download-artifact@v4
        with:
          name: mcp-agent-bridge-windows-x64-msi-upgrade
          path: msi-upgrade

      - name: Install version-bumped MSI (real major-upgrade path)
        shell: pwsh
        run: |
          $msi = (Get-ChildItem msi-upgrade\*.msi | Select-Object -First 1).FullName
          $log = "$env:GITHUB_WORKSPACE\upgrade.log"
          $proc = Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /quiet /l*v `"$log`"" -Wait -PassThru
          if ($proc.ExitCode -ne 0) { throw "msiexec major-upgrade install failed with exit code $($proc.ExitCode)" }

      - name: Verify exactly 4 services exist and are running+listening after upgrade
        shell: pwsh
        run: |
          $services = @(Get-Service -Name "McpBridge*")
          if ($services.Count -ne 4) { throw "Expected exactly 4 McpBridge* services after upgrade, found $($services.Count)" }
          foreach ($svc in $services) {
            if ($svc.Status -ne "Running") { throw "$($svc.Name) is not Running after upgrade (status: $($svc.Status))" }
          }
          Start-Sleep -Seconds 10
          foreach ($port in 8940, 8941, 8945, 8965) {
            if (-not (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)) {
              throw "Port $port not listening after upgrade"
            }
          }
          Write-Host "Upgrade verified: exactly 4 services, all Running and listening"

      - name: Upload upgrade log
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: windows-upgrade-log
          path: upgrade.log
          if-no-files-found: warn
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release-windows.yml
git commit -m "ci: add real major-upgrade test using a version-bumped MSI"
```

---

### Task 7: Verify uninstall removes services/PATH but preserves logs (runs last)

**Architect finding addressed:** #7 — use absolute log paths under `$env:GITHUB_WORKSPACE` and `if-no-files-found: warn` on the upload step (a relative path resolves against msiexec's own cwd, not the workflow's, and an unconditional-but-missing-file upload otherwise hard-fails the job).

**Files:**
- Modify: `.github/workflows/release-windows.yml` (final steps in `test-install`, after Task 6)

**Acceptance Criteria:**
- `msiexec /x <upgraded-msi> /quiet` exits 0.
- All 4 `McpBridge*` services no longer exist after uninstall.
- Machine `PATH` no longer contains the install directory.
- `%ProgramData%\mcp-agent-bridge\logs\` still exists with its log files intact.

- [ ] **Step 1: Uninstall (use the upgrade-test MSI, since it's the one currently installed after Task 6)**

```yaml
      - name: Uninstall MSI
        shell: pwsh
        run: |
          $msi = (Get-ChildItem msi-upgrade\*.msi | Select-Object -First 1).FullName
          $log = "$env:GITHUB_WORKSPACE\uninstall.log"
          $proc = Start-Process msiexec.exe -ArgumentList "/x `"$msi`" /quiet /l*v `"$log`"" -Wait -PassThru
          if ($proc.ExitCode -ne 0) { throw "msiexec uninstall failed with exit code $($proc.ExitCode)" }

      - name: Verify services and PATH entry removed, logs preserved
        shell: pwsh
        run: |
          foreach ($name in "McpBridgeClaude", "McpBridgeCodex", "McpBridgeCopilot", "McpBridgeVideo") {
            if (Get-Service -Name $name -ErrorAction SilentlyContinue) {
              throw "Service $name still exists after uninstall"
            }
          }
          $machinePath = [Environment]::GetEnvironmentVariable("PATH", "Machine")
          if ($machinePath -like "*mcp-agent-bridge*") { throw "PATH still contains mcp-agent-bridge after uninstall" }
          if (-not (Test-Path "$env:ProgramData\mcp-agent-bridge\logs")) { throw "Logs directory was deleted by uninstall -- should be preserved" }
          Write-Host "Uninstall verified: services gone, PATH clean, logs preserved"

      - name: Upload uninstall log
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: windows-uninstall-log
          path: uninstall.log
          if-no-files-found: warn
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release-windows.yml
git commit -m "ci: verify uninstall removes services/PATH and preserves logs"
```

---

### Task 8 (fast-follow, independent of Tasks 1-7): Add a real missing-prerequisites property + interactive warning dialog

**Architect finding addressed:** #3 — the original plan's premise was false. `Product.wxs` has **no** `MCPBRIDGE_MISSING` property; `check-prereqs.ps1:169-180` only `Write-Host`s that line to the log. Worse, the `CheckPrereqs` CustomAction is `Execute="deferred"` scheduled `After="InstallFiles"` (`Product.wxs:402-407,429`) — a deferred CA runs in a locked-down context and **cannot** set an MSI property or influence the UI sequence at all; that has already finished by the time a deferred CA runs. Also, `WixToolset.UI.wixext` and `WixUI_FeatureTree` are **already** referenced (`Product.wxs:64`) and the extension is already passed to `wix build` — so this task is not "add the UI extension," it's "add a real property-setting mechanism the UI can read."

**Files:**
- Modify: `installer/windows/scripts/check-prereqs.ps1` (or add a new small immediate-CA script) to emit a property value in a way an **immediate** CA can consume
- Modify: `installer/windows/Product.wxs`
- Modify: `website/docs/deployment/windows-msi.md`

**Acceptance Criteria:**
- A prerequisite check runs as (or its result is surfaced via) an **immediate** CustomAction early enough in `InstallUISequence` to set a real MSI property (e.g. `MCPBRIDGE_MISSING`) that a dialog can read — this requires either moving the check earlier and making it immediate, or having a fast, side-effect-free immediate CA re-probe the same PATH check `check-prereqs.ps1` already does (do not attempt to have the existing deferred CA set a property — that is architecturally impossible per the finding above).
- A dialog (or `ExitDialogOptionalText`) displays the missing-prerequisites list when the property is non-empty, without blocking install.
- `website/docs/deployment/windows-msi.md`'s "No warning dialog yet" `:::note` (around lines 226-232) is removed/updated to describe the real behavior.

- [ ] **Step 1: Design the immediate-CA property-setting mechanism**

Read `Product.wxs`'s full `InstallUISequence`/`InstallExecuteSequence` and `check-prereqs.ps1` in full before writing code — this needs to run as an **immediate** CA (no deferred CA can set a property), which likely means a separate, fast, read-only PATH probe distinct from the existing deferred `check-prereqs.ps1` invocation (which can keep doing its log-only job for `install.log` diagnostics). Do not conflate the two.

- [ ] **Step 2: Wire the dialog to fire when the property is non-empty**

Add a `Publish` condition gated on the new property being set and non-empty, following the existing `WixUI_FeatureTree` UI sequence already present.

- [ ] **Step 3: Update docs**

Remove the "No warning dialog yet" `:::note` block in `website/docs/deployment/windows-msi.md` and replace with a description of the real dialog behavior.

- [ ] **Step 4: Commit**

```bash
git add installer/windows/scripts/check-prereqs.ps1 installer/windows/Product.wxs website/docs/deployment/windows-msi.md
git commit -m "feat: add real missing-prerequisites property and interactive warning dialog"
```

---

## Deferred / explicitly out of scope

- **MSI code signing** — documented, accepted v1 tradeoff; not a task in this plan.
- **Port-availability probing inside the installer's own prerequisite check** (as opposed to this plan's CI pre-flight check, which is a test-harness concern, not an installer feature) — a real gap (`website/docs/deployment/windows-msi.md`'s Troubleshooting section), independent of install/uninstall/upgrade correctness; track as a separate, lower-priority backlog task.
