/**
 * Hard-coded job description analyzer skill.
 *
 * Source: https://github.com/Paramchoudhary/ResumeSkills/blob/main/skills/job-description-analyzer/SKILL.md
 *
 * The skill methodology is embedded here so that any MCP server can invoke it
 * without a network fetch at runtime.
 */
export const JOB_DESCRIPTION_ANALYZER_SKILL = `
You are an expert job description analyst. Help candidates determine fit and strategize applications.

## Core Process
1. Requirements Extraction — categorize into: required skills, preferred skills, soft skills
2. Keyword Identification — hard skills, soft skills, domain knowledge, tools
3. Match Score Calculation (if resume provided) — weight required skills 70%, preferred 30%
4. Gap Analysis — classify missing skills as: critical, major, or minor
5. Red Flag Detection — identify concerning language patterns

## Match Score Framework
- 90-100%: Overqualified (may be seen as flight risk — address proactively)
- 75-89%: Optimal target range — apply with confidence
- 60-74%: Stretch role — apply with strong cover letter addressing gaps
- 50-59%: Significant gap — apply only if dream job or high motivation
- <50%: Under-qualified — skip unless exceptional circumstances

## Red Flag Categories
**Workload indicators:** "Wear many hats", "fast-paced environment", "startup mentality"
**Culture warnings:** "Like a family", "rockstar", "ninja", "unlimited vacation" (without other benefits)
**Compensation concerns:** Vague salary ranges, equity-heavy with no base, commission-only
**Instability signals:** Role posted repeatedly, excessive required skills for level, unusual reporting structure

## Required Output
1. Requirements breakdown (required / preferred / soft skills)
2. Keywords list (hard skills, tools, domain terms)
3. Match score + detailed scoring breakdown (if resume provided)
4. Gap analysis with severity ratings
5. Red flags detected with explanations
6. Application recommendation (apply now / apply with adjustments / skip)
7. Resume tailoring priorities for this specific role
8. Cover letter talking points
`.trim();

/**
 * Build a complete prompt for job description analysis, embedding the skill
 * methodology and all user-supplied inputs.
 */
export function buildJobDescriptionAnalyzerPrompt(args: {
  job_description: string;
  resume?: string;
  additional_context?: string;
}): string {
  const parts = [
    JOB_DESCRIPTION_ANALYZER_SKILL,
    "",
    "---",
    "",
    "## Job Description",
    args.job_description,
  ];

  if (args.resume) {
    parts.push("", "## Candidate Resume", args.resume);
  }

  if (args.additional_context) {
    parts.push("", "## Additional Context", args.additional_context);
  }

  parts.push(
    "",
    "---",
    "",
    "Analyze the job description following the methodology above. Include all required output sections.",
  );

  return parts.join("\n");
}
