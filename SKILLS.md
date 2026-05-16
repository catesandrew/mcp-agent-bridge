# Resume & Career Skills Reference

All 16 resume and career tools embedded in MCP Agent Bridge. Each tool hard-codes a specialized methodology from the [ResumeSkills](https://github.com/Paramchoudhary/ResumeSkills) project, making expert career guidance available through any connected AI agent without network fetches at runtime.

## Tool Overview

| Tool | Purpose |
|------|---------|
| [`cover_letter_generator`](#cover_letter_generator) | Personalized, research-driven cover letters |
| [`creative_portfolio_resume`](#creative_portfolio_resume) | ATS + designed resume for creative professionals |
| [`executive_resume_writer`](#executive_resume_writer) | C-suite, VP, and Director-level resumes |
| [`interview_prep_generator`](#interview_prep_generator) | STAR-method interview prep with predicted questions |
| [`job_description_analyzer`](#job_description_analyzer) | Match scoring, keyword extraction, red flag detection |
| [`linkedin_profile_optimizer`](#linkedin_profile_optimizer) | Algorithm-aware LinkedIn profile rewrite |
| [`portfolio_case_study_writer`](#portfolio_case_study_writer) | Six-section case studies for portfolios |
| [`reference_list_builder`](#reference_list_builder) | Reference strategy, formatting, and briefing materials |
| [`resume_ats_optimizer`](#resume_ats_optimizer) | Keyword matching and ATS compliance fixes |
| [`resume_bullet_writer`](#resume_bullet_writer) | Transform duty bullets into achievement bullets |
| [`resume_formatter`](#resume_formatter) | ATS-safe formatting for robots and humans |
| [`resume_quantifier`](#resume_quantifier) | Add metrics to every bullet using estimation methodology |
| [`resume_section_builder`](#resume_section_builder) | Build targeted resume sections by career stage |
| [`resume_tailor`](#resume_tailor) | Tailor a master resume to a specific job posting |
| [`resume_version_manager`](#resume_version_manager) | Organize and track multiple resume versions |
| [`tech_resume_optimizer`](#tech_resume_optimizer) | Optimize resumes for technical roles |

All tools are available on all three MCP servers (Claude, Codex, Copilot). All return plain text with structured AI-generated content.

---

## cover_letter_generator

**Purpose:** Generate a personalized, compelling cover letter using structured methodology — company research, candidate-to-role matching, gap handling, and interview talking points.

**Methodology highlights:**
- Hook strategies: company news, mutual connections, quantified achievement, industry insight
- 250-400 word target with 3-4 paragraphs
- Never uses "I am writing to apply" or generic openers
- Gap handling: emphasize transferable skills, not apologize

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resume` | string | Yes | Candidate's resume or experience summary |
| `job_description` | string | Yes | Full job posting text |
| `company_name` | string | Yes | Name of the target company |
| `role_title` | string | Yes | Title of the role being applied for |
| `additional_context` | string | No | Mutual connections, company news, personal motivation |

### Output Sections
1. **Analysis** — match score (X/10), key strengths, gaps, company research notes
2. **Cover Letter** — complete, ready-to-send letter
3. **Alternative Opening Hooks** — 2 alternative opening paragraphs
4. **Interview Talking Points** — 3 points to prepare for the subsequent interview

---

## creative_portfolio_resume

**Purpose:** Generate both an ATS-compatible and a fully designed resume for creative professionals (designers, writers, photographers, marketers).

**Methodology highlights:**
- Always produces two versions: ATS-safe single-column and designed version
- Field-specific guidance for graphic design, UX, marketing, writing, photography/video
- Typography: max 2 font families; color: max 2 accents with hex codes
- ATS version: zero columns, text boxes, images, or unusual fonts

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `experience` | string | Yes | Work history and project experience |
| `skills` | string | Yes | Creative and technical skills |
| `field` | string | Yes | Creative field (e.g. `graphic_design`, `ux_design`, `photography`, `writing`, `marketing`) |
| `target_role` | string | No | Specific role being targeted |
| `portfolio_url` | string | No | URL of the candidate's portfolio |
| `additional_context` | string | No | Any additional information |

### Output Sections
1. **Field Analysis** — creative field detected, ATS risk level, portfolio presentation priority
2. **ATS-Compatible Resume** — plain-text, ready to paste into any job portal
3. **Designed Version** — full content with typography, color palette, and layout annotations
4. **Field-Specific Tips** — 3-5 tailored recommendations
5. **Portfolio Link Strategy** — how to present portfolio work for maximum impact

---

## executive_resume_writer

**Purpose:** Create a 2-3 page executive resume focused on transformation story, leadership brand, and strategic impact for C-suite, VP, and Director-level candidates.

**Methodology highlights:**
- Shows strategic impact (not tasks) — transformation story framing
- Includes company context: revenue, stage, headcount, P&L scope, direct reports
- Power language: "Architected", "Spearheaded", "Orchestrated", "Championed"
- Reviewed by boards and investors — narrative clarity over keyword density

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `experience` | string | Yes | Career history including company context and scope |
| `current_level` | string | Yes | One of: `c_suite`, `vp`, `director`, `other_executive` |
| `target_role` | string | No | Target role or title |
| `industry` | string | No | Target industry |
| `board_experience` | string | No | Board and advisory roles |
| `additional_context` | string | No | Any additional information |

### Output Sections
1. **Executive Profile** — 3-4 sentence leadership brand statement
2. **Core Competencies** — 8-12 leadership themes
3. **Career Highlights** — 3-5 cross-career headline achievements
4. **Full Professional Experience** — transformation-focused, not task-focused
5. **Coaching Notes** — what story the resume tells and gaps to address

---

## interview_prep_generator

**Purpose:** Generate comprehensive interview preparation materials using the STAR method and story banking approach, tailored to the specific role and company.

**Methodology highlights:**
- STAR method: Situation, Task, Action (YOU specifically), Result (quantified)
- Story banking: full narrative (2 min), condensed (60 sec), talking point (15 sec)
- Competency categories: leadership, problem-solving, collaboration, achievement, growth/failure
- Role analysis: predicts which competencies will be tested by probability

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resume` | string | Yes | Candidate's resume |
| `job_description` | string | Yes | Job posting text |
| `company_name` | string | Yes | Target company |
| `role_title` | string | Yes | Role being interviewed for |
| `interview_format` | string | No | e.g. `behavioral`, `technical`, `panel`, `case study` |
| `additional_context` | string | No | Any additional information |

### Output Sections
1. **Role-Specific Questions** — top 10-15 ranked by probability
2. **STAR Stories** — 3-5 fully developed stories mapped to predicted questions
3. **Self-Introduction** — personalized 2-minute pitch
4. **Questions to Ask** — 5-7 thoughtful questions for interviewers
5. **Difficult Question Strategies** — salary, gaps, failure scenarios
6. **30-60-90 Day Plan** — if relevant to seniority level

---

## job_description_analyzer

**Purpose:** Analyze a job posting to extract requirements, keywords, calculate match score (if resume provided), detect red flags, and generate an application recommendation.

**Methodology highlights:**
- Match scoring: 90-100% overqualified, 75-89% optimal, 60-74% stretch, below 60% high risk
- Red flag categories: workload indicators ("wear many hats"), culture warnings ("rockstar"), compensation concerns, instability signals
- Gap analysis: classifies missing skills as critical, major, or minor

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `job_description` | string | Yes | Full job posting text |
| `resume` | string | No | Candidate's resume (enables match scoring) |
| `additional_context` | string | No | Any additional information |

### Output Sections
1. **Requirements Breakdown** — required / preferred / soft skills
2. **Keywords List** — hard skills, tools, domain terms
3. **Match Score** — detailed scoring with gap list (if resume provided)
4. **Red Flags** — detected with explanations
5. **Application Recommendation** — apply now / apply with adjustments / skip
6. **Resume Tailoring Priorities** — for this specific role
7. **Cover Letter Talking Points**

---

## linkedin_profile_optimizer

**Purpose:** Optimize a LinkedIn profile for recruiter visibility using LinkedIn's search algorithm and section-by-section best practices.

**Methodology highlights:**
- Algorithm priority: headline > current job title > skills > about section
- Headline formula: `[Role] | [Key Expertise] | [Value Proposition or Achievement]`
- About section structure: Hook → What you do → How → Who you help → Results → CTA
- Complete profiles get 40x more opportunities; 5+ skills get 17x more views

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `current_profile` | string | Yes | Current LinkedIn profile content (headline, about, experience) |
| `target_role` | string | No | Role type being targeted |
| `industry` | string | No | Target industry |
| `resume` | string | No | Resume for reference |
| `additional_context` | string | No | Any additional information |

### Output Sections
1. **Optimized Headline** — 3 options
2. **Rewritten About Section** — with CTA
3. **Experience Bullet Rewrites** — top 2-3 roles
4. **Skills Recommendations** — top 15 to prioritize
5. **Featured Section Strategy**
6. **Keyword Gap Analysis**
7. **30-Day Action Plan** — to improve profile strength

---

## portfolio_case_study_writer

**Purpose:** Write a structured portfolio case study in the six-section framework covering overview, problem, process, solution, results, and learnings.

**Methodology highlights:**
- Core principle: resumes show WHAT, case studies show HOW and WHY
- Essential (3-5 min read, ~600-800 words) or deep dive (10-15 min, ~2000-3000 words)
- Role-specific focus: PMs lead with strategy; designers with process; engineers with architecture; marketers with ROI

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_description` | string | Yes | Project context including your role and constraints |
| `outcomes` | string | Yes | Results, metrics, and impact achieved |
| `field` | string | Yes | One of: `product_management`, `design`, `engineering`, `marketing`, `other` |
| `depth` | string | No | `essential` (600-800 words) or `deep_dive` (2000-3000 words). Default: `essential` |
| `additional_context` | string | No | Any additional information |

### Output Sections
1. **Complete Case Study** — in the 6-section framework
2. **Executive Summary** — 3 sentences for portfolio homepage
3. **Interview Questions** — 3 questions this case study should prepare you for
4. **Visual Artifacts** — suggested artifacts to include

---

## reference_list_builder

**Purpose:** Build a professional reference strategy including formatted reference list, briefing email templates, permission request scripts, and talking points for each reference.

**Methodology highlights:**
- Reference hierarchy: recent direct supervisor > senior leaders > cross-functional partners > clients > direct reports
- Preparation protocol: get permission first, brief with resume + JD + talking points, follow up after
- Key check: ensure "Would you rehire them?" gets an enthusiastic yes

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `references` | string | Yes | List of potential references with their details |
| `target_role` | string | Yes | Role being applied for |
| `company_name` | string | Yes | Target company |
| `resume_highlights` | string | No | Key achievements for references to emphasize |
| `additional_context` | string | No | Any additional information |

### Output Sections
1. **Reference Strategy** — which types to prioritize for this role
2. **Formatted Reference List** — ready to submit
3. **Briefing Email Template** — per reference
4. **Permission Request Script**
5. **Talking Points** — per reference to emphasize
6. **Backup Reference Suggestions**
7. **Timing Guidance** — when to provide references in the process

---

## resume_ats_optimizer

**Purpose:** Optimize a resume to pass ATS screening by extracting job description keywords, calculating match scores, and fixing ATS formatting issues.

**Methodology highlights:**
- ~75% of resumes are rejected by ATS before human review
- Target scores: 80%+ strong pass, 60-79% likely pass, below 60% high rejection risk
- Critical keywords should appear 2-4 times naturally; never keyword-stuff
- Common failures: tables, multi-column layouts, contact info in headers/footers, skill bars

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resume` | string | Yes | Current resume text |
| `job_description` | string | Yes | Job posting to optimize against |
| `industry` | string | No | Industry context (tech, finance, healthcare, marketing) |
| `additional_context` | string | No | Any additional information |

### Output Sections
1. **Keyword Extraction** — required / preferred / domain-specific from job description
2. **Current Match Score** — with gap list
3. **Keywords to Add** — with recommended placement
4. **Formatting Issues** — with exact fixes
5. **Optimized Sections** — summary, skills, top 2-3 bullet rewrites
6. **Projected Match Score** — after optimizations
7. **ATS Compatibility Checklist**

---

## resume_bullet_writer

**Purpose:** Transform weak, duty-focused bullets into achievement-focused statements using the X-Y-Z formula ("Accomplished X as measured by Y by doing Z").

**Methodology highlights:**
- Always starts with active verb (Led, Built, Launched) — never "Responsible for" or "Helped with"
- Requires at least one quantifiable metric showing scale or impact
- When exact numbers unavailable: use ranges, minimums, approximations, or comparisons
- 1-2 lines maximum per bullet, one clear idea

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bullets` | string | Yes | One or more bullets to transform (one per line) |
| `role_context` | string | Yes | Role, company, and industry context |
| `metrics_available` | string | No | Any data or numbers that can be incorporated |
| `additional_context` | string | No | Any additional information |

### Output (per bullet)
1. **Diagnosis** — what's weak about the current bullet
2. **Discovery Questions** — to extract missing metrics
3. **2-3 Rewritten Versions** — different emphasis and length
4. **Recommended Version** — with explanation

---

## resume_formatter

**Purpose:** Audit and fix resume formatting for both ATS systems and human readers, covering fonts, margins, spacing, section order, and structure.

**Methodology highlights:**
- Dual audience: ATS systems parse text; humans scan in 6-10 seconds
- Page length: entry level 1 page, mid-level 1-2 pages, senior/executive 2 pages (max 3 for C-suite)
- ATS-safe fonts only: Arial, Calibri, Helvetica, Times New Roman, Georgia
- Absolute prohibitions: tables, text boxes, multi-column layouts, skill bars, images

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resume` | string | Yes | Resume text to format |
| `career_level` | string | Yes | One of: `entry_level`, `mid_level`, `senior_executive` |
| `additional_context` | string | No | Any additional information |

### Output Sections
1. **Formatting Audit** — all issues with severity (critical/major/minor)
2. **Specific Fixes** — for each issue
3. **Recommended Document Setup** — font, sizes, margins, spacing
4. **Reformatted Contact Block**
5. **Reformatted Experience Entries** — top 2 roles
6. **ATS Compatibility Score** — before and after
7. **Pre-Submission Checklist**

---

## resume_quantifier

**Purpose:** Add data-driven metrics to every resume bullet using six metric categories and estimation methodology when exact data is unavailable.

**Methodology highlights:**
- Resumes with numbers get 30% more recruiter attention; quantified bullets are 40% more memorable
- Six categories: money, time, percentages, volume, quality, frequency
- Estimation: conservative range lower bounds, time projections, percentage calculations from known totals
- Team contribution: quantify YOUR specific contribution, not team total

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bullets` | string | Yes | Bullets to quantify (one per line) |
| `role_context` | string | Yes | Role and industry context |
| `data_available` | string | No | Any raw data or numbers to draw from |
| `additional_context` | string | No | Any additional information |

### Output (per bullet)
1. **Weakness Assessment** — current bullet's shortcomings
2. **Discovery Questions** — to surface hidden metrics
3. **Estimated Metrics** — or bracketed placeholders if no data provided
4. **Two Quantified Versions** — conservative and optimistic
5. **Final Recommended Version**

---

## resume_section_builder

**Purpose:** Build targeted resume sections (summary, skills, experience, education) tailored to career stage and target role with recommended section order.

**Methodology highlights:**
- Summary formula by stage: entry (education + skills + target), mid (function + years + metric + value), senior (transformation + scope + track record), career changer (transferable skills + bridge statement)
- Never: "Seeking a challenging position", "hard-working team player", "results-oriented professional"
- Section order varies by role type: standard, technical, recent graduate, executive, career changer

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

### Output Sections
1. **Recommended Section Order** — with rationale
2. **Professional Summary** — written and ready to use
3. **Skills Section** — organized with category structure
4. **Experience Section Guidance** — bullets per role, emphasis guidance
5. **Education Section** — formatted for career stage
6. **Additional Section Recommendations** — what to include and exclude
7. **Section-Building Checklist**

---

## resume_tailor

**Purpose:** Tailor a master resume to a specific job posting by selecting and emphasizing the most relevant experience, keywords, and achievements without fabrication.

**Methodology highlights:**
- Core philosophy: tailoring = selecting which books to display from your library, not writing new ones
- Acceptable: reorder, rewrite emphasis, match terminology, adjust summary, add/remove optional sections
- Never acceptable: invented skills, falsified metrics, changed job titles/dates, fictional roles
- Master resume strategy: maintain one comprehensive master; create named tailored versions

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resume` | string | Yes | Master resume or current resume |
| `job_description` | string | Yes | Full job posting text |
| `company_name` | string | Yes | Target company |
| `role_title` | string | Yes | Role being applied for |
| `additional_context` | string | No | Any additional information |

### Output Sections
1. **Keyword Extraction** — required / preferred / cultural signals
2. **Resume Audit** — match analysis against this specific role
3. **Tailored Professional Summary**
4. **Skills Section** — reordered with gaps addressed
5. **Top 3 Bullet Rewrites**
6. **Sections to Add or Remove**
7. **Red Flags for Cover Letter**
8. **Pre-Submission Checklist** — 10-point verification

---

## resume_version_manager

**Purpose:** Organize and maintain multiple resume versions using a master resume strategy, structured folder system, naming conventions, and application tracking.

**Methodology highlights:**
- Master resume: comprehensive document with ALL experiences and bullet variants — never edit directly for applications
- File naming: `[LastName]_[Role]_[Company]_[MonthYear].pdf`
- Folder structure: `Master/`, `Tailored/[RoleType]/`, `CoverLetters/`, `Applications/`
- Update triggers: new job, major project, new skills/certs, quarterly refresh

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `master_resume` | string | No | Current resume or experience (to build the master from) |
| `existing_versions` | string | No | Description of existing resume files/versions |
| `target_roles` | string | No | Target roles and industries |
| `job_applications` | string | No | Current or recent job applications being tracked |
| `additional_context` | string | No | Any additional information |

### Output Sections
1. **Master Resume Structure** — sections and bullet organization
2. **Version Categories** — recommended categories for target roles
3. **Folder Structure & Naming Convention** — tailored to their situation
4. **Application Tracker Template** — customized with all columns
5. **Master → Tailored Workflow Checklist**
6. **Update Schedule & Triggers**
7. **Version Audit** — consolidation plan if existing files described

---

## tech_resume_optimizer

**Purpose:** Optimize resumes for software engineering, product management, data, and DevOps roles with tech-specific bullet formulas, skills section structure, and ATS keyword matching.

**Methodology highlights:**
- Technical bullet formula: `[Action Verb] + [Technical What] + [Scale/Impact] + [Technology Used]`
- Technical skills organized by: Languages, Frameworks, Databases, Cloud/Infrastructure, Tools
- Scale metrics to use: DAU/MAU, requests/second, data volume, uptime %, latency before→after
- Projects section critical for junior/career changers; GitHub profile must have 6 pinned repos

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resume` | string | Yes | Current resume |
| `role_type` | string | Yes | e.g. `software_engineer`, `data_engineer`, `devops_sre`, `technical_pm` |
| `job_description` | string | No | Target job posting (enables ATS keyword analysis) |
| `career_level` | string | No | e.g. `junior`, `mid`, `senior`, `staff`, `principal` |
| `additional_context` | string | No | Any additional information |

### Output Sections
1. **Technical Skills Section** — restructured and categorized for the role
2. **Experience Improvements** — current bullet → improved bullet rewrites per role
3. **Projects Section** — new or improved
4. **GitHub & Portfolio Recommendations**
5. **ATS Keyword Gaps** — if job description provided
6. **Tech-Specific Checklist** — GitHub, skills completeness, technical depth
