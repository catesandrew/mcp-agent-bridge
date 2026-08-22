# MCP Agent Bridge

[![CI](https://github.com/catesandrew/mcp-agent-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/catesandrew/mcp-agent-bridge/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

Stop copy-pasting diffs between Claude, Codex, and Copilot tabs to get a second opinion. MCP Agent Bridge exposes each of them as an [MCP](https://modelcontextprotocol.io) server, so any one can call any other directly, in the same session, with structured JSON back instead of another wall of prose.

**[Documentation](https://mcp-agent-bridge.catesworks.dev/)**

## Why?

AI coding agents are powerful individually, but they each have blind spots. MCP Agent Bridge lets you:

- **Get a second opinion** -- Send your diff to a different AI model for review, without leaving your editor
- **Cross-validate** -- Compare responses from Claude, Codex, and Copilot on the same code
- **Structured reviews** -- Get typed JSON output with verdict, issues by severity, and suggestions -- parseable, not just readable
- **Share instances** -- Run each agent once as a background service, shared by all clients

## Quick Start

```bash
# Clone and build
git clone https://github.com/catesandrew/mcp-agent-bridge.git
cd mcp-agent-bridge
bun install && bun run build:exe

# Start the Claude bridge on port 8940
npx mcp-proxy --port 8940 -- ./exe/claude-mcp-server
```

Configure your MCP client (`.mcp.json`):

```json
{
  "mcpServers": {
    "claude_reviewer": {
      "type": "streamable-http",
      "url": "http://localhost:8940/mcp"
    }
  }
}
```

Then ask your agent: *"Use the claude_reviewer MCP to review this diff."*

## Architecture

Each bridge runs as a singleton background service behind an HTTP proxy. Multiple clients share one instance.

```
┌─────────────┐     HTTP/SSE      ┌───────────┐     stdio     ┌──────────────────┐
│  MCP Client │ ───────────────► │ mcp-proxy │ ────────────► │  claude -p       │
│  (any agent)│    :8940/mcp     │           │               │  codex exec      │
└─────────────┘                  └───────────┘               │  copilot -p      │
                                                             └──────────────────┘
```

| Server | Port | Core Tools | Resume Tools |
|--------|------|------------|--------------|
| Claude | 8940 | `review`, `ask`, `code_review` | 18 career tools |
| Codex | 8941 | `codex`, `code_review`, `codex_reply` | 18 career tools |
| Copilot | 8945 | `ask`, `code_review` | 18 career tools |

## Resume & Career Tools

All three servers include 18 resume and career tools powered by embedded skill methodologies. No network fetch at runtime — the expert logic is compiled in.

| Tool | Purpose |
|------|---------|
| `career_fact_extractor` | Extract a fact-ID-tagged career database from any source material |
| `cover_letter_generator` | Personalized cover letters with match analysis and talking points |
| `creative_portfolio_resume` | ATS + designed resume for creative professionals |
| `executive_resume_writer` | C-suite, VP, and Director-level transformation-story resumes |
| `interview_prep_generator` | STAR-method prep with predicted questions ranked by probability |
| `job_description_analyzer` | Match scoring, keyword extraction, and red flag detection |
| `linkedin_profile_optimizer` | Algorithm-aware LinkedIn profile rewrite |
| `portfolio_case_study_writer` | Six-section case studies for design, engineering, PM, and marketing |
| `reference_list_builder` | Reference strategy, formatting, and briefing email templates |
| `resume_ats_optimizer` | Keyword matching and ATS compliance fixes |
| `resume_bullet_writer` | Transform duty bullets into achievement bullets using X-Y-Z formula |
| `resume_formatter` | ATS-safe formatting audit and repair |
| `resume_quantifier` | Add metrics to every bullet using estimation methodology |
| `resume_section_builder` | Build targeted sections by career stage |
| `resume_tailor` | Tailor a master resume to a specific job posting |
| `recruiter_first_screen_simulation` | Simulate a skeptical hiring manager's 45-second resume screen |
| `resume_version_manager` | Organize and track multiple resume versions with naming conventions |
| `tech_resume_optimizer` | Optimize for software engineering, data, DevOps, and technical PM roles |

See the [Resume Tools Guide](https://mcp-agent-bridge.catesworks.dev/docs/guides/resume-tools) and [SKILLS.md](SKILLS.md) for full input schemas and usage examples.

## Structured Review Output

The `review` and `code_review` tools return predictable JSON:

```json
{
  "verdict": "NEEDS_REVISION",
  "issues": [
    {
      "severity": "critical",
      "description": "SQL injection via string interpolation",
      "recommendation": "Use parameterized queries"
    }
  ],
  "suggestions": [
    "Add rate limiting to the login endpoint"
  ]
}
```

## Claude Code Skills

This repo also ships **Claude Code skills** -- slash-command workflows distributed independently of
the bridge servers above. Today that's [`dual-review`](https://mcp-agent-bridge.catesworks.dev/docs/skills/dual-review):
send a plan or diff to a second agent (via the `claude_reviewer`/`codex` MCP tools) for structured
review before and after you implement, iterating on feedback automatically. See the
[Skills Catalog](https://mcp-agent-bridge.catesworks.dev/docs/skills) for the full list and what's
planned.

<details>
<summary><b>Claude Code Plugin</b></summary>

```shell
/plugin marketplace add catesandrew/mcp-agent-bridge
/plugin install mab@mcp-agent-bridge
```

</details>

<details>
<summary><b>npm</b></summary>

```shell
npm view @mcp-agent-bridge/skill-dual-review
```

Copy the published package's `SKILL.md` into your agent's skills directory if your tooling
consumes skill files directly rather than through a plugin manager.

</details>

<details>
<summary><b>Manual / clone</b></summary>

```shell
git clone https://github.com/catesandrew/mcp-agent-bridge.git
cp -r mcp-agent-bridge/skills/dual-review ~/.claude/skills/dual-review
```

</details>

## Installation

### Pre-built Binaries

Download from [GitHub Releases](https://github.com/catesandrew/mcp-agent-bridge/releases) for macOS (ARM64/x64), Linux (x64/ARM64), and Windows (x64).

### From Source

```bash
bun install
bun run build:exe    # Standalone binaries in exe/
./install.sh         # Copy to ~/.local/bin
```

### Background Services

```bash
# macOS -- LaunchAgents
./install.sh --launchd --load

# Windows -- NSSM services
.\examples\windows\install.ps1 -HttpService

# Linux -- systemd (see docs)
```

See the [Deployment Guide](https://mcp-agent-bridge.catesworks.dev/docs/deployment/macos) for details.

## Configuration

All servers are configured via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_REVIEW_MODEL` | `opus` | Model for Claude reviews |
| `CLAUDE_MCP_HTTP_PORT` | `8940` | Claude HTTP port |
| `CODEX_MCP_HTTP_PORT` | `8941` | Codex HTTP port |
| `COPILOT_MCP_HTTP_PORT` | `8945` | Copilot HTTP port |

See [all environment variables](https://mcp-agent-bridge.catesworks.dev/docs/configuration/environment-variables) in the docs.

## Testing

```bash
bun run test        # 36 tests across 5 suites
bun run lint        # TypeScript type checking
```

## Security

- All proxies bind to `127.0.0.1` (localhost only)
- Read-only tool allowlist by default (`Read`, `Grep`, `Glob`, `LS`)
- Working directory validation against allowed roots
- Input size limits (500KB) and process timeouts (5 min)

## Prerequisites

- [Bun](https://bun.sh/) >= 1.0 (build)
- Node.js >= 20 (runtime)
- At least one agent CLI installed and authenticated:
  [Claude](https://docs.anthropic.com/en/docs/claude-code) |
  [Codex](https://github.com/openai/codex) |
  [Copilot](https://githubnext.com/projects/copilot-cli)
- [`mcp-proxy`](https://github.com/nicholasgasior/mcp-proxy) (for HTTP mode)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.
