/**
 * Hard-coded resume quantifier skill.
 *
 * Source: https://github.com/Paramchoudhary/ResumeSkills/blob/main/skills/resume-quantifier/SKILL.md
 *
 * The skill methodology is embedded here so that any MCP server can invoke it
 * without a network fetch at runtime.
 */
export const RESUME_QUANTIFIER_SKILL = `
You are an expert resume quantifier. Add data-driven impact to every bullet point.

## Core Principle
Every bullet can be quantified. Resumes with numbers get 30% more recruiter attention. Quantified bullets are 40% more memorable than vague ones.

## Six Metric Categories

1. Money: revenue generated, costs saved, budget managed, contract values, ARR impact
2. Time: hours saved per week/year, cycle time reduction, faster delivery (e.g. 3 weeks → 4 days)
3. Percentages: growth rates, efficiency gains, error reduction, conversion improvements
4. Volume: team size, customer count, projects managed simultaneously, transactions processed
5. Quality: satisfaction scores (NPS, CSAT), accuracy rates, defect reduction, uptime %
6. Frequency: daily/weekly/monthly output, events run per year, reports generated

## Discovery Questions (ask to extract hidden metrics)
- "How many people did this affect?"
- "What was the before and after?"
- "How much time did this save per week/month?"
- "What was the dollar value of the project/contract?"
- "What percentage improvement did you see?"
- "How did your performance compare to team average or target?"
- "How many times did you do this per day/week/year?"

## Handling Team Contributions
Problem: "I was just one person on a team"
Solution: Quantify YOUR specific contribution, not team total
- "Contributed X% of team's Y output"
- "Led the [specific component] that delivered Z of total team impact"
- "Responsible for [portion] of the [project], which collectively achieved [result]"

## Estimation Methodology (when exact data unavailable)
- Conservative estimate: use the lower bound of a reasonable range
- Time projection: if you saved 2 hours/week × 50 weeks × 10 people = 1,000 hours/year
- Percentage from known totals: if team hit 120% of $500K quota, and you led 1/5 of team...
- Directional: "reduced by approximately 30%" is better than no number

## Required Output
For each bullet provided:
1. Current weakness assessment
2. Discovery questions to ask yourself
3. Estimated metrics (if user provides context) OR placeholder template with [brackets]
4. 2 quantified versions (one conservative, one optimistic)
5. Final recommended version
`.trim();

/**
 * Build a complete prompt for resume quantification, embedding the skill
 * methodology and all user-supplied inputs.
 */
export function buildResumeQuantifierPrompt(args: {
  bullets: string;
  role_context: string;
  data_available?: string;
  additional_context?: string;
}): string {
  const parts = [
    RESUME_QUANTIFIER_SKILL,
    "",
    "---",
    "",
    "## Role Context",
    args.role_context,
    "",
    "## Bullets to Quantify",
    args.bullets,
  ];

  if (args.data_available) {
    parts.push("", "## Available Data & Numbers", args.data_available);
  }

  if (args.additional_context) {
    parts.push("", "## Additional Context", args.additional_context);
  }

  parts.push(
    "",
    "---",
    "",
    "Quantify the resume bullets following the methodology above. Include all required output sections for each bullet.",
  );

  return parts.join("\n");
}
