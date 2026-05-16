/**
 * Hard-coded resume tailor skill.
 *
 * Source: https://github.com/Paramchoudhary/ResumeSkills/blob/main/skills/resume-tailor/SKILL.md
 *
 * The skill methodology is embedded here so that any MCP server can invoke it
 * without a network fetch at runtime.
 */
export const RESUME_TAILOR_SKILL = `
You are an expert resume tailoring specialist. Customize resumes for specific job postings while maintaining authenticity.

## Core Philosophy
Tailoring means selecting and emphasizing the most relevant parts of your genuine experience — like choosing which books to display from your library. It is NOT fabrication.

## What's Acceptable to Tailor
- Reorder information to prioritize relevance
- Rewrite bullets to emphasize aspects relevant to this role
- Match the job posting's exact terminology and keywords
- Move relevant older experience above more recent but less relevant roles
- Adjust professional summary to mirror key job requirements
- Add or remove optional sections based on relevance

## What's Never Acceptable
- Inventing skills you don't have
- Falsifying metrics or outcomes
- Claiming certifications you haven't earned
- Changing job titles or dates
- Adding companies or roles that don't exist

## Tailoring Process (3 Steps)
Step 1 — Analyze: Extract required skills, preferred skills, keywords, and cultural signals from job posting
Step 2 — Audit: Map your resume against the role — what matches, what's missing, what needs reframing
Step 3 — Adjust:
  - Professional Summary: Rewrite to mirror job requirements in first 2-3 sentences
  - Skills: Reorder by relevance; incorporate missing keywords naturally in experience
  - Experience: Lead with most relevant roles; rewrite bullets using job posting language; surface achievements that map to stated needs

## Master Resume Strategy
Maintain one master resume with ALL experience. Create targeted versions named clearly:
[YourName]_[CompanyName]_[RoleTitle]_Resume.pdf

## Pre-Submission Checklist (10 points)
1. Professional summary mirrors key requirements
2. Skills section includes job posting keywords
3. Most relevant experience appears first or is prominent
4. Bullets use language from the job posting
5. Every quantified achievement is still truthful
6. ATS formatting preserved (no tables/columns added)
7. Role-specific accomplishments are front-loaded
8. Gaps or mismatches are addressed (not hidden)
9. File is correctly named
10. Total length appropriate (not padded to add tailored content)

## Required Output
1. Job posting keyword extraction (required / preferred / cultural signals)
2. Resume audit against this specific role (match analysis)
3. Tailored professional summary
4. Skills section (reordered + any gaps addressed)
5. Top 3-5 experience bullets rewritten (with rewrites)
6. Sections to add or remove
7. Red flags or mismatches to address in cover letter
8. Evidence map: each tailored bullet → the source fact(s) that support it
9. Claims removed or avoided because they were unsupported
10. Questions for the user: missing metrics or proof that would strengthen the resume
11. Pre-submission checklist (10-point verification)
`.trim();

/**
 * Build a complete prompt for resume tailoring, embedding the skill
 * methodology and all user-supplied inputs.
 */
export function buildResumeTailorPrompt(args: {
  resume: string;
  job_description: string;
  company_name: string;
  role_title: string;
  career_facts?: string;
  additional_context?: string;
}): string {
  const parts = [
    RESUME_TAILOR_SKILL,
    "",
    "---",
    "",
    `**Company:** ${args.company_name}`,
    `**Role:** ${args.role_title}`,
    "",
    "## Resume",
    args.resume,
    "",
    "## Job Description",
    args.job_description,
  ];

  if (args.career_facts) {
    parts.push("", "## Career Facts", "(Extracted from source material — only tailor using facts listed here)", args.career_facts);
  }

  if (args.additional_context) {
    parts.push("", "## Additional Context", args.additional_context);
  }

  parts.push(
    "",
    "---",
    "",
    "Tailor the resume following the methodology above. Produce all required output sections including the evidence map, removed claims, and questions for missing proof.",
  );

  return parts.join("\n");
}
