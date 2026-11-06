import { createHash } from "node:crypto";
import { chromium } from "playwright-core";
import type { Browser, Page, Request } from "playwright-core";
import type {
  CollectorCacheEntry,
  CollectorCandidate,
  CollectorRequest,
} from "../shared/contracts";

type JsonRecord = Record<string, unknown>;

type CollectorProgress = (progress: number, message: string) => void;

type SearchResponse = {
  status: number;
  data: JsonRecord;
};

const BOSS_ORIGIN = "https://www.zhipin.com";
const BOSS_ENDPOINT = "http://127.0.0.1:9333";
const CACHE_TTL_MS = 6 * 60 * 60 * 1_000;
const RISK_PATTERN =
  /环境存在异常|访问频繁|操作频繁|请求过于频繁|稍后再试|安全验证|验证码异常/;
const LOGIN_PATTERN =
  /请先登录|登录已失效|登录失效|未登录|账号异常|重新登录/;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object"
    ? (value as JsonRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stripHtml(value: unknown): string {
  return asString(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 30_000);
}

function parseSalary(salaryText: string): { min: number; max: number } {
  const numbers = salaryText.match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
  if (!numbers.length) return { min: 0, max: 0 };
  return { min: Math.min(...numbers), max: Math.max(...numbers) };
}

export function categorizeBossTitle(title: string): string {
  if (/实施|交付|erp|mes|wms|crm|scada|驻场/i.test(title)) {
    return "软件实施";
  }
  if (/技术支持|售后|运维|运维服务|客户成功/i.test(title)) {
    return "技术支持";
  }
  if (/数据治理|数据运营|数据分析|数据标注|信息化|数字化/i.test(title)) {
    return "数据与信息化";
  }
  if (/测试|质量保障|qa/i.test(title)) return "软件测试";
  if (/java|后端|开发工程师|研发/i.test(title)) return "软件开发";
  return "其他技术";
}

function baseScore(
  title: string,
  company: string,
  experience: string,
  degree: string,
  industry: string,
  salary: string,
  skills: string[],
) {
  const category = categorizeBossTitle(title);
  let score = 38;
  const reasons: string[] = [];
  const risks: string[] = [];

  const categoryPoints: Record<string, number> = {
    软件实施: 20,
    技术支持: 18,
    数据与信息化: 14,
    软件测试: 8,
    软件开发: 2,
    其他技术: 0,
  };
  score += categoryPoints[category] || 0;
  if (category !== "其他技术") {
    reasons.push(`岗位方向为${category}`);
  }

  if (/经验不限/.test(experience)) {
    score += 13;
    reasons.push("经验不限");
  } else if (/在校|应届|1年以内/.test(experience)) {
    score += 14;
    reasons.push("经验门槛较低");
  } else if (/1-3年/.test(experience)) {
    score += 3;
    risks.push("写明 1-3 年经验，需要确认是否接受无正式工作经验");
  } else if (/3-5年/.test(experience)) {
    score -= 20;
    risks.push("经验要求高于当前经历");
  } else if (/5-10年|10年以上/.test(experience)) {
    score -= 35;
    risks.push("经验要求明显高于当前经历");
  }

  if (/硕士|研究生/.test(degree)) {
    score -= 16;
    risks.push("学历要求高于本科");
  } else if (/本科/.test(degree)) {
    score += 4;
  } else if (/大专/.test(degree)) {
    score += 2;
  }

  const salaryRange = parseSalary(salary);
  if (salaryRange.min >= 8) score += 8;
  else if (salaryRange.min >= 6) score += 5;
  else if (salaryRange.min > 0 && salaryRange.min < 4) {
    score -= 10;
    risks.push("薪资下限偏低");
  }

  if (
    /能源|电力|新能源|制造|工业|医疗|政务|计算机软件|企业服务|物联网/.test(
      industry,
    )
  ) {
    score += 6;
    reasons.push(`行业为${industry}`);
  }
  if (/电商|直播|保险|房地产|教育培训/.test(industry)) {
    score -= 9;
    risks.push(`行业为${industry}，需核实岗位是否偏销售或运营`);
  }

  const searchable = `${title} ${skills.join(" ")}`;
  if (
    /销售|电销|电话销售|招商|采购|主播|直播运营|电商运营|客服|招聘专员|猎头|保险代理|房产经纪|课程顾问/.test(
      searchable,
    )
  ) {
    score -= 50;
    risks.push("岗位名称或技能带有明显非技术/销售属性");
  }
  if (/机械设计|电气设计|结构设计|制图|工艺工程师/.test(title)) {
    score -= 35;
    risks.push("岗位内容偏专业工程，需要核实计算机能力是否适用");
  }
  if (/经理|主管|总监/.test(title) && /经验不限|1-3年/.test(experience)) {
    score -= 15;
    risks.push("岗位层级偏高，需核实实际工作内容");
  }
  if (
    /外企德科|德科|软通|中软|博彦|佰钧成|法本/.test(company) ||
    (/不限语言|语言不限|开发\/测试/.test(title) && salaryRange.max >= 15)
  ) {
    score -= 10;
    risks.push("可能为人力外包或派遣岗位，需确认劳动合同主体");
  }

  return { score, category, reasons, risks };
}

export function enrichBossCandidate(
  candidate: CollectorCandidate,
): CollectorCandidate {
  let score = candidate.score;
  const reasons = [candidate.reason].filter(Boolean);
  const risks = [...candidate.risks];
  const text = `${candidate.skills.join(" ")} ${candidate.description}`;
  const positives: Array<[RegExp, string]> = [
    [/sql|mysql|数据库/i, "涉及 SQL 或数据库"],
    [/linux|部署|实施|上线/i, "涉及系统部署与实施"],
    [/需求|客户沟通|培训|交付/i, "能积累需求沟通和项目交付经验"],
    [/能源|电力|新能源|制造|工业|医疗|政务/i, "行业经验可迁移"],
    [/文档|方案|流程|验收/i, "涉及方案、文档和项目验收"],
  ];
  for (const [pattern, reason] of positives) {
    if (pattern.test(text)) {
      score += candidate.description ? 5 : 2;
      reasons.push(reason);
    }
  }
  const negatives: Array<[RegExp, number, string]> = [
    [/培训贷|贷款培训|岗前培训费|收取培训费|押金|保证金/i, -60, "出现收费或押金风险词"],
    [/无底薪|纯提成|电话销售|客户开发|业绩提成/i, -35, "岗位偏销售或收入结构不稳定"],
    [/劳务派遣|第三方合同|项目外包/i, -8, "可能涉及派遣或外包"],
    [/7x24|7×24|长期出差|频繁出差/i, -6, "工作强度或出差频率较高，需要确认"],
  ];
  for (const [pattern, points, risk] of negatives) {
    if (pattern.test(`${candidate.title} ${candidate.description}`)) {
      score += points;
      risks.push(risk);
    }
  }
  if (!candidate.description && candidate.category !== "其他技术") {
    score -= 5;
    risks.push("尚未读取到完整岗位描述");
  }
  const greeting = [
    "您好，我是华北电力大学计算机科学与技术专业 2026 届本科毕业生，目前可立即到岗。",
    "掌握 Java 基础，了解 MySQL、Git，有政府单位实习经历，可接受驻场和出差。",
    `看到贵司招聘“${candidate.title}”，想确认岗位是否接受往届毕业生，方便沟通具体职责吗？`,
  ].join("");
  return {
    ...candidate,
    score: Math.max(0, Math.min(100, Math.round(score))),
    reason: [...new Set(reasons)].slice(0, 5).join("；"),
    risks: [...new Set(risks)].slice(0, 8),
    greeting,
  };
}

export function normalizeBossJob(
  rawValue: unknown,
  cityName: string,
  query: string,
  collectedAt: string,
): CollectorCandidate | null {
  const raw = asRecord(rawValue);
  const title = asString(raw.jobName);
  const company = asString(raw.brandName);
  const encryptJobId = asString(raw.encryptJobId);
  if (!title || !company) return null;
  const sourceKey = encryptJobId
    ? `boss:${encryptJobId}`
    : `boss:${createHash("sha1")
        .update(`${company}|${title}|${asString(raw.cityName)}`)
        .digest("hex")}`;
  const securityId = asString(raw.securityId);
  const lid = asString(raw.lid);
  const link = encryptJobId
    ? `${BOSS_ORIGIN}/job_detail/${encryptJobId}.html?securityId=${encodeURIComponent(
        securityId,
      )}&lid=${encodeURIComponent(lid)}`
    : "";
  const salary = asString(raw.salaryDesc);
  const experience = asString(raw.jobExperience);
  const degree = asString(raw.jobDegree);
  const industry = asString(raw.brandIndustry);
  const skills = asArray(raw.skills).map(asString).filter(Boolean);
  const scored = baseScore(
    title,
    company,
    experience,
    degree,
    industry,
    salary,
    skills,
  );
  return {
    sourceKey,
    title,
    company,
    salary,
    city: asString(raw.cityName) || cityName,
    district: asString(raw.areaDistrict),
    experience,
    degree,
    industry,
    companyScale: asString(raw.brandScaleName),
    skills,
    category: scored.category,
    score: Math.max(0, Math.min(100, scored.score)),
    reason:
      scored.reasons.join("；") || "基础条件尚可，需要结合岗位描述判断",
    risks: scored.risks,
    description: stripHtml(raw.jobDescription),
    greeting: "",
    link,
    sourceQueries: [query],
    collectedAt,
  };
}

export class BossStopError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BossStopError";
  }
}

function assertBossResponse(status: number, data: JsonRecord) {
  const message = asString(data.message);
  if (RISK_PATTERN.test(message)) {
    throw new BossStopError(
      `BOSS 触发风控，已立即停止采集：${message}。请至少间隔一段时间后再手动操作。`,
    );
  }
  if (
    status === 401 ||
    status === 403 ||
    LOGIN_PATTERN.test(message)
  ) {
    throw new BossStopError(
      `BOSS 登录状态无效，已停止采集：${message || `HTTP ${status}`}。请在专用 Edge 中重新扫码登录。`,
    );
  }
  if (status < 200 || status >= 300) {
    throw new BossStopError(`BOSS 接口返回 HTTP ${status}，采集已停止`);
  }
  if (Number(data.code) !== 0) {
    throw new BossStopError(
      `BOSS 接口返回异常：${message || `code=${String(data.code)}`}`,
    );
  }
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("采集任务已取消"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("采集任务已取消"));
      },
      { once: true },
    );
  });
}

async function bodyText(page: Page): Promise<string> {
  try {
    return (await page.locator("body").innerText()).slice(0, 10_000);
  } catch {
    return "";
  }
}

async function captureBossHeaders(
  page: Page,
  request: CollectorRequest,
  progress: CollectorProgress,
): Promise<Record<string, string>> {
  let capturedHeaders: Record<string, string> | null = null;
  const onRequest = (bossRequest: Request) => {
    if (
      !capturedHeaders &&
      bossRequest.url().includes("/wapi/zpgeek/search/joblist.json")
    ) {
      const headers = bossRequest.headers();
      capturedHeaders = {
        accept: headers.accept || "application/json, text/plain, */*",
        "content-type":
          headers["content-type"] || "application/x-www-form-urlencoded",
        "x-requested-with": headers["x-requested-with"] || "XMLHttpRequest",
        ...(headers.token ? { token: headers.token } : {}),
        ...(headers.zp_token ? { zp_token: headers.zp_token } : {}),
      };
    }
  };
  page.on("request", onRequest);
  try {
    progress(12, "正在连接 BOSS 并检查登录状态");
    await page.goto(`${BOSS_ORIGIN}/`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForTimeout(2_500);
    if (capturedHeaders) return capturedHeaders;

    const pageText = await bodyText(page);
    if (RISK_PATTERN.test(pageText)) {
      throw new BossStopError(
        "BOSS 页面提示环境异常或访问频繁，已停止采集。请等待一段时间后手动处理。",
      );
    }

    const searchInput = page
      .locator('input[placeholder*="搜索"]:visible, input.ipt-search:visible')
      .first();
    if (!(await searchInput.count())) {
      throw new BossStopError(
        "没有找到 BOSS 搜索框。请先点击“启动专用 Edge”，完成扫码登录后再开始采集。",
      );
    }
    progress(15, "请在专用 Edge 中完成登录，等待系统读取当前搜索条件");
    await searchInput.fill(request.queries[0]);
    await searchInput.press("Enter");
    for (let attempt = 0; attempt < 24 && !capturedHeaders; attempt += 1) {
      await page.waitForTimeout(500);
    }
    if (!capturedHeaders) {
      const currentText = await bodyText(page);
      if (RISK_PATTERN.test(currentText)) {
        throw new BossStopError(
          "BOSS 页面提示环境异常或访问频繁，已停止采集。",
        );
      }
      throw new BossStopError(
        "未能读取 BOSS 搜索请求。请确认已在专用 Edge 中完成扫码登录，并关闭遮挡页面的弹窗。",
      );
    }
    return capturedHeaders;
  } finally {
    page.off("request", onRequest);
  }
}

async function searchBoss(
  page: Page,
  headers: Record<string, string>,
  cityCode: number,
  query: string,
  pageNumber: number,
): Promise<SearchResponse> {
  return page.evaluate(
    async ({ requestHeaders, requestCity, requestQuery, requestPage }) => {
      const body = new URLSearchParams({
        page: String(requestPage),
        pageSize: "15",
        city: String(requestCity),
        query: requestQuery,
        expectInfo: "",
        multiSubway: "",
        multiBusinessDistrict: "",
        position: "",
        jobType: "",
        salary: "",
        experience: "",
        degree: "",
        industry: "",
        scale: "",
        stage: "",
        scene: "1",
        encryptExpectId: "",
      });
      const response = await fetch(
        `/wapi/zpgeek/search/joblist.json?_=${Date.now()}`,
        {
          method: "POST",
          credentials: "include",
          headers: requestHeaders,
          body,
        },
      );
      const text = await response.text();
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(text) as Record<string, unknown>;
      } catch {
        data = { message: text.slice(0, 500) };
      }
      return { status: response.status, data };
    },
    {
      requestHeaders: headers,
      requestCity: cityCode,
      requestQuery: query,
      requestPage: pageNumber,
    },
  );
}

async function fetchBossDetail(
  page: Page,
  headers: Record<string, string>,
  raw: JsonRecord,
): Promise<JsonRecord> {
  const result = await page.evaluate(
    async ({ securityId, lid, token }) => {
      const query = new URLSearchParams({
        securityId,
        lid,
        _: String(Date.now()),
      });
      const response = await fetch(`/wapi/zpgeek/job/detail.json?${query}`, {
        credentials: "include",
        headers: {
          accept: "application/json, text/plain, */*",
          "x-requested-with": "XMLHttpRequest",
          ...(token ? { token } : {}),
        },
      });
      const text = await response.text();
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(text) as Record<string, unknown>;
      } catch {
        data = { message: text.slice(0, 500) };
      }
      return { status: response.status, data };
    },
    {
      securityId: asString(raw.securityId),
      lid: asString(raw.lid),
      token: headers.token || "",
    },
  );
  assertBossResponse(result.status, result.data);
  return result.data;
}

export async function collectBossCandidates(input: {
  request: CollectorRequest;
  cache: CollectorCacheEntry[];
  signal: AbortSignal;
  progress: CollectorProgress;
}): Promise<{
  candidates: CollectorCandidate[];
  cacheEntries: CollectorCacheEntry[];
  warnings: string[];
}> {
  const { request, cache, signal, progress } = input;
  progress(5, "正在连接专用 Edge");
  let browser: Browser;
  try {
    browser = await chromium.connectOverCDP(BOSS_ENDPOINT, {
      timeout: 15_000,
    });
  } catch {
    throw new BossStopError(
      "未连接到专用 Edge。请先在采集中心点击“启动专用 Edge”，完成扫码登录后再开始采集。",
    );
  }
  const pages = browser.contexts().flatMap((context) => context.pages());
  const page =
    pages.find((candidate) => candidate.url().includes("zhipin.com")) ||
    pages[0] ||
    (await browser.contexts()[0]?.newPage());
  if (!page) throw new BossStopError("专用 Edge 中没有可用页面");
    await page.bringToFront();
    const headers = await captureBossHeaders(page, request, progress);
    const cached = new Map(cache.map((entry) => [entry.key, entry]));
    const cacheEntries: CollectorCacheEntry[] = [];
    const candidates = new Map<string, CollectorCandidate>();
    const rawById = new Map<string, JsonRecord>();
    const warnings: string[] = [];
    let networkSearchRequests = 0;

    for (const city of request.cities) {
      for (const query of request.queries) {
        for (
          let pageNumber = 1;
          pageNumber <= request.pagesPerQuery;
          pageNumber += 1
        ) {
          if (signal.aborted) throw new Error("采集任务已取消");
          const cacheKey = `${city.code}|${query}|${pageNumber}`;
          const cachedEntry = cached.get(cacheKey);
          let searchCandidates: CollectorCandidate[];
          if (
            cachedEntry &&
            new Date(cachedEntry.expiresAt).getTime() > Date.now()
          ) {
            searchCandidates = cachedEntry.candidates.map((candidate) => ({
              ...candidate,
              collectedAt: new Date().toISOString(),
              sourceQueries: [...new Set([...candidate.sourceQueries, query])],
            }));
          } else {
            if (networkSearchRequests >= request.maxSearchRequests) {
              warnings.push(
                `已达到本轮 ${request.maxSearchRequests} 次搜索上限，剩余条件未执行`,
              );
              break;
            }
            progress(
              20 + Math.min(40, networkSearchRequests * 7),
              `正在搜索 ${city.name} · ${query} · 第 ${pageNumber} 页`,
            );
            const result = await searchBoss(
              page,
              headers,
              city.code,
              query,
              pageNumber,
            );
            assertBossResponse(result.status, result.data);
            networkSearchRequests += 1;
            const jobList = asArray(asRecord(result.data.zpData).jobList);
            searchCandidates = [];
            for (const rawValue of jobList) {
              const raw = asRecord(rawValue);
              const candidate = normalizeBossJob(
                raw,
                city.name,
                query,
                new Date().toISOString(),
              );
              if (!candidate) continue;
              searchCandidates.push(candidate);
              rawById.set(candidate.sourceKey, raw);
            }
            cacheEntries.push({
              key: cacheKey,
              candidates: searchCandidates,
              expiresAt: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
            });
            await sleep(request.requestDelayMs, signal);
          }

          for (const candidate of searchCandidates) {
            const existing = candidates.get(candidate.sourceKey);
            if (existing) {
              existing.sourceQueries = [
                ...new Set([...existing.sourceQueries, ...candidate.sourceQueries]),
              ];
              existing.collectedAt = candidate.collectedAt;
            } else {
              candidates.set(candidate.sourceKey, candidate);
            }
          }
        }
      }
    }

    const detailTargets = [...candidates.values()]
      .filter(
        (candidate) =>
          candidate.score >= 35 && rawById.has(candidate.sourceKey),
      )
      .sort((left, right) => right.score - left.score)
      .slice(0, request.detailLimit);
    for (let index = 0; index < detailTargets.length; index += 1) {
      if (signal.aborted) throw new Error("采集任务已取消");
      const candidate = detailTargets[index];
      const raw = rawById.get(candidate.sourceKey);
      if (!raw) continue;
      progress(
        65 + Math.round(((index + 1) / detailTargets.length) * 25),
        `正在读取岗位详情 ${index + 1}/${detailTargets.length}`,
      );
      try {
        const data = await fetchBossDetail(page, headers, raw);
        const jobInfo = asRecord(asRecord(data.zpData).jobInfo);
        const bossInfo = asRecord(asRecord(data.zpData).bossInfo);
        const detailSkills = asArray(jobInfo.showSkills)
          .map(asString)
          .filter(Boolean);
        const detailed = enrichBossCandidate({
          ...candidate,
          title: asString(jobInfo.jobName) || candidate.title,
          salary: asString(jobInfo.salaryDesc) || candidate.salary,
          city: asString(jobInfo.locationName) || candidate.city,
          experience:
            asString(jobInfo.experienceName) || candidate.experience,
          degree: asString(jobInfo.degreeName) || candidate.degree,
          skills: detailSkills.length ? detailSkills : candidate.skills,
          company: asString(bossInfo.brandName) || candidate.company,
          description: stripHtml(jobInfo.postDescription),
        });
        candidates.set(candidate.sourceKey, detailed);
      } catch (error) {
        if (error instanceof BossStopError) throw error;
        warnings.push(
          `${candidate.company} / ${candidate.title} 详情读取失败，已保留列表信息`,
        );
      }
      await sleep(Math.max(3_000, request.requestDelayMs), signal);
    }

    const finalized = [...candidates.values()]
      .map((candidate) => enrichBossCandidate(candidate))
      .sort((left, right) => right.score - left.score);
    progress(94, `采集完成，共 ${finalized.length} 个候选岗位`);
  return { candidates: finalized, cacheEntries, warnings };
}

export const bossCollectorConfig = {
  endpoint: BOSS_ENDPOINT,
  origin: BOSS_ORIGIN,
};
