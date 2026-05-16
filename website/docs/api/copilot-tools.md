---
sidebar_position: 3
---

# Copilot Tools API

The Copilot MCP server exposes eighteen tools.

## ask

Ask GitHub Copilot a freeform question.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `question` | string | Yes | The question to ask (max 500KB) |

### Response

Plain text string with Copilot's response.

### Example

**Input:**
```json
{
  "question": "How does React's useEffect cleanup function work with async operations?"
}
```

## code_review

Send a diff for review.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `diff` | string | Yes | The git diff to review (max 500KB) |
| `context` | string | No | Additional context for the review |

### Response

JSON when the response is parseable as a `ReviewResult`, otherwise plain text.

```typescript
interface ReviewResult {
  verdict: "APPROVED" | "NEEDS_REVISION";
  issues: Array<{
    severity: "critical" | "major" | "minor";
    description: string;
    recommendation: string;
  }>;
  suggestions: string[];
}
```

## Output Parsing

The Copilot server parses JSONL output from the `copilot -p --output-format json` CLI. Each line is a JSON object representing a message in the conversation. The server extracts the final assistant message and attempts to parse it as structured JSON.

If JSON parsing fails, the raw text response is returned. This means `code_review` may return either structured JSON or freeform text depending on Copilot's response format.

---

## Resume & Career Tools

All 16 tools below are also available on the Claude and Codex servers with identical parameters. All return plain text with structured AI-generated content. For full methodology details and usage examples, see [SKILLS.md](https://github.com/catesandrew/mcp-agent-bridge/blob/main/SKILLS.md) and the [Resume Tools Guide](../guides/resume-tools).

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
