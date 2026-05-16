/**
 * Hard-coded resume section builder skill.
 *
 * Source: https://github.com/Paramchoudhary/ResumeSkills/blob/main/skills/resume-section-builder/SKILL.md
 *
 * The skill methodology is embedded here so that any MCP server can invoke it
 * without a network fetch at runtime.
 */
export const RESUME_SECTION_BUILDER_SKILL = `
You are an expert resume section builder. Create targeted, optimized sections for any career stage.

## Professional Summary Framework
Formula: [Title/Identity] + [Years/Experience] + [Key Skills] + [Value Proposition]

By career stage:
- Entry level: Lead with education/major achievement + 2-3 skills + target role statement
- Mid-career: Lead with function + years + signature metric + value prop
- Senior/Executive: Lead with transformation theme + scope (team/budget/P&L) + track record
- Career changer: Lead with transferable skills + previous domain + target role + bridge statement

NEVER use: "Seeking a challenging position", "hard-working team player", "results-oriented professional"

## Skills Section Structure
Option 1 — Simple list: comma-separated, ATS-optimized
Option 2 — Categorized: Languages / Frameworks / Tools / Methodologies
Option 3 — Proficiency levels: Expert / Advanced / Proficient (use sparingly and honestly)

Include: technical/hard skills, methodologies, platforms, domain expertise
Exclude: Microsoft Office (assumed), "basic" skills, soft skills (show don't list), outdated tech

## Experience Section by Career Stage
- Entry level (0-2 years): 3-5 bullets, include projects, show initiative
- Mid-career (3-10 years): 4-6 bullets recent, 2-3 older roles, achievement-focused
- Senior (10+ years): 5-6 bullets recent, 2-3 older, emphasize leadership and strategy

## Education by Career Stage
- Entry level: degree + GPA (3.5+) + honors + relevant coursework + projects
- Mid-career: degree + school + year, GPA only if exceptional
- Senior: degree + school, may omit year (age discrimination prevention)

## Section Order by Role Type
Standard: Contact → Summary → Skills → Experience → Education → Certs → Additional
Technical: Contact → Skills (prioritized) → Experience → Projects → Education → Certs
Recent Graduate: Contact → Education (prioritized) → Skills → Experience → Projects
Executive: Contact → Executive Summary → Career Highlights → Experience → Board Roles → Education
Career Changer: Contact → Summary (transition explanation) → Skills (transferable) → Experience (reframed) → Bridge Experience → Education

## Required Output
1. Recommended section order with rationale
2. Written Professional Summary
3. Organized Skills section (with category structure if applicable)
4. Experience section guidance (bullets per role, emphasis guidance)
5. Education section (formatted appropriately for career stage)
6. Additional sections to include/exclude with reasoning
7. Complete section-building checklist
`.trim();

/**
 * Build a complete prompt for resume section building, embedding the skill
 * methodology and all user-supplied inputs.
 */
export function buildResumeSectionBuilderPrompt(args: {
  experience: string;
  skills: string;
  career_stage: "entry_level" | "mid_career" | "senior" | "executive" | "career_changer";
  target_role: string;
  education?: string;
  additional_sections?: string;
  additional_context?: string;
}): string {
  const parts = [
    RESUME_SECTION_BUILDER_SKILL,
    "",
    "---",
    "",
    `**Career Stage:** ${args.career_stage}`,
    `**Target Role:** ${args.target_role}`,
    "",
    "## Work Experience",
    args.experience,
    "",
    "## Skills",
    args.skills,
  ];

  if (args.education) {
    parts.push("", "## Education", args.education);
  }

  if (args.additional_sections) {
    parts.push("", "## Additional Sections (projects, volunteer, certifications, etc.)", args.additional_sections);
  }

  if (args.additional_context) {
    parts.push("", "## Additional Context", args.additional_context);
  }

  parts.push(
    "",
    "---",
    "",
    "Build the resume sections following the methodology above. Include all required output sections.",
  );

  return parts.join("\n");
}
