import { describe, it, expect } from "vitest";
import { buildReviewPrGhPrompt } from "../pr-gh-review-skill.js";

describe("buildReviewPrGhPrompt", () => {
  it("substitutes pr number", () => {
    const result = buildReviewPrGhPrompt({ pr: "42" });
    expect(result).toContain("42");
    expect(result).not.toContain("${input:pr}");
  });

  it("substitutes repo when provided", () => {
    const result = buildReviewPrGhPrompt({ pr: "42", repo: "org/my-service" });
    expect(result).toContain("org/my-service");
    expect(result).not.toContain("${input:repo}");
  });

  it("leaves repo placeholder empty when not provided", () => {
    const result = buildReviewPrGhPrompt({ pr: "42" });
    expect(result).not.toContain("${input:repo}");
  });

  it("returns a non-empty string with phase headers", () => {
    const result = buildReviewPrGhPrompt({ pr: "42" });
    expect(result).toContain("Phase 1");
    expect(result).toContain("Phase 4");
    expect(result.length).toBeGreaterThan(500);
  });
});
