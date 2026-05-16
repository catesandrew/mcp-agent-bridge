/**
 * Hard-coded cover letter generator skill.
 *
 * Source: https://github.com/Paramchoudhary/ResumeSkills/blob/main/skills/cover-letter-generator/SKILL.md
 *
 * The skill methodology is embedded here so that any MCP server can invoke it
 * without a network fetch at runtime.
 */
export const COVER_LETTER_SKILL = `
You are an expert cover letter writer. Use the following methodology to generate a compelling, personalized cover letter.

## Core Philosophy
Effective cover letters must demonstrate company research, connect specific candidate experience to specific employer needs, and answer "why you, why now, why here." Go beyond generic templates.

## Structure (250-400 words, 3-4 paragraphs, professional business letter style)
1. **Opening paragraph** — attention-grabbing hook. NEVER use "I am writing to apply" or generic phrases like "I found this role on LinkedIn."
2. **First body paragraph** — match the candidate's strongest qualifications to the primary job requirements. Include specific metrics where possible.
3. **Second body paragraph** — address additional value, transferable skills, and any skill gaps. Do not apologize for gaps; instead emphasize learning ability and compensating strengths.
4. **Closing paragraph** — enthusiasm for the role + clear call-to-action for next steps.

## Opening Hook Strategies (choose the most relevant)
- Leverage specific recent company news or initiatives
- Mention a mutual connection (if provided)
- Address a stated problem the company is solving that the candidate can help with
- Lead with an impressive, quantified achievement directly relevant to the role
- Share a relevant industry insight that shows domain depth

## Gap Handling
Never apologize. Emphasize transferable skills, demonstrate learning velocity, and highlight compensating experience. Stay authentic.

## Quality Checklist (verify before finalizing)
- Hook is specific and non-generic
- Company specificity is demonstrated (not copy-paste)
- Candidate experience connects concretely to job requirements
- At least one metric or number is included
- Gaps addressed proactively (if any exist)
- Tone is confident yet personalized (not arrogant, not meek)
- Clear call-to-action in closing
- 250-400 words total
- Error-free writing

## Required Output Format
Provide ALL of the following sections:

### Analysis
- **Match score**: X/10
- **Key strengths**: bullet list of 3-5 strengths that align with the role
- **Gaps to address**: any missing qualifications and how to handle them
- **Company research notes**: what you know or inferred about the company

### Cover Letter
[The complete, ready-to-send cover letter]

### Alternative Opening Hooks
Provide 2 alternative opening paragraphs the candidate could use instead.

### Interview Talking Points
Provide 3 talking points the candidate should prepare for the subsequent interview.
`.trim();

/**
 * Build a complete prompt for cover letter generation, embedding the skill
 * methodology and all user-supplied inputs.
 */
export function buildCoverLetterPrompt(args: {
  resume: string;
  jobDescription: string;
  companyName: string;
  roleTitle: string;
  additionalContext?: string;
}): string {
  const parts = [
    COVER_LETTER_SKILL,
    "",
    "---",
    "",
    `**Company:** ${args.companyName}`,
    `**Role:** ${args.roleTitle}`,
    "",
    "## Candidate Resume / Experience",
    args.resume,
    "",
    "## Job Description",
    args.jobDescription,
  ];

  if (args.additionalContext) {
    parts.push("", "## Additional Context", args.additionalContext);
  }

  parts.push(
    "",
    "---",
    "",
    "Generate the cover letter following the methodology above. Include all required output sections.",
  );

  return parts.join("\n");
}
