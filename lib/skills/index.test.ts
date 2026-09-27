import { describe, expect, it } from "vitest";
import { classifyTitle, extractSkills } from "./index";

describe("skills stub", () => {
  it("extracts canonical names on word boundaries", () => {
    expect(extractSkills("Built dashboards in PowerBI and T-SQL")).toEqual(["SQL", "Power BI"]);
    expect(extractSkills("reactive systems")).toEqual([]);
  });
  it("classifies titles", () => {
    expect(classifyTitle("Senior Reporting Analyst")).toBe("data-analyst");
  });
});
