import { describe, expect, it } from "vitest";
import { isBossSiteUrl } from "./collector-browser";

describe("BOSS dedicated browser URL routing", () => {
  it("routes BOSS pages to the dedicated Edge profile", () => {
    expect(
      isBossSiteUrl(
        "https://www.zhipin.com/job_detail/example.html?securityId=test",
      ),
    ).toBe(true);
    expect(isBossSiteUrl("https://zhipin.com/")).toBe(true);
    expect(isBossSiteUrl("http://www.zhipin.com/")).toBe(true);
  });

  it("does not route lookalike or unrelated sites", () => {
    expect(isBossSiteUrl("https://zhipin.com.evil.example/job")).toBe(false);
    expect(isBossSiteUrl("https://evilzhipin.com/job")).toBe(false);
    expect(isBossSiteUrl("https://github.com/LFCCCD/job-workbench")).toBe(false);
    expect(isBossSiteUrl("file:///C:/Windows/System32/calc.exe")).toBe(false);
  });
});
