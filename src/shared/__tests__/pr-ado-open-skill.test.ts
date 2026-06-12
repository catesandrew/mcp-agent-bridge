import { describe, it, expect } from "vitest";
import { buildOpenPrAdoPrompt } from "../pr-ado-open-skill.js";

const REQUIRED = {
  org: "https://dev.azure.com/myorg",
  project: "MyProject",
  repo: "my-service",
};

describe("buildOpenPrAdoPrompt", () => {
  it("substitutes org, project, repo", () => {
    const result = buildOpenPrAdoPrompt(REQUIRED);
    expect(result).toContain("https://dev.azure.com/myorg");
    expect(result).toContain("MyProject");
    expect(result).toContain("my-service");
    expect(result).not.toContain("${input:org}");
    expect(result).not.toContain("${input:project}");
    expect(result).not.toContain("${input:repo}");
  });

  it("defaults baseBranch to dev", () => {
    const result = buildOpenPrAdoPrompt(REQUIRED);
    expect(result).toContain("dev");
    expect(result).not.toContain("${input:baseBranch}");
  });

  it("substitutes baseBranch when provided", () => {
    const result = buildOpenPrAdoPrompt({ ...REQUIRED, baseBranch: "main" });
    expect(result).toContain("main");
    expect(result).not.toContain("${input:baseBranch}");
  });

  it("substitutes workItems when provided", () => {
    const result = buildOpenPrAdoPrompt({ ...REQUIRED, workItems: "1234 5678" });
    expect(result).toContain("1234 5678");
    expect(result).not.toContain("${input:workItems}");
  });

  it("substitutes autoComplete flag", () => {
    const result = buildOpenPrAdoPrompt({ ...REQUIRED, autoComplete: true });
    expect(result).toContain("true");
    expect(result).not.toContain("${input:autoComplete}");
  });

  it("returns a non-empty string with phase headers", () => {
    const result = buildOpenPrAdoPrompt(REQUIRED);
    expect(result).toContain("Phase 1");
    expect(result).toContain("Phase 5");
    expect(result.length).toBeGreaterThan(500);
  });
});
