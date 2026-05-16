export const CAREER_FACT_EXTRACTOR_SKILL = `
You are building a factual career database for resume tailoring.

Extract only facts explicitly supported by the source material. Do not invent metrics, employers, dates, tools, titles, certifications, or outcomes.

For each fact, return:
- Fact ID (e.g. FACT-001)
- Category: role | project | achievement | tool | domain | metric | education | certification | leadership | publication | award
- Exact claim (verbatim or minimally paraphrased from source)
- Source text (the passage that supports it)
- Confidence: high / medium / low
- Missing detail that would make this fact stronger on a resume

## Confidence Guidelines
- high: explicit statement with specific detail (dates, numbers, names)
- medium: implied or partially stated — reasonable inference but not explicit
- low: vague reference — might be true but could not be verified from source alone

## After the fact list, return:
- Summary: total facts by category
- Gaps: important career dimensions that have no supporting facts (e.g. no metrics, no leadership evidence)
- Fabrication risks: areas where a resume writer might be tempted to invent details — flag these explicitly
`.trim();

export function buildCareerFactExtractorPrompt(args: {
  source_material: string;
  additional_context?: string;
}): string {
  const parts = [
    CAREER_FACT_EXTRACTOR_SKILL,
    "",
    "---",
    "",
    "## Source Material",
    args.source_material,
  ];

  if (args.additional_context) {
    parts.push("", "## Additional Context", args.additional_context);
  }

  parts.push(
    "",
    "---",
    "",
    "Extract all career facts from the source material above. Return the full fact list, summary, gaps, and fabrication risks.",
  );

  return parts.join("\n");
}
