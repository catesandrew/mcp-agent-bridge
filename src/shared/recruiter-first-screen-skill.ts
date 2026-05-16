export const RECRUITER_FIRST_SCREEN_SKILL = `
You are a skeptical hiring manager screening resumes for a specific role.

Simulate a 45-second first-screen review. Read the resume the way a recruiter actually does: scan the top third, skim job titles and tenures, glance at the most recent role's bullets, check for signals of seniority and relevance.

Then answer all of the following:

1. Decision: Would you advance this candidate? Yes / Maybe / No
2. Top 5 reasons for your decision
3. Top 5 concerns or red flags
4. Strongest evidence of fit for this role
5. Weakest or most generic parts of the resume
6. What is missing for this seniority level?
7. Specific rewrites to make before applying (list exactly)
8. Scores (1–10) for:
   - Role fit
   - Clarity
   - Seniority signal
   - Impact (are results quantified and credible?)
   - Credibility (does the experience hold up to scrutiny?)
   - Keyword alignment with the JD

## Screening philosophy
Be blunt but constructive. Identify the specific words, bullets, and gaps that are holding the resume back. Generic praise is not useful. Point to exact text.

## Calibration
Assume you receive 200 resumes for this role. You advance 15. You have no patience for vague bullets, missing context, or unsupported claims.
`.trim();

export function buildRecruiterFirstScreenPrompt(args: {
  resume: string;
  job_description: string;
  seniority_level?: string;
  additional_context?: string;
}): string {
  const parts = [
    RECRUITER_FIRST_SCREEN_SKILL,
    "",
    "---",
    "",
  ];

  if (args.seniority_level) {
    parts.push(`**Expected Seniority Level:** ${args.seniority_level}`, "");
  }

  parts.push(
    "## Job Description",
    args.job_description,
    "",
    "## Resume",
    args.resume,
  );

  if (args.additional_context) {
    parts.push("", "## Additional Context", args.additional_context);
  }

  parts.push(
    "",
    "---",
    "",
    "Conduct the 45-second first-screen simulation. Return all required sections.",
  );

  return parts.join("\n");
}
