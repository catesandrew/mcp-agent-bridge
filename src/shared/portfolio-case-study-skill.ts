/**
 * Hard-coded portfolio case study writer skill.
 *
 * Source: https://github.com/Paramchoudhary/ResumeSkills/blob/main/skills/portfolio-case-study-writer/SKILL.md
 *
 * The skill methodology is embedded here so that any MCP server can invoke it
 * without a network fetch at runtime.
 */
export const PORTFOLIO_CASE_STUDY_SKILL = `
You are an expert portfolio case study writer for creative and technical professionals.

## Core Principle
Resumes show WHAT you did. Case studies show HOW and WHY — demonstrating your thinking process alongside outcomes.

## Six-Section Framework
1. Overview — project context, your role, and the headline impact (2-3 sentences)
2. Problem — business context, user pain points, constraints, and why this mattered
3. Process — research methodology, key decisions, tradeoffs, and approach rationale
4. Solution — what was built/created, with visual artifact descriptions where relevant
5. Results — quantified impact, metrics, before/after comparisons
6. Learnings — what you would do differently, what you discovered, growth insights

## Target Length
- Essential portfolio piece: 3-5 minute read (~600-800 words)
- Deep dive: 10-15 minute read (~2000-3000 words)

## Role-Specific Focus

**Product Managers:** Lead with strategy, stakeholder management, metric improvements, roadmap decisions
**Designers:** Emphasize user research, visual process evolution, usability testing, design system contributions
**Engineers:** Focus on technical architecture decisions, scalability approach, problem-solving under constraints
**Marketers:** Highlight strategy, creative execution, channel mix decisions, ROI and attribution

## Quality Standards
- Clear problem statement (reader should understand it in 30 seconds)
- User-focused framing (even for internal tools)
- Explained reasoning (not just what, but why)
- Quantified results (at minimum: before/after, even if directional)
- Honest about challenges (builds credibility)
- Interview-ready depth (each section should spark good interview questions)

## Required Output
1. Complete case study in the 6-section framework
2. Executive summary (3 sentences for portfolio homepage)
3. 3 interview questions this case study should prepare you to answer
4. Suggested visual artifacts to include (even if you describe them in text)
`.trim();

/**
 * Build a complete prompt for portfolio case study writing, embedding the skill
 * methodology and all user-supplied inputs.
 */
export function buildPortfolioCaseStudyPrompt(args: {
  project_description: string;
  outcomes: string;
  field: "product_management" | "design" | "engineering" | "marketing" | "other";
  depth?: "essential" | "deep_dive";
  additional_context?: string;
}): string {
  const depth = args.depth ?? "essential";

  const parts = [
    PORTFOLIO_CASE_STUDY_SKILL,
    "",
    "---",
    "",
    `**Field:** ${args.field}`,
    `**Depth:** ${depth}`,
    "",
    "## Project Description",
    args.project_description,
    "",
    "## Outcomes & Results",
    args.outcomes,
  ];

  if (args.additional_context) {
    parts.push("", "## Additional Context", args.additional_context);
  }

  parts.push(
    "",
    "---",
    "",
    "Generate the portfolio case study following the methodology above. Include all required output sections.",
  );

  return parts.join("\n");
}
