---
sidebar_position: 1
---

# Claude Tools API

The Claude MCP server exposes nineteen tools. All tools are registered under the `claude_reviewer` server name (configurable in your `.mcp.json`).

## review

Send code, plans, or diffs for structured review.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `content` | string | Yes | The content to review (max 500KB) |
| `context` | string | No | Additional context for the reviewer |

### Response

```typescript
interface ReviewResult {
  verdict: "APPROVED" | "NEEDS_REVISION";
  issues: ReviewIssue[];
  suggestions: string[];
}

interface ReviewIssue {
  severity: "critical" | "major" | "minor";
  description: string;
  recommendation: string;
}
```

### Example

**Input:**
```json
{
  "content": "function login(user, pass) {\n  const query = `SELECT * FROM users WHERE name='${user}' AND pass='${pass}'`;\n  return db.exec(query);\n}",
  "context": "Authentication module for the web API"
}
```

**Output:**
```json
{
  "verdict": "NEEDS_REVISION",
  "issues": [
    {
      "severity": "critical",
      "description": "SQL injection vulnerability via string interpolation",
      "recommendation": "Use parameterized queries: db.prepare('SELECT * FROM users WHERE name=? AND pass=?').get(user, pass)"
    }
  ],
  "suggestions": [
    "Hash passwords instead of storing/comparing plaintext",
    "Add rate limiting to prevent brute-force attacks"
  ]
}
```

## ask

Ask Claude a freeform question about code.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `question` | string | Yes | The question to ask (max 500KB) |
| `cwd` | string | No | Working directory for file access |

### Response

Plain text string with Claude's response.

### Example

**Input:**
```json
{
  "question": "What design pattern does the server-factory.ts module use?",
  "cwd": "/path/to/project"
}
```

**Output:**
```
"The server-factory.ts module uses the Factory pattern. The createServer() function
acts as a factory that takes a ServerConfig object and returns a configured McpServer
instance. This centralizes server creation logic and ensures consistent configuration
across all three bridge servers (Claude, Codex, Copilot)."
```

## code_review

Specialized tool for reviewing git diffs.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `diff` | string | Yes | The git diff to review (max 500KB) |
| `context` | string | No | Additional context for the review |

### Response

Same `ReviewResult` structure as the `review` tool.

### Example

**Input:**
```json
{
  "diff": "diff --git a/src/auth.ts b/src/auth.ts\n--- a/src/auth.ts\n+++ b/src/auth.ts\n@@ -10,6 +10,7 @@\n+  if (!token) return null;\n   const decoded = jwt.verify(token, SECRET);",
  "context": "Adding null check for missing auth tokens"
}
```

---

## Resume & Career Tools

All 16 tools below are also available on the Codex and Copilot servers with identical parameters. All return plain text with structured AI-generated content. For full methodology details and usage examples, see [SKILLS.md](https://github.com/catesandrew/mcp-agent-bridge/blob/main/SKILLS.md) and the [Resume Tools Guide](../guides/resume-tools).

## cover_letter_generator

Generate a personalized cover letter with match analysis, alternative hooks, and interview talking points.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resume` | string | Yes | Candidate's resume or experience summary |
| `job_description` | string | Yes | Full job posting text |
| `company_name` | string | Yes | Name of the target company |
| `role_title` | string | Yes | Title of the role being applied for |
| `additional_context` | string | No | Mutual connections, company news, personal motivation |

### Example

```json
{
  "resume": "Jane Smith, Senior PM, 8 years...",
  "job_description": "We're hiring a Senior PM to lead growth...",
  "company_name": "Acme Corp",
  "role_title": "Senior Product Manager, Growth",
  "additional_context": "I noticed Acme just raised a Series B."
}
```

## creative_portfolio_resume

Generate both an ATS-compatible and a fully designed resume for creative professionals.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `experience` | string | Yes | Work history and project experience |
| `skills` | string | Yes | Creative and technical skills |
| `field` | string | Yes | Creative field (e.g. `graphic_design`, `ux_design`, `photography`, `writing`, `marketing`) |
| `target_role` | string | No | Specific role being targeted |
| `portfolio_url` | string | No | URL of the candidate's portfolio |
| `additional_context` | string | No | Any additional information |

## executive_resume_writer

Create a 2-3 page executive resume focused on leadership brand and strategic transformation story.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `experience` | string | Yes | Career history including company context and scope |
| `current_level` | string | Yes | One of: `c_suite`, `vp`, `director`, `other_executive` |
| `target_role` | string | No | Target role or title |
| `industry` | string | No | Target industry |
| `board_experience` | string | No | Board and advisory roles |
| `additional_context` | string | No | Any additional information |

## interview_prep_generator

Generate STAR-method interview prep with predicted questions ranked by probability.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resume` | string | Yes | Candidate's resume |
| `job_description` | string | Yes | Job posting text |
| `company_name` | string | Yes | Target company |
| `role_title` | string | Yes | Role being interviewed for |
| `interview_format` | string | No | e.g. `behavioral`, `technical`, `panel`, `case study` |
| `additional_context` | string | No | Any additional information |

## job_description_analyzer

Extract requirements, score match against a resume, detect red flags, and generate application recommendations.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `job_description` | string | Yes | Full job posting text |
| `resume` | string | No | Candidate's resume (enables match scoring) |
| `additional_context` | string | No | Any additional information |

### Example

```json
{
  "job_description": "We are looking for a Staff Software Engineer...",
  "resume": "John Doe, Software Engineer, 6 years..."
}
```

## linkedin_profile_optimizer

Rewrite a LinkedIn profile for recruiter visibility using LinkedIn's search algorithm best practices.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `current_profile` | string | Yes | Current LinkedIn profile content (headline, about, experience) |
| `target_role` | string | No | Role type being targeted |
| `industry` | string | No | Target industry |
| `resume` | string | No | Resume for reference |
| `additional_context` | string | No | Any additional information |

## portfolio_case_study_writer

Write a structured portfolio case study in the six-section framework (Overview, Problem, Process, Solution, Results, Learnings).

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_description` | string | Yes | Project context including your role and constraints |
| `outcomes` | string | Yes | Results, metrics, and impact achieved |
| `field` | string | Yes | One of: `product_management`, `design`, `engineering`, `marketing`, `other` |
| `depth` | string | No | `essential` (~700 words) or `deep_dive` (~2500 words). Default: `essential` |
| `additional_context` | string | No | Any additional information |

## reference_list_builder

Build a reference strategy with formatted list, briefing email templates, and talking points per reference.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `references` | string | Yes | List of potential references with their details |
| `target_role` | string | Yes | Role being applied for |
| `company_name` | string | Yes | Target company |
| `resume_highlights` | string | No | Key achievements for references to emphasize |
| `additional_context` | string | No | Any additional information |

## resume_ats_optimizer

Optimize a resume to pass ATS screening via keyword matching and formatting compliance fixes.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resume` | string | Yes | Current resume text |
| `job_description` | string | Yes | Job posting to optimize against |
| `industry` | string | No | Industry context (tech, finance, healthcare, marketing) |
| `additional_context` | string | No | Any additional information |

## resume_bullet_writer

Transform weak, duty-focused bullets into achievement-focused statements using the X-Y-Z formula.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bullets` | string | Yes | One or more bullets to transform (one per line) |
| `role_context` | string | Yes | Role, company, and industry context |
| `metrics_available` | string | No | Any data or numbers that can be incorporated |
| `additional_context` | string | No | Any additional information |

## resume_formatter

Audit and fix resume formatting for ATS compliance and human readability.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resume` | string | Yes | Resume text to format |
| `career_level` | string | Yes | One of: `entry_level`, `mid_level`, `senior_executive` |
| `additional_context` | string | No | Any additional information |

## resume_quantifier

Add data-driven metrics to every bullet using six metric categories and estimation methodology.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bullets` | string | Yes | Bullets to quantify (one per line) |
| `role_context` | string | Yes | Role and industry context |
| `data_available` | string | No | Any raw data or numbers to draw from |
| `additional_context` | string | No | Any additional information |

## resume_section_builder

Build targeted resume sections (summary, skills, experience, education) tailored to career stage.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `experience` | string | Yes | Work history |
| `skills` | string | Yes | Skills and competencies |
| `career_stage` | string | Yes | One of: `entry_level`, `mid_career`, `senior`, `executive`, `career_changer` |
| `target_role` | string | Yes | Role being targeted |
| `education` | string | No | Education history |
| `additional_sections` | string | No | Projects, volunteer work, certifications, etc. |
| `additional_context` | string | No | Any additional information |

## resume_tailor

Tailor a master resume to a specific job posting by selecting and emphasizing relevant experience.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resume` | string | Yes | Master resume or current resume |
| `job_description` | string | Yes | Full job posting text |
| `company_name` | string | Yes | Target company |
| `role_title` | string | Yes | Role being applied for |
| `additional_context` | string | No | Any additional information |

### Example

```json
{
  "resume": "[master resume text]",
  "job_description": "[full job posting]",
  "company_name": "Stripe",
  "role_title": "Engineering Manager"
}
```

## resume_version_manager

Organize and maintain multiple resume versions using a master resume strategy and application tracker.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `master_resume` | string | No | Current resume or experience (to build the master from) |
| `existing_versions` | string | No | Description of existing resume files/versions |
| `target_roles` | string | No | Target roles and industries |
| `job_applications` | string | No | Current or recent job applications |
| `additional_context` | string | No | Any additional information |

## tech_resume_optimizer

Optimize resumes for software engineering, data, DevOps, and technical PM roles.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resume` | string | Yes | Current resume |
| `role_type` | string | Yes | e.g. `software_engineer`, `data_engineer`, `devops_sre`, `technical_pm` |
| `job_description` | string | No | Target job posting (enables ATS keyword analysis) |
| `career_level` | string | No | e.g. `junior`, `mid`, `senior`, `staff`, `principal` |
| `additional_context` | string | No | Any additional information |

### Example

```json
{
  "resume": "[full resume text]",
  "role_type": "software_engineer",
  "job_description": "[full JD text]",
  "career_level": "senior"
}
```
