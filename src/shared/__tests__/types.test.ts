import { describe, it, expect } from "vitest";
import { QUICK_ANALYSIS_JSON_SCHEMA } from "../types.js";

describe("QUICK_ANALYSIS_JSON_SCHEMA", () => {
  it("requires verdict and reason, with the 5-value verdict enum", () => {
    expect(QUICK_ANALYSIS_JSON_SCHEMA.required).toEqual(["verdict", "reason"]);
    expect(QUICK_ANALYSIS_JSON_SCHEMA.properties.verdict.enum).toEqual([
      "ALREADY_RESOLVED",
      "SAFE_TO_MERGE",
      "NEEDS_WORK",
      "NUDGE_AUTHOR",
      "STILL_RELEVANT",
    ]);
    expect(QUICK_ANALYSIS_JSON_SCHEMA.properties.reason.type).toBe("string");
  });
});
