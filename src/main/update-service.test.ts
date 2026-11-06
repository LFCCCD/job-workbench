import { describe, expect, it } from "vitest";
import { compareVersions } from "./update-service";

describe("update version comparison", () => {
  it("compares stable and prerelease versions", () => {
    expect(compareVersions("0.2.0", "0.1.0")).toBe(1);
    expect(compareVersions("v0.1.0", "0.1.0")).toBe(0);
    expect(compareVersions("0.1.0-m1", "0.1.0")).toBe(-1);
    expect(compareVersions("0.2.0-m2", "0.2.0-m1")).toBe(1);
    expect(compareVersions("0.1.10", "0.1.2")).toBe(1);
  });
});
