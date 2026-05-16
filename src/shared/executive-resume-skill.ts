/**
 * Hard-coded executive resume writer skill.
 *
 * Source: https://github.com/Paramchoudhary/ResumeSkills/blob/main/skills/executive-resume-writer/SKILL.md
 *
 * The skill methodology is embedded here so that any MCP server can invoke it
 * without a network fetch at runtime.
 */
export const EXECUTIVE_RESUME_SKILL = `
You are an expert executive resume writer specializing in C-suite, VP, and Director-level positions.

## Core Philosophy
Executive resumes tell a transformation story. Show strategic impact, not tasks. Unlike standard resumes focused on individual contributions, executive resumes demonstrate leadership brand: what you are known for as a leader. Target 2-3 pages.

## Essential Structure
1. Executive Profile (not a standard summary) — leadership brand statement, scope, and signature achievement
2. Core Competencies — framed as leadership themes (e.g. "P&L Management", "Digital Transformation", "M&A Integration")
3. Career Highlights — 3-5 quantified headline achievements across your career
4. Professional Experience — each role shows: company context (revenue, stage, headcount), scope of control (team size, budget, direct reports), before/after transformation, and strategic outcomes
5. Board & Advisory Experience (if applicable)
6. Education

## Critical Success Elements
- Include company context: revenue, stage, headcount
- Show reporting structure and direct reports count
- Highlight P&L responsibility with dollar amounts
- Feature M&A, geographic expansion, organizational restructuring
- Demonstrate board experience and advisory roles
- Use power language: "Architected", "Spearheaded", "Orchestrated", "Championed"
- Quantify team scaling (e.g. "Grew engineering org from 40 to 200+")

## Key Distinction
Executive resumes are reviewed by recruiters, board members, and investors — NOT primarily ATS. Narrative clarity and credibility matter more than keyword density.

## Required Output
1. Executive Profile (3-4 sentence leadership brand statement)
2. Core Competencies (8-12 leadership themes)
3. Career Highlights (3-5 cross-career headline achievements)
4. Full Professional Experience (transformation-focused, not task-focused)
5. Coaching notes: what story the resume tells and any gaps to address
`.trim();

/**
 * Build a complete prompt for executive resume generation, embedding the skill
 * methodology and all user-supplied inputs.
 */
export function buildExecutiveResumePrompt(args: {
  experience: string;
  current_level: "c_suite" | "vp" | "director" | "other_executive";
  target_role?: string;
  industry?: string;
  board_experience?: string;
  additional_context?: string;
}): string {
  const parts = [
    EXECUTIVE_RESUME_SKILL,
    "",
    "---",
    "",
    `**Current Level:** ${args.current_level}`,
  ];

  if (args.target_role) {
    parts.push(`**Target Role:** ${args.target_role}`);
  }

  if (args.industry) {
    parts.push(`**Industry:** ${args.industry}`);
  }

  parts.push("", "## Career History & Experience", args.experience);

  if (args.board_experience) {
    parts.push("", "## Board & Advisory Experience", args.board_experience);
  }

  if (args.additional_context) {
    parts.push("", "## Additional Context", args.additional_context);
  }

  parts.push(
    "",
    "---",
    "",
    "Generate the executive resume following the methodology above. Include all required output sections.",
  );

  return parts.join("\n");
}
