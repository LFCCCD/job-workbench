import http from "node:http";
import { describe, expect, it } from "vitest";
import type { AiJobContext, JobRecord } from "../shared/contracts";
import {
  analyzeWithLocalRules,
  callOpenAiCompatible,
  validateAiAnalysis,
} from "./ai-analysis";

function createContext(): AiJobContext {
  const job: JobRecord = {
    id: "job-1",
    title: "ERP实施工程师",
    company: "示例制造科技",
    salary: "7-10K",
    city: "宁波",
    district: "鄞州区",
    experience: "经验不限",
    degree: "本科",
    category: "软件实施",
    score: 78,
    status: "待判断",
    favorite: false,
    notes: "",
    description:
      "负责ERP系统实施、客户培训和上线交付。需要了解SQL和MySQL，能够接受偶尔出差。有制造业项目经验优先。",
    link: "",
    archivedAt: null,
    createdAt: "2026-11-07T00:00:00.000Z",
    updatedAt: "2026-11-07T00:00:00.000Z",
  };
  return {
    job,
    facts: [
      {
        id: "12",
        kind: "项目",
        title: "电力设备采购平台",
        organization: "华北电力大学",
        role: "后端开发",
        startDate: "2025-09",
        endDate: "2026-05",
        location: "北京",
        bullets: ["使用 Java 和 MySQL 完成设备查询与采购流程接口"],
        skills: ["Java", "MySQL", "SQL"],
        evidence: "毕业设计材料",
      },
    ],
    resumeVersions: [
      {
        id: "1",
        name: "实施与技术支持",
        targetRole: "软件实施工程师",
        summary: "",
        selectedFactIds: ["12"],
      },
    ],
    factsVersion: "facts-v1",
  };
}

describe("AI analysis validation", () => {
  it("creates a local analysis with JD and fact evidence", () => {
    const context = createContext();
    const result = analyzeWithLocalRules(context);
    expect(() => validateAiAnalysis(result, context)).not.toThrow();
    expect(result.jobSummary.evidence[0]).toMatchObject({ source: "jd" });
    expect(result.hardRequirements.length).toBeGreaterThan(0);
    expect(result.interviewQuestions.length).toBeGreaterThanOrEqual(4);
  });

  it("rejects a JD quote that is not present in the source", () => {
    const context = createContext();
    const result = analyzeWithLocalRules(context);
    result.jobSummary.evidence[0].quote = "这句话不在岗位描述中";
    expect(() => validateAiAnalysis(result, context)).toThrow(
      "JD 中不存在",
    );
  });

  it("rejects evidence from an unverified or unknown fact", () => {
    const context = createContext();
    const result = analyzeWithLocalRules(context);
    result.hardRequirements[0].evidence.push({
      source: "fact",
      factId: "999",
      quote: "虚构事实",
    });
    expect(() => validateAiAnalysis(result, context)).toThrow(
      "已核实事实 ID",
    );
  });

  it("calls an OpenAI-compatible endpoint with structured JSON", async () => {
    const context = createContext();
    const localResult = analyzeWithLocalRules(context);
    let authorization = "";
    const server = http.createServer((request, response) => {
      authorization = String(request.headers.authorization || "");
      request.resume();
      request.on("end", () => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            choices: [
              { message: { content: JSON.stringify(localResult) } },
            ],
            usage: { prompt_tokens: 120, completion_tokens: 80 },
          }),
        );
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Test server did not start");
      }
      const response = await callOpenAiCompatible({
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        model: "test-model",
        apiKey: "test-key",
        prompt: "test prompt",
        signal: new AbortController().signal,
      });
      expect(response.promptTokens).toBe(120);
      expect(response.completionTokens).toBe(80);
      expect(response.result.confidence).toBe(localResult.confidence);
      expect(authorization).toBe("Bearer test-key");
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
