import { describe, it, expect } from "vitest";
import { buildReviewPrAdoPrompt } from "../pr-ado-review-skill.js";

const REQUIRED = {
  prId: "1234",
  org: "https://dev.azure.com/myorg",
  project: "MyProject",
  repo: "my-service",
};

describe("buildReviewPrAdoPrompt", () => {
  it("substitutes all required inputs", () => {
    const result = buildReviewPrAdoPrompt(REQUIRED);
    expect(result).toContain("1234");
    expect(result).toContain("https://dev.azure.com/myorg");
    expect(result).toContain("MyProject");
    expect(result).toContain("my-service");
    expect(result).not.toContain("${input:prId}");
    expect(result).not.toContain("${input:org}");
    expect(result).not.toContain("${input:project}");
    expect(result).not.toContain("${input:repo}");
  });

  it("returns a non-empty string with phase headers", () => {
    const result = buildReviewPrAdoPrompt(REQUIRED);
    expect(result).toContain("Phase 1");
    expect(result).toContain("Phase 4");
    expect(result.length).toBeGreaterThan(500);
  });
});
