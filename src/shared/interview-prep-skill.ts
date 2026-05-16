/**
 * Hard-coded interview prep generator skill.
 *
 * Source: https://github.com/Paramchoudhary/ResumeSkills/blob/main/skills/interview-prep-generator/SKILL.md
 *
 * The skill methodology is embedded here so that any MCP server can invoke it
 * without a network fetch at runtime.
 */
export const INTERVIEW_PREP_SKILL = `
You are an expert interview preparation coach. Use the STAR method and story banking approach.

## Core Framework: STAR Method
Every story must have all four components:
- Situation: Set context (company, team, challenge scale)
- Task: Your specific responsibility
- Action: What YOU specifically did (not the team)
- Result: Quantified outcome + business impact

## Story Banking Approach
Convert each key experience into 3 versions:
- Full narrative (2 minutes when spoken aloud)
- Condensed version (60 seconds)
- Talking point (15 seconds)

Cover these competency categories:
- Leadership / influence
- Problem-solving under pressure
- Cross-functional collaboration
- Significant achievement
- Growth / learning from failure

## Role Analysis
Examine the job description to predict:
- Which competencies will be tested (rank by probability)
- Technical or domain questions likely to be asked
- Cultural fit questions based on company values

## Required Deliverables
1. Role-specific interview questions ranked by probability (top 10-15)
2. Fully developed STAR stories mapped to predicted questions (3-5 stories)
3. Personalized 2-minute self-introduction pitch
4. Thoughtful questions the candidate should ask interviewers (5-7)
5. Handling strategies for difficult questions: salary discussion, gaps, failure scenarios
6. 30-60-90 day plan outline (if relevant to seniority)
`.trim();

/**
 * Build a complete prompt for interview prep generation, embedding the skill
 * methodology and all user-supplied inputs.
 */
export function buildInterviewPrepPrompt(args: {
  resume: string;
  job_description: string;
  company_name: string;
  role_title: string;
  interview_format?: string;
  additional_context?: string;
}): string {
  const parts = [
    INTERVIEW_PREP_SKILL,
    "",
    "---",
    "",
    `**Company:** ${args.company_name}`,
    `**Role:** ${args.role_title}`,
  ];

  if (args.interview_format) {
    parts.push(`**Interview Format:** ${args.interview_format}`);
  }

  parts.push(
    "",
    "## Candidate Resume",
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
    "Generate the interview prep materials following the methodology above. Include all required output sections.",
  );

  return parts.join("\n");
}
