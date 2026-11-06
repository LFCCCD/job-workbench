import { describe, expect, it } from "vitest";
import {
  categorizeBossTitle,
  enrichBossCandidate,
  normalizeBossJob,
} from "./boss-collector";

describe("BOSS collector adapter", () => {
  it("normalizes a support role into a stable candidate", () => {
    const candidate = normalizeBossJob(
      {
        encryptJobId: "encrypted-job-1",
        securityId: "security-token",
        lid: "lid-token",
        jobName: "ERP实施工程师",
        brandName: "示例制造科技",
        salaryDesc: "7-10K",
        cityName: "宁波",
        areaDistrict: "鄞州区",
        jobExperience: "经验不限",
        jobDegree: "本科",
        brandIndustry: "制造业",
        brandScaleName: "100-499人",
        skills: ["SQL", "客户培训"],
      },
      "宁波",
      "软件实施工程师",
      "2026-11-07T08:00:00.000Z",
    );

    expect(candidate).toMatchObject({
      sourceKey: "boss:encrypted-job-1",
      title: "ERP实施工程师",
      company: "示例制造科技",
      category: "软件实施",
      city: "宁波",
      district: "鄞州区",
      sourceQueries: ["软件实施工程师"],
    });
    expect(candidate!.score).toBeGreaterThanOrEqual(60);
    expect(candidate!.link).toContain("securityId=security-token");
  });

  it("categorizes adjacent non-Java entry roles", () => {
    expect(categorizeBossTitle("MES实施顾问")).toBe("软件实施");
    expect(categorizeBossTitle("售后技术支持")).toBe("技术支持");
    expect(categorizeBossTitle("数据治理专员")).toBe("数据与信息化");
    expect(categorizeBossTitle("软件测试工程师")).toBe("软件测试");
  });

  it("raises obvious fee and sales risks in scoring", () => {
    const candidate = normalizeBossJob(
      {
        encryptJobId: "encrypted-job-2",
        jobName: "实施助理",
        brandName: "风险示例公司",
        salaryDesc: "6-20K",
        cityName: "杭州",
        jobExperience: "经验不限",
        jobDegree: "本科",
        brandIndustry: "企业服务",
        skills: ["电话销售"],
      },
      "杭州",
      "实施工程师",
      "2026-11-07T08:00:00.000Z",
    )!;
    const enriched = enrichBossCandidate({
      ...candidate,
      description: "入职前需要参加培训，收取岗前培训费。",
    });
    expect(enriched.score).toBeLessThan(candidate.score);
    expect(enriched.risks).toEqual(
      expect.arrayContaining([
        "出现收费或押金风险词",
        "岗位名称或技能带有明显非技术/销售属性",
      ]),
    );
  });
});
