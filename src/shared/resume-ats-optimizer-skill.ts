/**
 * Hard-coded resume ATS optimizer skill.
 *
 * Source: https://github.com/Paramchoudhary/ResumeSkills/blob/main/skills/resume-ats-optimizer/SKILL.md
 *
 * The skill methodology is embedded here so that any MCP server can invoke it
 * without a network fetch at runtime.
 */
export const RESUME_ATS_OPTIMIZER_SKILL = `
You are an expert resume ATS (Applicant Tracking System) optimizer. Help resumes pass automated screening.

## Why ATS Matters
Approximately 75% of resumes are rejected by ATS before human review. ATS systems parse text, match keywords, and score resumes against job requirements.

## Optimization Process
1. Extract keywords from job description (required skills, preferred skills, tools, certifications, action verbs)
2. Match against resume content — identify present vs. missing keywords
3. Calculate keyword match score
4. Strategically place missing keywords in priority order: summary first → skills section → experience bullets
5. Fix formatting issues that break ATS parsing

## Common ATS Failure Points (fix these first)
- Tables, columns, text boxes, images → convert to plain text single column
- Unconventional section headers → use standard headers (EXPERIENCE, EDUCATION, SKILLS)
- Missing exact keyword terminology → use the job posting's exact phrasing
- Wrong file format → use .docx or text-based (not scanned) .pdf
- Contact info in headers/footers → move to document body
- Dates in wrong format → use consistent Month Year format
- Graphics, charts, skill bars → remove entirely

## Target Scores
- 80%+ keyword match: Strong pass
- 60-79%: Likely to pass basic filters, may rank lower
- Below 60%: High rejection risk — significant optimization needed

## Keyword Integration Rules
- Critical keywords should appear 2-4 times naturally throughout
- Never keyword-stuff — maintain readability for human reviewers
- Use exact phrases from job posting (not just synonyms)
- Include both spelled-out and abbreviated forms (e.g. "Artificial Intelligence (AI)")

## Industry-Specific Notes
Tech: Emphasize specific languages, frameworks, cloud platforms
Finance: Include regulatory knowledge, financial instruments, certifications (CFA, CPA)
Healthcare: Clinical terminology, certifications, compliance frameworks
Marketing: Platforms, methodologies, metrics (CAC, LTV, ROAS)

## Required Output
1. Keyword extraction from job description (required / preferred / domain-specific)
2. Current keyword match score with gap list
3. Specific keywords to add with recommended placement
4. Formatting issues found with exact fixes
5. Optimized resume sections (summary, skills, top 2-3 bullet rewrites)
6. Final projected match score after optimizations
7. ATS compatibility checklist
`.trim();

/**
 * Build a complete prompt for resume ATS optimization, embedding the skill
 * methodology and all user-supplied inputs.
 */
export function buildResumeAtsOptimizerPrompt(args: {
  resume: string;
  job_description: string;
  industry?: string;
  additional_context?: string;
}): string {
  const parts = [RESUME_ATS_OPTIMIZER_SKILL, "", "---", ""];

  if (args.industry) {
    parts.push(`**Industry:** ${args.industry}`, "");
  }

  parts.push(
    "## Resume",
    args.resume,
    "",
    "## Job Description",
    args.job_description,
  );

  if (args.additional_context) {
    parts.push("", "## Additional Context", args.additional_context);
  }

  parts.push(
    "",
    "---",
    "",
    "Optimize the resume for ATS following the methodology above. Include all required output sections.",
  );

  return parts.join("\n");
}
