import { describe, it, expect } from "vitest";
import { buildOpenPrGhPrompt } from "../pr-gh-open-skill.js";

describe("buildOpenPrGhPrompt", () => {
  it("substitutes baseBranch in output", () => {
    const result = buildOpenPrGhPrompt({ baseBranch: "main" });
    expect(result).toContain("main");
    expect(result).not.toContain("${input:baseBranch}");
  });

  it("defaults baseBranch to dev", () => {
    const result = buildOpenPrGhPrompt({});
    expect(result).toContain("dev");
    expect(result).not.toContain("${input:baseBranch}");
  });

  it("substitutes jiraBaseUrl when provided", () => {
    const result = buildOpenPrGhPrompt({ jiraBaseUrl: "https://jira.example.com/browse" });
    expect(result).toContain("https://jira.example.com/browse");
    expect(result).not.toContain("${input:jiraBaseUrl}");
  });

  it("substitutes reviewers when provided", () => {
    const result = buildOpenPrGhPrompt({ reviewers: "alice,bob" });
    expect(result).toContain("alice,bob");
    expect(result).not.toContain("${input:reviewers}");
  });

  it("substitutes draft flag", () => {
    const result = buildOpenPrGhPrompt({ draft: true });
    expect(result).toContain("true");
    expect(result).not.toContain("${input:draft}");
  });

  it("returns a non-empty string with phase headers", () => {
    const result = buildOpenPrGhPrompt({});
    expect(result).toContain("Phase 1");
    expect(result).toContain("Phase 5");
    expect(result.length).toBeGreaterThan(500);
  });
});
