import { describe, expect, it } from "vitest";
import { renderResumeHtml } from "./resume-render";

describe("resume PDF renderer", () => {
  it("groups facts and escapes user-provided HTML", () => {
    const html = renderResumeHtml({
      profile: {
        fullName: "测试 <同学>",
        phone: "13800000000",
        email: "test@example.com",
        currentCity: "杭州",
        targetRoles: ["软件实施工程师"],
        summary: "真实概述",
        updatedAt: "2026-11-07T00:00:00.000Z",
      },
      facts: [
        {
          id: "1",
          kind: "项目经历",
          title: "采购平台",
          organization: "测试大学",
          role: "后端开发",
          startDate: "2025-09",
          endDate: "2026-05",
          location: "北京",
          bullets: ["完成设备查询", "<script>不应执行</script>"],
          skills: ["Java", "MySQL"],
          evidence: "论文",
          verified: true,
          sortOrder: 0,
          createdAt: "",
          updatedAt: "",
        },
      ],
      version: {
        id: "1",
        name: "实施岗位版",
        targetRole: "软件实施工程师",
        template: "implementation",
        summary: "",
        selectedFactIds: ["1"],
        includeUnverified: false,
        createdAt: "",
        updatedAt: "",
      },
    });
    expect(html).toContain("测试 &lt;同学&gt;");
    expect(html).toContain("&lt;script&gt;不应执行&lt;/script&gt;");
    expect(html).toContain("<h2>项目经历</h2>");
    expect(html).toContain("目标版本：实施岗位版");
  });
});
