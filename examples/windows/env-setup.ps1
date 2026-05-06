<#
.SYNOPSIS
    Configure environment variables for mcp-agent-bridge on Windows.

.DESCRIPTION
    Sets environment variables for the MCP bridge servers. Run this script
    to configure ports, models, and other settings. Changes persist across
    sessions (user-level environment variables).

.EXAMPLE
    .\env-setup.ps1                    # apply defaults
    .\env-setup.ps1 -ClaudeModel sonnet -ClaudePort 9940
#>
param(
    # Claude
    [int]$ClaudePort = 8940,
    [string]$ClaudeModel = "opus",
    [int]$ClaudeMaxTurns = 0,
    [string]$ClaudeCwd = "",
    [string]$ClaudeAllowedTools = "Read,Grep,Glob,LS",
    [string]$ClaudePermissionMode = "dontAsk",
    [int]$ClaudeTimeoutMs = 300000,
    [string]$ClaudeAllowedCwdRoots = "",

    # Codex
    [int]$CodexPort = 8941,
    [string]$CodexAgentPath = "",

    # Copilot
    [int]$CopilotPort = 8945,

    # Action
    [switch]$Show,
    [switch]$Remove
)

$ErrorActionPreference = "Stop"

$vars = @{
    # Claude
    "CLAUDE_MCP_HTTP_PORT"           = $ClaudePort
    "CLAUDE_REVIEW_MODEL"            = $ClaudeModel
    "CLAUDE_REVIEW_ALLOWED_TOOLS"    = $ClaudeAllowedTools
    "CLAUDE_REVIEW_PERMISSION_MODE"  = $ClaudePermissionMode
    "CLAUDE_REVIEW_TIMEOUT_MS"       = $ClaudeTimeoutMs

    # Codex
    "CODEX_MCP_HTTP_PORT"            = $CodexPort

    # Copilot
    "COPILOT_MCP_HTTP_PORT"          = $CopilotPort
}

# Only set non-default optional values
if ($ClaudeMaxTurns -gt 0)     { $vars["CLAUDE_REVIEW_MAX_TURNS"] = $ClaudeMaxTurns }
if ($ClaudeCwd)                { $vars["CLAUDE_REVIEW_CWD"] = $ClaudeCwd }
if ($ClaudeAllowedCwdRoots)    { $vars["CLAUDE_ALLOWED_CWD_ROOTS"] = $ClaudeAllowedCwdRoots }
if ($CodexAgentPath)           { $vars["CODEX_REVIEW_AGENT_PATH"] = $CodexAgentPath }

if ($Show) {
    Write-Host "Current MCP Agent Bridge environment variables:" -ForegroundColor Cyan
    Write-Host ""
    foreach ($key in ($vars.Keys | Sort-Object)) {
        $current = [Environment]::GetEnvironmentVariable($key, "User")
        if ($current) {
            Write-Host "  $key = $current" -ForegroundColor Green
        } else {
            Write-Host "  $key = (not set)" -ForegroundColor DarkGray
        }
    }
    exit 0
}

if ($Remove) {
    Write-Host "Removing MCP Agent Bridge environment variables..." -ForegroundColor Yellow
    foreach ($key in $vars.Keys) {
        [Environment]::SetEnvironmentVariable($key, $null, "User")
        Write-Host "  Removed $key"
    }
    # Also remove optional vars
    foreach ($key in @("CLAUDE_REVIEW_MAX_TURNS", "CLAUDE_REVIEW_CWD", "CLAUDE_ALLOWED_CWD_ROOTS", "CODEX_REVIEW_AGENT_PATH")) {
        [Environment]::SetEnvironmentVariable($key, $null, "User")
    }
    Write-Host "Done. Restart your terminal for changes to take effect."
    exit 0
}

Write-Host "Setting MCP Agent Bridge environment variables..." -ForegroundColor Cyan
foreach ($key in ($vars.Keys | Sort-Object)) {
    $value = "$($vars[$key])"
    [Environment]::SetEnvironmentVariable($key, $value, "User")
    $env:$key = $value
    Write-Host "  $key = $value"
}

Write-Host ""
Write-Host "Environment configured. Restart your terminal for changes to take effect." -ForegroundColor Green
Write-Host ""
Write-Host "To verify:  .\env-setup.ps1 -Show"
Write-Host "To remove:  .\env-setup.ps1 -Remove"
