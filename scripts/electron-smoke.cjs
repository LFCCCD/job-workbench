const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

async function main() {
  let aiAuthorization = "";
  let aiRequestCount = 0;
  const mockAnalysis = {
    jobSummary: {
      responsibilities: "负责系统实施、客户培训和项目交付。",
      workMode: "JD 未明确工作方式",
      evidence: [
        {
          source: "jd",
          factId: null,
          quote: "负责系统实施、客户培训和项目交付。",
        },
      ],
    },
    hardRequirements: [
      {
        requirement: "岗位职责需要人工核实",
        status: "unknown",
        evidence: [
          {
            source: "jd",
            factId: null,
            quote: "负责系统实施、客户培训和项目交付。",
          },
        ],
        note: "当前没有可用于匹配的已核实事实",
      },
    ],
    bonuses: [],
    risks: [],
    interviewQuestions: [
      {
        category: "技术",
        question: "如何完成一次系统部署？",
        preparation: "说明部署、验证和回滚步骤。",
      },
      {
        category: "项目",
        question: "介绍一个真实项目。",
        preparation: "明确个人负责范围。",
      },
      {
        category: "业务",
        question: "如何处理客户需求变更？",
        preparation: "说明记录、评估和确认流程。",
      },
      {
        category: "行为",
        question: "如何快速熟悉陌生系统？",
        preparation: "说明文档、流程和关键用户。",
      },
    ],
    questionsToAsk: ["前三个月的交付目标是什么？"],
    resumeRecommendation: {
      versionName: "",
      gaps: ["待核实岗位基础要求"],
    },
    confidence: "low",
    confidenceReason: "冒烟测试使用模拟 Provider，仅验证请求和证据链路",
    unknowns: ["工作方式待确认"],
  };
  const aiServer = http.createServer((request, response) => {
    if (request.url !== "/v1/chat/completions") {
      response.writeHead(404);
      response.end();
      return;
    }
    aiAuthorization = String(request.headers.authorization || "");
    aiRequestCount += 1;
    request.resume();
    request.on("end", () => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          choices: [
            { message: { content: JSON.stringify(mockAnalysis) } },
          ],
          usage: { prompt_tokens: 30, completion_tokens: 20 },
        }),
      );
    });
  });
  await new Promise((resolve) => aiServer.listen(0, "127.0.0.1", resolve));
  const aiAddress = aiServer.address();
  if (!aiAddress || typeof aiAddress === "string") {
    throw new Error("Mock AI server did not start");
  }
  const aiBaseUrl = `http://127.0.0.1:${aiAddress.port}/v1`;
  const userData = fs.mkdtempSync(
    path.join(os.tmpdir(), "job-workbench-e2e-"),
  );
  const packagedExecutable = process.env.JOB_WORKBENCH_PACKAGED_EXE;
  const app = await electron.launch({
    executablePath:
      packagedExecutable ||
      path.join(
        __dirname,
        "..",
        "node_modules",
        "electron",
        "dist",
        "electron.exe",
      ),
    args: packagedExecutable ? [] : ["."],
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      JOB_WORKBENCH_USER_DATA: userData,
    },
  });
  app.process().stderr?.on("data", (chunk) => {
    console.error(`[electron] ${chunk.toString()}`);
  });

  try {
    const page = await app.firstWindow();
    page.on("pageerror", (error) => console.error(`[pageerror] ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") {
        console.error(`[renderer] ${message.text()}`);
      }
    });
    await page.waitForSelector("text=职位池");
    await page.locator("nav").getByRole("button", { name: /采集中心/ }).click();
    await page.waitForSelector("text=采集条件");
    const collectorStatus = await page.evaluate(() =>
      window.jobWorkbench.getCollectorStatus(),
    );
    if (!collectorStatus || typeof collectorStatus.edgeRunning !== "boolean") {
      throw new Error("Collector status IPC did not return a valid response");
    }
    await page.getByRole("button", { name: "开始采集" }).click();
    await page.waitForSelector(".task-card");
    await page.waitForFunction(
      () =>
        document.querySelector(".task-status")?.textContent?.includes("失败"),
      null,
      { timeout: 20_000 },
    );
    const collectorTaskError = await page
      .locator(".task-error")
      .first()
      .textContent();
    if (!collectorTaskError?.includes("专用 Edge")) {
      throw new Error(
        `Collector Worker failure was not actionable: ${collectorTaskError}`,
      );
    }
    await page.locator("nav").getByRole("button", { name: /采集中心/ }).click();
    await page.waitForSelector("text=最近一次采集失败");
    await page.screenshot({
      path: path.join(__dirname, "..", "artifacts", "smoke-collector.png"),
      fullPage: true,
    });
    await page.locator("nav").getByRole("button", { name: "职位池" }).click();
    await page.waitForSelector("text=手动添加岗位");
    await page.getByRole("button", { name: "手动添加岗位" }).click();
    const addDialog = page.locator(".modal");
    await addDialog.getByLabel("岗位名称", { exact: true }).fill("软件实施工程师");
    await addDialog.getByLabel("公司名称", { exact: true }).fill("测试科技");
    await addDialog.getByLabel("薪资", { exact: true }).fill("7-10K");
    await addDialog.getByLabel("城市", { exact: true }).fill("杭州");
    await addDialog
      .getByLabel("岗位描述", { exact: true })
      .fill("负责系统实施、客户培训和项目交付。");
    await addDialog.getByRole("button", { name: "添加", exact: true }).click();
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(__dirname, "..", "artifacts", "smoke-after-add.png"),
      fullPage: true,
    });
    await page.waitForSelector("text=软件实施工程师", { timeout: 8_000 });
    await page.locator(".job-main").first().click();
    await page.locator(".detail-panel").getByRole("button", { name: "编辑岗位" }).click();
    await page.locator(".detail-panel").getByLabel("薪资").fill("8-11K");
    await page.locator(".detail-panel").getByLabel("城市").fill("杭州");
    await page.locator(".detail-panel").getByLabel("区域").fill("余杭区");
    await page.locator(".detail-panel").getByLabel("个人备注").fill("端到端测试备注");
    await page.locator(".detail-panel").getByRole("button", { name: "保存" }).click();
    await page.locator(".job-controls .favorite").click();
    await page.locator(".job-controls select").selectOption("准备沟通");
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(__dirname, "..", "artifacts", "smoke-detail.png"),
      fullPage: false,
    });
    await page.locator("nav").getByRole("button", { name: "跟进" }).click();
    await page.waitForSelector("text=JOB RELATIONSHIP");
    await page
      .locator(".top-actions")
      .getByRole("button", { name: "新增联系人" })
      .click();
    const contactModal = page.locator(".crm-modal");
    await contactModal.getByLabel("姓名").fill("招聘老师");
    await contactModal.getByLabel("角色").fill("HR");
    await contactModal.getByLabel("联系方式说明").fill("BOSS 站内沟通");
    await contactModal.getByLabel("备注").fill("已确认接受往届毕业生");
    await contactModal.getByRole("button", { name: "保存联系人" }).click();
    await page.locator(".crm-card", { hasText: "招聘老师" }).waitFor();

    await page
      .locator(".top-actions")
      .getByRole("button", { name: "新增跟进" })
      .click();
    const followModal = page.locator(".crm-modal");
    await followModal.getByLabel("跟进标题").fill("确认简历是否送达");
    await followModal.getByLabel("备注").fill("询问招聘进度和下一步安排");
    await followModal.getByRole("button", { name: "保存跟进" }).click();
    await page
      .locator(".crm-timeline-item", { hasText: "确认简历是否送达" })
      .waitFor();

    await page
      .locator(".top-actions")
      .getByRole("button", { name: "新增面试" })
      .click();
    const interviewModal = page.locator(".crm-modal");
    await interviewModal.getByLabel("轮次").fill("一面");
    await interviewModal.getByLabel("地点 / 会议链接").fill("腾讯会议");
    await interviewModal
      .getByLabel("面试问题（每行一条）")
      .fill("如何排查客户现场问题？");
    await interviewModal.getByLabel("结果").fill("待面试");
    await interviewModal.getByLabel("下一步").fill("复习 SQL 和项目实施流程");
    await interviewModal
      .getByLabel("复盘")
      .fill("准备项目交付和客户沟通案例");
    await interviewModal.getByRole("button", { name: "保存面试" }).click();
    await page.locator(".interview-card", { hasText: "一面" }).waitFor();
    const crmCheck = await page.evaluate(async () => {
      const jobs = await window.jobWorkbench.listJobs({
        query: "软件实施工程师",
      });
      if (!jobs[0]) throw new Error("CRM smoke job not found");
      const overview = await window.jobWorkbench.getCrmOverview();
      const workspace = await window.jobWorkbench.getCrmWorkspace(jobs[0].id);
      return {
        openFollowUps: overview.metrics.openFollowUps,
        contacts: workspace.contacts.length,
        interviews: workspace.interviews.length,
        eventCount: workspace.events.length,
      };
    });
    if (
      crmCheck.openFollowUps !== 1 ||
      crmCheck.contacts !== 1 ||
      crmCheck.interviews !== 1 ||
      crmCheck.eventCount < 3
    ) {
      throw new Error(`CRM smoke check failed: ${JSON.stringify(crmCheck)}`);
    }
    await page.screenshot({
      path: path.join(__dirname, "..", "artifacts", "smoke-crm.png"),
      fullPage: true,
    });
    await page.locator("nav").getByRole("button", { name: "AI 分析" }).click();
    await page.waitForSelector("text=PROVIDER SETTINGS");
    const credentialCheck = await page.evaluate(async () => {
      await window.jobWorkbench.saveAiSettings({
        provider: "custom",
        baseUrl: "https://example.com/v1",
        model: "smoke-model",
        dailyRequestLimit: 5,
        apiKey: "smoke-test-key",
      });
      const saved = await window.jobWorkbench.saveAiSettings({
        provider: "custom",
        baseUrl: "https://example.com/v1",
        model: "smoke-model",
        dailyRequestLimit: 5,
        apiKey: "smoke-test-key-rotated",
      });
      const settings = await window.jobWorkbench.getAiSettings();
      await window.jobWorkbench.clearAiApiKey();
      const afterClear = await window.jobWorkbench.getAiSettings();
      await window.jobWorkbench.saveAiSettings({
        provider: "local",
        baseUrl: "",
        model: "local-rules-v1",
        dailyRequestLimit: 20,
      });
      return {
        encryptionAvailable: saved.encryptionAvailable,
        hasApiKey: settings.hasApiKey,
        cleared: !afterClear.hasApiKey,
      };
    });
    if (
      !credentialCheck.encryptionAvailable ||
      !credentialCheck.hasApiKey ||
      !credentialCheck.cleared
    ) {
      throw new Error(
        `AI credential storage failed: ${JSON.stringify(credentialCheck)}`,
      );
    }
    await page.locator("nav").getByRole("button", { name: "简历" }).click();
    const profilePanel = page.locator(".resume-profile-panel");
    await profilePanel.getByLabel("姓名").fill("冒烟同学");
    await profilePanel.getByLabel("当前城市").fill("杭州");
    await profilePanel
      .getByLabel("目标岗位（用顿号或逗号分隔）")
      .fill("软件实施工程师、技术支持工程师");
    await page
      .locator(".top-actions")
      .getByRole("button", { name: "保存个人资料" })
      .click();
    await page
      .locator(".top-actions")
      .getByRole("button", { name: "新建事实" })
      .click();
    const factModal = page.locator(".resume-fact-modal");
    await factModal
      .getByLabel("标题")
      .fill("电力设备采购平台二次开发");
    await factModal.getByLabel("组织 / 学校 / 公司").fill("华北电力大学");
    await factModal.getByLabel("角色").fill("后端开发");
    await factModal.getByLabel("开始时间").fill("2025-09");
    await factModal.getByLabel("结束时间").fill("2026-05");
    await factModal.getByLabel("地点").fill("北京");
    await factModal
      .getByLabel("事实条目（每行一条，只写真实完成的内容）")
      .fill("完成设备查询接口\n完成采购流程状态管理");
    await factModal.getByLabel("技能（用逗号分隔）").fill("Java、MySQL");
    await factModal
      .getByLabel("真实依据")
      .fill("毕业设计源文件和论文");
    await factModal
      .getByLabel("我已确认这条事实真实、准确并能解释")
      .check();
    await factModal.getByRole("button", { name: "保存事实" }).click();
    await page.waitForSelector("text=电力设备采购平台二次开发");
    await page
      .locator(".top-actions")
      .getByRole("button", { name: "新建版本" })
      .click();
    const versionModal = page.locator(".resume-version-modal");
    await versionModal
      .getByLabel("版本名称")
      .fill("软件实施岗位版");
    await versionModal
      .getByLabel("目标岗位")
      .fill("软件实施工程师");
    await versionModal
      .getByLabel("版本概述")
      .fill("突出系统实施、数据库基础和项目交付能力。");
    await versionModal.getByRole("button", { name: "保存版本" }).click();
    await page.waitForSelector("text=软件实施岗位版");
    await page.screenshot({
      path: path.join(__dirname, "..", "artifacts", "smoke-resume.png"),
      fullPage: true,
    });
    const resumePdfPath = path.join(userData, "resume-smoke.pdf");
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath,
      });
    }, resumePdfPath);
    await page
      .locator(".active-resume-version")
      .getByRole("button", { name: "导出 PDF" })
      .click();
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (
        fs.existsSync(resumePdfPath) &&
        fs.statSync(resumePdfPath).size > 500
      ) {
        break;
      }
      await page.waitForTimeout(100);
    }
    if (!fs.existsSync(resumePdfPath)) {
      throw new Error("Resume PDF was not created");
    }
    let pdfBytes = Buffer.alloc(0);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      pdfBytes = fs.readFileSync(resumePdfPath);
      if (pdfBytes.subarray(0, 5).toString() === "%PDF-") break;
      await page.waitForTimeout(100);
    }
    if (pdfBytes.subarray(0, 5).toString() !== "%PDF-") {
      throw new Error("Resume export did not produce a valid PDF header");
    }
    await page.locator("nav").getByRole("button", { name: "AI 分析" }).click();
    await page.waitForSelector("text=PROVIDER SETTINGS");
    await page
      .locator(".top-actions")
      .getByRole("button", { name: "开始分析" })
      .click();
    const aiTask = page
      .locator(".task-card")
      .filter({ hasText: "AI 单岗位分析" });
    await aiTask.waitFor();
    await page.waitForFunction(() => {
      const cards = [...document.querySelectorAll(".task-card")];
      const card = cards.find((item) =>
        item.textContent?.includes("AI 单岗位分析"),
      );
      return card?.textContent?.includes("已完成");
    });
    await page.locator("nav").getByRole("button", { name: "AI 分析" }).click();
    await page.waitForSelector("text=分析完成");
    await page.waitForSelector("text=硬性要求与事实匹配");
    await page.screenshot({
      path: path.join(__dirname, "..", "artifacts", "smoke-ai-analysis.png"),
      fullPage: true,
    });
    const remoteTask = await page.evaluate(async (baseUrl) => {
      const jobs = await window.jobWorkbench.listJobs({
        query: "软件实施工程师",
      });
      if (!jobs[0]) throw new Error("Smoke job not found");
      await window.jobWorkbench.saveAiSettings({
        provider: "custom",
        baseUrl,
        model: "mock-evidence-model",
        dailyRequestLimit: 5,
        apiKey: "smoke-remote-key",
      });
      return window.jobWorkbench.createAiAnalysisTask({
        jobId: jobs[0].id,
        force: true,
      });
    }, aiBaseUrl);
    let remoteTaskStatus = null;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      remoteTaskStatus = await page.evaluate(async (taskId) => {
        const tasks = await window.jobWorkbench.listTasks();
        return tasks.find((task) => task.id === taskId) || null;
      }, remoteTask.id);
      if (
        remoteTaskStatus?.status === "succeeded" ||
        remoteTaskStatus?.status === "failed"
      ) {
        break;
      }
      await page.waitForTimeout(250);
    }
    if (remoteTaskStatus?.status !== "succeeded") {
      throw new Error(
        `Remote AI task failed: ${JSON.stringify(remoteTaskStatus)} auth=${aiAuthorization}`,
      );
    }
    await page.locator(".ai-job-list button").first().click();
    await page.waitForSelector("text=mock-evidence-model");
    if (aiAuthorization !== "Bearer smoke-remote-key") {
      throw new Error(`Unexpected AI authorization: ${aiAuthorization}`);
    }
    const cachedTask = await page.evaluate(async () => {
      const jobs = await window.jobWorkbench.listJobs({
        query: "软件实施工程师",
      });
      if (!jobs[0]) throw new Error("Smoke job not found");
      return window.jobWorkbench.createAiAnalysisTask({
        jobId: jobs[0].id,
        force: false,
      });
    });
    let cachedTaskStatus = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      cachedTaskStatus = await page.evaluate(async (taskId) => {
        const tasks = await window.jobWorkbench.listTasks();
        return tasks.find((task) => task.id === taskId) || null;
      }, cachedTask.id);
      if (cachedTaskStatus?.status === "succeeded") break;
      if (cachedTaskStatus?.status === "failed") break;
      await page.waitForTimeout(100);
    }
    if (
      cachedTaskStatus?.status !== "succeeded" ||
      cachedTaskStatus.result?.cached !== true ||
      aiRequestCount !== 1
    ) {
      throw new Error(
        `AI cache check failed: ${JSON.stringify({ cachedTaskStatus, aiRequestCount })}`,
      );
    }
    await page.screenshot({
      path: path.join(__dirname, "..", "artifacts", "smoke-ai-remote.png"),
      fullPage: true,
    });
    await page.evaluate(async () => {
      await window.jobWorkbench.clearAiApiKey();
      await window.jobWorkbench.saveAiSettings({
        provider: "local",
        baseUrl: "",
        model: "local-rules-v1",
        dailyRequestLimit: 20,
      });
    });
    await page.locator("nav").getByRole("button", { name: "职位池" }).click();
    await page.waitForSelector("text=软件实施工程师");
    await page.locator(".job-select").check();
    await page.getByRole("button", { name: "归档选中" }).click();
    await page.waitForSelector("text=还没有岗位");
    await page.getByLabel("范围").selectOption("archived");
    await page.waitForSelector("text=软件实施工程师");
    await page.locator(".job-select").check();
    await page.getByRole("button", { name: "恢复选中" }).click();
    await page.getByLabel("范围").selectOption("active");
    await page.waitForSelector("text=软件实施工程师");
    await page.locator(".job-select").check();
    await page.getByRole("button", { name: "归档选中" }).click();
    await page.getByLabel("范围").selectOption("archived");
    await page.waitForSelector("text=软件实施工程师");
    await page.locator(".job-select").check();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "永久删除" }).click();
    await page.waitForSelector("text=还没有岗位");
    await page.getByRole("button", { name: "后台备份" }).click();
    await page.waitForSelector(".task-card");
    await page.waitForFunction(() =>
      document.querySelector(".task-status")?.textContent?.includes("已完成"),
    );
    await page.screenshot({
      path: path.join(__dirname, "..", "artifacts", "smoke-tasks.png"),
      fullPage: false,
    });
    await page.getByRole("button", { name: "清理已完成记录" }).click();
    await page.waitForSelector("text=暂无任务");

    const dashboard = await page.evaluate(async () => {
      return window.jobWorkbench.getDashboard();
    });
    console.log(
      JSON.stringify({
        title: await page.title(),
        dashboard,
        userData,
      }),
    );
  } finally {
    await app.close();
    await new Promise((resolve, reject) =>
      aiServer.close((error) => (error ? reject(error) : resolve())),
    );
    fs.rmSync(userData, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
