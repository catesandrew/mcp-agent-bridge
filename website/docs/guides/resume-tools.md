---
sidebar_position: 6
---

# Resume & Career Tools

MCP Agent Bridge includes 16 resume and career tools available on all three MCP servers (Claude, Codex, Copilot). Each tool embeds a specialized methodology from the [ResumeSkills](https://github.com/Paramchoudhary/ResumeSkills) project at compile time — no network fetch at runtime.

## Available Tools

| Tool | Purpose |
|------|---------|
| `career_fact_extractor` | Extract a fact-ID-tagged career database from any source material |
| `cover_letter_generator` | Personalized cover letters with match analysis |
| `creative_portfolio_resume` | ATS + designed resume for creative professionals |
| `executive_resume_writer` | C-suite, VP, and Director-level resumes |
| `interview_prep_generator` | STAR-method prep with predicted questions |
| `job_description_analyzer` | Match scoring, keywords, red flags |
| `linkedin_profile_optimizer` | Algorithm-aware LinkedIn profile rewrite |
| `portfolio_case_study_writer` | Six-section case studies for portfolios |
| `reference_list_builder` | Reference strategy and briefing materials |
| `resume_ats_optimizer` | ATS keyword matching and formatting fixes |
| `resume_bullet_writer` | Transform duty bullets into achievement bullets |
| `resume_formatter` | ATS-safe formatting audit and repair |
| `resume_quantifier` | Add metrics using estimation methodology |
| `resume_section_builder` | Build targeted sections by career stage |
| `resume_tailor` | Tailor a master resume to a specific posting |
| `recruiter_first_screen_simulation` | Simulate a skeptical hiring manager's 45-second resume screen |
| `resume_version_manager` | Organize and track multiple resume versions |
| `tech_resume_optimizer` | Optimize for software engineering and technical roles |

## Usage Examples

### Extract Career Facts (before tailoring)

```json
{
  "tool": "career_fact_extractor",
  "arguments": {
    "source_material": "Jane Smith\nSenior PM at Acme 2021-2024. Led checkout redesign, cart abandonment dropped from 68% to 41%...\n[paste resume, LinkedIn, brag doc, etc.]",
    "additional_context": "Targeting Staff PM roles at Series B startups"
  }
}
```

**Output includes:** Fact list with IDs (FACT-001…), categories, source text, confidence ratings, gaps (e.g. no leadership evidence), and fabrication risks.

Pass the output as `career_facts` to `resume_tailor` for evidence-mapped, verifiable tailoring.

---

### Simulate a Recruiter First Screen

```json
{
  "tool": "recruiter_first_screen_simulation",
  "arguments": {
    "resume": "[full resume text]",
    "job_description": "[full job posting text]",
    "seniority_level": "senior"
  }
}
```

**Output includes:** Yes/Maybe/No decision, top 5 reasons, top 5 concerns, strongest evidence, weakest sections (with specific text), missing seniority signals, exact rewrites to make, and scores across 6 dimensions (role fit, clarity, seniority signal, impact, credibility, keyword alignment).

---

### Generate a Cover Letter

```json
{
  "tool": "cover_letter_generator",
  "arguments": {
    "resume": "Jane Smith\nSenior Product Manager, 8 years...\n[full resume text]",
    "job_description": "We're hiring a Senior PM to lead our growth team...\n[full JD]",
    "company_name": "Acme Corp",
    "role_title": "Senior Product Manager, Growth",
    "additional_context": "I noticed Acme just raised a Series B and is expanding into APAC."
  }
}
```

**Output includes:** Match score analysis, complete cover letter, 2 alternative hooks, 3 interview talking points.

---

### Analyze a Job Description

```json
{
  "tool": "job_description_analyzer",
  "arguments": {
    "job_description": "We are looking for a Staff Software Engineer...\n[full JD]",
    "resume": "John Doe\nSoftware Engineer, 6 years...\n[full resume text]"
  }
}
```

**Output includes:** Requirements breakdown, keyword list, match score (e.g. 78/100), gap analysis by severity, red flags, and application recommendation.

---

### Optimize for ATS

```json
{
  "tool": "resume_ats_optimizer",
  "arguments": {
    "resume": "[full resume text]",
    "job_description": "[full job posting text]",
    "industry": "tech"
  }
}
```

**Output includes:** Keyword extraction, current match score with gap list, keywords to add with placement, formatting fixes, optimized sections, projected match score.

---

### Tailor a Resume (with evidence map)

```json
{
  "tool": "resume_tailor",
  "arguments": {
    "resume": "[master resume text]",
    "job_description": "[full job posting text]",
    "company_name": "Stripe",
    "role_title": "Engineering Manager",
    "career_facts": "[output from career_fact_extractor]"
  }
}
```

**Output includes:** Keyword extraction, resume audit, tailored summary, reordered skills, bullet rewrites, sections to add/remove, cover letter red flags, **evidence map** (each bullet → source Fact IDs), **removed claims** (unsupported claims dropped), **questions for missing proof**, and pre-submission checklist.

Omit `career_facts` to tailor without the evidence map.

---

### Improve Resume Bullets

```json
{
  "tool": "resume_bullet_writer",
  "arguments": {
    "bullets": "Managed social media accounts\nResponsible for customer support\nHelped with product launches",
    "role_context": "Marketing Manager at a B2B SaaS company, team of 3",
    "metrics_available": "Social following grew from 5K to 17.5K; support tickets resolved ~200/month"
  }
}
```

**Output includes (per bullet):** Diagnosis, discovery questions, 2-3 rewritten versions, recommended version with explanation.

---

### Prepare for an Interview

```json
{
  "tool": "interview_prep_generator",
  "arguments": {
    "resume": "[full resume text]",
    "job_description": "[full JD text]",
    "company_name": "Google",
    "role_title": "Senior Software Engineer",
    "interview_format": "technical + behavioral"
  }
}
```

**Output includes:** Top 10-15 predicted questions ranked by probability, 3-5 STAR stories, 2-minute self-introduction, 5-7 questions to ask, strategies for difficult questions.

---

### Optimize a Tech Resume

```json
{
  "tool": "tech_resume_optimizer",
  "arguments": {
    "resume": "[full resume text]",
    "role_type": "software_engineer",
    "job_description": "[full JD text]",
    "career_level": "senior"
  }
}
```

**Output includes:** Restructured skills section, bullet rewrites per role, projects section, GitHub recommendations, ATS keyword gaps.

---

### Build a Creative Portfolio Resume

```json
{
  "tool": "creative_portfolio_resume",
  "arguments": {
    "experience": "[work history and projects]",
    "skills": "Figma, Adobe XD, user research, prototyping, design systems...",
    "field": "ux_design",
    "target_role": "Senior UX Designer",
    "portfolio_url": "https://portfolio.example.com"
  }
}
```

**Output includes:** Field analysis, ATS-compatible resume, designed version with typography/color recommendations, field-specific tips, portfolio link strategy.

---

### Write a Portfolio Case Study

```json
{
  "tool": "portfolio_case_study_writer",
  "arguments": {
    "project_description": "Led redesign of checkout flow for e-commerce platform. Team of 4. 3-month timeline. Constraint: could not change payment provider.",
    "outcomes": "Cart abandonment reduced from 68% to 41%. Revenue increased $2.3M annually.",
    "field": "design",
    "depth": "essential"
  }
}
```

**Output includes:** Full case study in 6-section framework, executive summary (3 sentences), 3 interview questions it prepares you for, suggested visual artifacts.

---

### Optimize a LinkedIn Profile

```json
{
  "tool": "linkedin_profile_optimizer",
  "arguments": {
    "current_profile": "Headline: Software Engineer at Acme\nAbout: I'm a passionate developer...\n[rest of profile]",
    "target_role": "Staff Engineer",
    "industry": "fintech"
  }
}
```

**Output includes:** 3 optimized headline options, rewritten About section, experience bullet rewrites, skills recommendations, featured section strategy, keyword gap analysis, 30-day action plan.

---

## Choosing the Right Tool

| Situation | Recommended Tool(s) |
|-----------|---------------------|
| Applying to a specific role (full workflow) | `career_fact_extractor` → `resume_tailor` → `recruiter_first_screen_simulation` → `cover_letter_generator` |
| Applying to a specific role (quick) | `resume_tailor` → `cover_letter_generator` |
| Worried about fabrication / want evidence map | `career_fact_extractor` → `resume_tailor` (with `career_facts`) |
| Resume not getting past ATS | `resume_ats_optimizer` |
| Want honest recruiter feedback | `recruiter_first_screen_simulation` |
| Bullets feel weak or generic | `resume_bullet_writer` or `resume_quantifier` |
| Preparing for interviews | `interview_prep_generator` |
| Building resume from scratch | `resume_section_builder` |
| Formatting looks off | `resume_formatter` |
| Managing many applications | `resume_version_manager` |
| Applying for tech roles | `tech_resume_optimizer` |
| Creative field | `creative_portfolio_resume` + `portfolio_case_study_writer` |
| Senior/exec role | `executive_resume_writer` |
| LinkedIn not getting views | `linkedin_profile_optimizer` |
| Need references | `reference_list_builder` |

## Which Server to Use

All 16 tools are identical across Claude, Codex, and Copilot servers. Choose based on what you're already using:

- **Claude** (`claude_reviewer`) — best for nuanced writing and detailed structured output
- **Codex** (`codex_reviewer`) — OpenAI model alternative
- **Copilot** (`copilot_reviewer`) — if Copilot is your primary coding agent

For complete API reference including all input parameters, see the [Claude Tools API](../api/claude-tools), [Codex Tools API](../api/codex-tools), or [Copilot Tools API](../api/copilot-tools).
