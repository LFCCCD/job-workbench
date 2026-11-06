import {
  AiAnalysisResultSchema,
  type AiAnalysisResult,
  type AiEvidence,
  type AiJobContext,
  type AiResumeFactInput,
} from "../shared/contracts";

export const AI_PROMPT_VERSION = 1;
export const AI_SCHEMA_VERSION = 1;

export class AiEvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiEvidenceError";
  }
}

function normalize(value: string): string {
  return value.replace(/\s+/g, "").toLocaleLowerCase("zh-CN");
}

function factText(fact: AiResumeFactInput): string {
  return [
    fact.kind,
    fact.title,
    fact.organization,
    fact.role,
    fact.location,
    ...fact.bullets,
    ...fact.skills,
    fact.evidence,
  ]
    .filter(Boolean)
    .join("\n");
}

function validateEvidence(
  evidence: AiEvidence,
  context: AiJobContext,
  label: string,
) {
  const quote = normalize(evidence.quote);
  if (!quote) {
    throw new AiEvidenceError(`${label}的证据引用为空`);
  }
  if (evidence.source === "jd") {
    if (evidence.factId) {
      throw new AiEvidenceError(`${label}的 JD 证据不应包含 factId`);
    }
    if (!normalize(context.job.description).includes(quote)) {
      throw new AiEvidenceError(
        `${label}引用了 JD 中不存在的原句：${evidence.quote.slice(0, 120)}`,
      );
    }
    return;
  }
  if (!evidence.factId) {
    throw new AiEvidenceError(`${label}的事实证据缺少 factId`);
  }
  const fact = context.facts.find((candidate) => candidate.id === evidence.factId);
  if (!fact) {
    throw new AiEvidenceError(
      `${label}引用了不存在的已核实事实 ID：${evidence.factId}`,
    );
  }
  if (!normalize(factText(fact)).includes(quote)) {
    throw new AiEvidenceError(
      `${label}引用的事实内容与事实 ${fact.id} 不一致`,
    );
  }
}

export function validateAiAnalysis(
  value: unknown,
  context: AiJobContext,
): AiAnalysisResult {
  const result = AiAnalysisResultSchema.parse(value);
  for (const evidence of result.jobSummary.evidence) {
    validateEvidence(evidence, context, "岗位摘要");
  }
  if (!result.jobSummary.evidence.some((item) => item.source === "jd")) {
    throw new AiEvidenceError("岗位摘要必须引用至少一条 JD 原句");
  }

  for (const requirement of result.hardRequirements) {
    for (const evidence of requirement.evidence) {
      validateEvidence(evidence, context, `硬性要求“${requirement.requirement}”`);
    }
    if (
      ["satisfied", "partial"].includes(requirement.status) &&
      !requirement.evidence.some((item) => item.source === "fact")
    ) {
      throw new AiEvidenceError(
        `硬性要求“${requirement.requirement}”判定为已满足或部分满足，但没有事实证据`,
      );
    }
  }
  for (const bonus of result.bonuses) {
    for (const evidence of bonus.evidence) {
      validateEvidence(evidence, context, `加分项“${bonus.text}”`);
    }
  }
  for (const risk of result.risks) {
    for (const evidence of risk.evidence) {
      validateEvidence(evidence, context, `风险“${risk.title}”`);
    }
    if (!risk.evidence.some((item) => item.source === "jd")) {
      throw new AiEvidenceError(`风险“${risk.title}”必须包含 JD 证据`);
    }
  }
  if (
    result.resumeRecommendation.versionName &&
    !context.resumeVersions.some(
      (version) => version.name === result.resumeRecommendation.versionName,
    )
  ) {
    throw new AiEvidenceError(
      `推荐了不存在的简历版本：${result.resumeRecommendation.versionName}`,
    );
  }
  return result;
}

function jdSentences(context: AiJobContext): string[] {
  return context.job.description
    .split(/(?<=[。！？；\n])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function jdEvidence(
  context: AiJobContext,
  pattern: RegExp,
  allowFallback = false,
): AiEvidence | null {
  const sentence = jdSentences(context).find((item) => pattern.test(item));
  const quote = sentence || (allowFallback ? jdSentences(context)[0] : "");
  return quote
    ? { source: "jd", factId: null, quote: quote.slice(0, 1_500) }
    : null;
}

function factEvidence(
  fact: AiResumeFactInput,
  preferredPattern: RegExp,
): AiEvidence {
  const candidate =
    [...fact.bullets, ...fact.skills, fact.title, fact.role, fact.organization]
      .filter(Boolean)
      .find((text) => preferredPattern.test(text)) ||
    fact.bullets[0] ||
    fact.skills[0] ||
    fact.title;
  return { source: "fact", factId: fact.id, quote: candidate.slice(0, 1_000) };
}

function requirementTokens(text: string): string[] {
  const tokens = [
    "本科",
    "大专",
    "硕士",
    "经验不限",
    "应届",
    "1-3年",
    "SQL",
    "MySQL",
    "Java",
    "Linux",
    "实施",
    "交付",
    "客户沟通",
    "驻场",
    "出差",
    "测试",
    "数据",
  ];
  return tokens.filter((token) =>
    text.toLocaleLowerCase("zh-CN").includes(token.toLocaleLowerCase("zh-CN")),
  );
}

export function analyzeWithLocalRules(context: AiJobContext): AiAnalysisResult {
  if (!context.job.description.trim()) {
    throw new Error("岗位描述为空，请先补充 JD 后再分析");
  }
  const jd = context.job.description;
  const summaryEvidence = jdEvidence(
    context,
    /负责|职责|工作内容|实施|交付|支持|运维|开发|测试|数据/,
    true,
  )!;
  const workModeEvidence = jdEvidence(context, /驻场|现场|出差|远程|办公/);
  const factsText = context.facts.map(factText).join("\n");
  const requirementSentences = jdSentences(context)
    .filter(
      (sentence) =>
        /本科|大专|硕士|经验|年|SQL|MySQL|Java|Linux|实施|交付|客户沟通|驻场|出差|测试|数据/.test(
          sentence,
        ),
    )
    .slice(0, 7);
  const hardRequirements = requirementSentences.map((sentence) => {
    const tokens = requirementTokens(sentence);
    const matchingFact = context.facts.find((fact) => {
      const text = normalize(factText(fact));
      return tokens.some((token) => text.includes(normalize(token)));
    });
    const evidence: AiEvidence[] = [
      { source: "jd", factId: null, quote: sentence.slice(0, 1_500) },
    ];
    if (matchingFact) {
      evidence.push(factEvidence(matchingFact, new RegExp(tokens.join("|"), "i")));
    }
    return {
      requirement: sentence.slice(0, 500),
      status: matchingFact
        ? tokens.length > 1
          ? ("partial" as const)
          : ("satisfied" as const)
        : ("unknown" as const),
      evidence,
      note: matchingFact
        ? "本地规则找到相关事实，仍需人工确认职责范围是否等价"
        : "已核实事实中暂未找到直接证据",
    };
  });
  if (!hardRequirements.length) {
    hardRequirements.push({
      requirement: "学历、经验和技术要求",
      status: "unknown",
      evidence: [],
      note: "JD 没有拆分出明确的硬性要求，请人工核实",
    });
  }

  const bonuses = jdSentences(context)
    .filter((sentence) => /优先|加分|熟悉|了解|具备/.test(sentence))
    .slice(0, 6)
    .map((sentence) => ({
      text: sentence.slice(0, 500),
      evidence: [{ source: "jd" as const, factId: null, quote: sentence }],
    }));

  const riskRules: Array<{
    pattern: RegExp;
    severity: "high" | "medium" | "low";
    title: string;
    question: string;
  }> = [
    {
      pattern: /培训贷|贷款培训|培训费|押金|保证金/,
      severity: "high",
      title: "收费或培训贷风险",
      question: "入职或培训是否会产生任何费用？",
    },
    {
      pattern: /外包|派遣|第三方合同/,
      severity: "high",
      title: "外包或派遣风险",
      question: "劳动合同主体和实际工作单位分别是谁？",
    },
    {
      pattern: /销售|客户开发|业绩提成|纯提成/,
      severity: "medium",
      title: "岗位可能偏销售",
      question: "岗位是否有销售或业绩指标？",
    },
    {
      pattern: /驻场|长期出差|频繁出差|7x24|7×24/,
      severity: "medium",
      title: "驻场、出差或值班强度",
      question: "驻场地点、出差频率和值班安排是什么？",
    },
  ];
  const risks = riskRules.flatMap((rule) => {
    const evidence = jdEvidence(context, rule.pattern);
    return evidence
      ? [
          {
            severity: rule.severity,
            title: rule.title,
            evidence: [evidence],
            question: rule.question,
          },
        ]
      : [];
  });

  const matchingVersion =
    context.resumeVersions.find((version) => {
      const text = normalize(`${version.targetRole} ${version.name}`);
      return requirementTokens(context.job.title).some((token) =>
        text.includes(normalize(token)),
      );
    }) || context.resumeVersions[0];
  const gaps = hardRequirements
    .filter((requirement) => requirement.status === "unknown")
    .map((requirement) => `待核实：${requirement.requirement}`)
    .slice(0, 6);

  return {
    jobSummary: {
      responsibilities: summaryEvidence.quote.slice(0, 1_500),
      workMode: workModeEvidence?.quote.slice(0, 500) || "JD 未明确工作方式",
      evidence: [summaryEvidence],
    },
    hardRequirements,
    bonuses,
    risks,
    interviewQuestions: [
      {
        category: "技术",
        question: "结合项目经历说明你如何完成一次系统部署、配置或问题排查。",
        preparation: "从毕业设计、苍穹外卖二次开发或实习中选一个可解释的真实例子。",
      },
      {
        category: "业务",
        question: "当客户提出的需求无法直接实现时，你会如何确认和沟通？",
        preparation: "按确认现象、记录需求、评估影响、给出替代方案组织回答。",
      },
      {
        category: "项目",
        question: "介绍一个你参与过的最完整项目，以及你个人负责的部分。",
        preparation: "只陈述真实完成的内容，明确个人边界和可验证结果。",
      },
      {
        category: "行为",
        question: "如果需要在陌生现场快速学习新系统，你会怎么安排前两周？",
        preparation: "说明文档、流程、关键用户、问题清单和复盘节奏。",
      },
    ],
    questionsToAsk: [
      "这个岗位前三个月最主要的交付目标是什么？",
      "团队如何处理客户现场问题与研发排期之间的冲突？",
      "岗位是否需要驻场、出差或非工作时间值班？",
      "劳动合同主体、薪资结构和试用期安排是什么？",
    ],
    resumeRecommendation: {
      versionName: matchingVersion?.name || "",
      gaps,
    },
    confidence:
      context.facts.length === 0
        ? "low"
        : context.facts.length >= 3 && jd.length >= 200
          ? "medium"
          : "low",
    confidenceReason:
      context.facts.length === 0
        ? "当前没有已核实简历事实，只能判断 JD 要求，不能可靠判断个人匹配度"
        : `使用了 ${context.facts.length} 条已核实事实；本地规则不能替代对项目深度的语义判断`,
    unknowns: [
      ...(context.facts.length ? [] : ["缺少已核实简历事实"]),
      ...(summaryEvidence ? [] : ["JD 信息不足"]),
      "最终投递前仍需人工核实岗位职责、合同主体和工作地点",
    ],
  };
}

function extractJson(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new AiEvidenceError("模型没有返回有效 JSON");
  }
}

export function buildAiPrompt(context: AiJobContext): string {
  return [
    "你是求职分析器，只能依据下面的 JD 和已核实事实输出 JSON。",
    "不得编造项目、职责、指标、技能或简历版本。",
    "所有 JD 证据 quote 必须逐字来自 JD；所有事实证据 quote 必须逐字来自对应 factId 的字段。",
    "factId 只能使用输入中的已核实事实 ID。无法判断时用 unknown 或写入 unknowns。",
    "hardRequirements 中 satisfied/partial 至少包含一条 fact 证据；risks 至少包含一条 jd 证据。",
    "resumeRecommendation.versionName 只能使用输入的简历版本名称，没有合适版本时留空。",
    "输出必须严格符合以下 JSON 结构，不要添加 Markdown 或解释：",
    JSON.stringify(
      {
        jobSummary: {
          responsibilities: "string",
          workMode: "string",
          evidence: [
            { source: "jd", factId: null, quote: "JD 原句" },
          ],
        },
        hardRequirements: [
          {
            requirement: "string",
            status: "satisfied|partial|missing|unknown",
            evidence: [
              { source: "jd", factId: null, quote: "JD 原句" },
              { source: "fact", factId: "事实ID", quote: "事实原文" },
            ],
            note: "string",
          },
        ],
        bonuses: [
          {
            text: "string",
            evidence: [
              { source: "jd", factId: null, quote: "JD 原句" },
            ],
          },
        ],
        risks: [
          {
            severity: "high|medium|low",
            title: "string",
            evidence: [
              { source: "jd", factId: null, quote: "JD 原句" },
            ],
            question: "string",
          },
        ],
        interviewQuestions: [
          {
            category: "技术|项目|业务|行为",
            question: "string",
            preparation: "string",
          },
        ],
        questionsToAsk: ["string"],
        resumeRecommendation: {
          versionName: "现有版本名或空字符串",
          gaps: ["string"],
        },
        confidence: "high|medium|low",
        confidenceReason: "string",
        unknowns: ["string"],
      },
      null,
      2,
    ),
    "输入数据：",
    JSON.stringify(
      {
        job: {
          title: context.job.title,
          company: context.job.company,
          salary: context.job.salary,
          city: context.job.city,
          experience: context.job.experience,
          degree: context.job.degree,
          description: context.job.description.slice(0, 12_000),
        },
        verifiedFacts: context.facts,
        resumeVersions: context.resumeVersions,
      },
      null,
      2,
    ),
  ].join("\n");
}

export async function callOpenAiCompatible(input: {
  baseUrl: string;
  model: string;
  apiKey: string;
  prompt: string;
  signal: AbortSignal;
}): Promise<{
  result: AiAnalysisResult;
  promptTokens: number;
  completionTokens: number;
}> {
  const endpoint = `${input.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.2,
      max_tokens: 3_500,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "你只输出符合用户给定 JSON 结构的结构化求职分析，不输出 Markdown。",
        },
        { role: "user", content: input.prompt },
      ],
    }),
    signal: input.signal,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `AI Provider 请求失败（HTTP ${response.status}）：${text.slice(0, 500)}`,
    );
  }
  let data: {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    throw new AiEvidenceError("AI Provider 返回的响应不是 JSON");
  }
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new AiEvidenceError("AI Provider 没有返回分析内容");
  return {
    result: AiAnalysisResultSchema.parse(extractJson(content)),
    promptTokens: Number(data.usage?.prompt_tokens || 0),
    completionTokens: Number(data.usage?.completion_tokens || 0),
  };
}
