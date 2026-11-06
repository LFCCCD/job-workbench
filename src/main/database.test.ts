import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JobDatabase } from "./database";
import { TaskService } from "./task-service";
import { analyzeWithLocalRules } from "./ai-analysis";

const roots: string[] = [];

function createRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "job-workbench-test-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

async function waitFor<T>(
  read: () => T,
  predicate: (value: T) => boolean,
  timeoutMs = 2_000,
) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = read();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for condition");
}

describe("JobDatabase", () => {
  it("adds jobs, updates status, archives, restores and backs up", async () => {
    const root = createRoot();
    const database = new JobDatabase(root);
    try {
      const job = database.addJob({
        title: "软件实施工程师",
        company: "示例科技",
        salary: "7-10K",
        city: "杭州",
        link: "",
        description: "负责系统实施和交付",
      });

      expect(database.listJobs()).toHaveLength(1);
      expect(database.getDashboard()).toMatchObject({
        total: 1,
        active: 1,
        archived: 0,
        schemaVersion: 6,
        pendingTasks: 0,
      });

      database.updateJob(job.id, {
        title: "软件实施工程师",
        company: "示例科技",
        salary: "8-11K",
        city: "杭州",
        district: "余杭区",
        experience: "经验不限",
        degree: "本科",
        category: "软件实施",
        link: "",
        description: "负责系统实施和客户培训",
        notes: "重点跟进",
      });
      database.setFavorite(job.id, true);
      database.updateStatus(job.id, "准备沟通");
      expect(database.getJob(job.id)?.status).toBe("准备沟通");
      expect(database.getJobDetail(job.id).events.length).toBeGreaterThan(1);
      expect(database.listJobs({ query: "客户培训" })).toHaveLength(1);
      expect(database.listJobs({ category: "软件实施" })).toHaveLength(1);
      expect(database.listJobs({ favoriteOnly: true })).toHaveLength(1);

      const view = database.saveView("杭州实施", {
        query: "",
        category: "软件实施",
        status: "",
        favoriteOnly: false,
        archived: "active",
        sort: "score",
      });
      expect(database.listSavedViews()[0]).toMatchObject({
        id: view.id,
        name: "杭州实施",
      });

      expect(database.setArchived([job.id], true)).toBe(1);
      expect(database.listJobs()).toHaveLength(0);
      expect(database.listJobs({ archived: "archived" })).toHaveLength(1);
      expect(database.listJobs({ archived: "all" })).toHaveLength(1);

      database.setArchived([job.id], false);
      expect(database.listJobs()).toHaveLength(1);

      const backupPath = await database.createBackup("test");
      expect(fs.existsSync(backupPath)).toBe(true);
      expect(fs.statSync(backupPath).size).toBeGreaterThan(0);

      const task = database.createTask(
        "ai-analysis",
        { jobId: job.id },
        "job:test-analysis",
      );
      expect(task.status).toBe("queued");
      expect(database.createTask("duplicate", {}, "job:test-analysis").id).toBe(
        task.id,
      );
      database.updateTask(task.id, { status: "running", progress: 40 });
      expect(database.getDashboard().pendingTasks).toBe(1);
      database.updateTask(task.id, {
        status: "succeeded",
        progress: 100,
        result: { score: 80 },
      });
      expect(database.getTask(task.id)).toMatchObject({
        status: "succeeded",
        progress: 100,
        result: { score: 80 },
      });

      database.setArchived([job.id], true);
      expect(database.permanentlyDeleteJobs([job.id])).toBe(1);
      expect(database.listJobs({ archived: "all" })).toHaveLength(0);
      expect(database.deleteSavedView(view.id)).toBe(1);
    } finally {
      database.close();
    }
  });

  it("migrates a legacy database and creates a safety backup", async () => {
    const root = createRoot();
    const legacy = new JobDatabase(path.join(root, "legacy"));
    const target = new JobDatabase(path.join(root, "target"));
    try {
      legacy.addJob({
        title: "ERP实施顾问",
        company: "旧库公司",
        salary: "6-9K",
        city: "宁波",
        link: "",
        description: "旧数据库岗位",
      });
      const result = await target.migrateLegacy(legacy.databasePath);
      expect(result.counts.jobs).toBe(1);
      expect(fs.existsSync(result.backupPath)).toBe(true);
      expect(target.listJobs()).toHaveLength(1);
      expect(target.listJobs()[0].title).toBe("ERP实施顾问");

      const preview = target.inspectLegacyDatabase(legacy.databasePath);
      expect(preview.integrity).toBe("ok");
      expect(preview.counts.jobs).toBe(1);
    } finally {
      target.close();
      legacy.close();
    }
  });

  it("restores a backup and creates a safety backup first", async () => {
    const root = createRoot();
    const database = new JobDatabase(root);
    try {
      const original = database.addJob({
        title: "原始岗位",
        company: "备份公司",
        salary: "",
        city: "杭州",
        link: "",
        description: "",
      });
      database.saveJobContact(original.id, null, {
        name: "备份联系人",
        role: "HR",
        channel: "BOSS",
        contactInfo: "",
        notes: "",
        lastContactAt: "",
      });
      const backupPath = await database.createBackup("restore-source");
      database.addJob({
        title: "备份后新增",
        company: "临时公司",
        salary: "",
        city: "宁波",
        link: "",
        description: "",
      });
      expect(database.listJobs()).toHaveLength(2);

      const restored = await database.restoreBackup(backupPath);
      expect(restored.safetyBackup).not.toBe(backupPath);
      expect(fs.existsSync(restored.safetyBackup)).toBe(true);
      expect(database.listJobs()).toHaveLength(1);
      expect(database.listJobs()[0].id).toBe(original.id);
      expect(database.getCrmWorkspace(original.id).contacts[0].name).toBe(
        "备份联系人",
      );
    } finally {
      database.close();
    }
  });

  it("stages, previews, imports and refreshes collected candidates", () => {
    const root = createRoot();
    const database = new JobDatabase(root);
    try {
      const collectedAt = new Date().toISOString();
      const candidate = {
        sourceKey: "boss:test-job-1",
        title: "软件实施工程师",
        company: "采集测试公司",
        salary: "7-10K",
        city: "杭州",
        district: "余杭区",
        experience: "经验不限",
        degree: "本科",
        industry: "企业服务",
        companyScale: "100-499人",
        skills: ["SQL", "客户培训"],
        category: "软件实施",
        score: 78,
        reason: "岗位方向匹配；经验不限",
        risks: [],
        description: "负责系统实施、客户培训和项目验收。",
        greeting: "您好，想了解岗位是否接受往届毕业生。",
        link: "https://www.zhipin.com/job_detail/test-job-1.html",
        sourceQueries: ["软件实施工程师"],
        collectedAt,
      };

      expect(
        database.stageCollectorCandidates("task-1", [candidate]),
      ).toMatchObject({
        addedToPreview: 1,
        refreshedInPreview: 0,
        existingInJobPool: 0,
      });
      expect(database.getCollectorPreview()).toMatchObject({
        counts: { total: 1, newInJobs: 1, existingInJobs: 0 },
      });

      expect(
        database.importCollectorCandidates([candidate.sourceKey]),
      ).toMatchObject({ imported: 1, updated: 0 });
      expect(database.listJobs({ query: "采集测试公司" })).toHaveLength(1);
      expect(database.getCollectorPreview().counts.total).toBe(0);

      expect(
        database.stageCollectorCandidates("task-2", [
          {
            ...candidate,
            salary: "8-12K",
            collectedAt: new Date().toISOString(),
          },
        ]),
      ).toMatchObject({
        addedToPreview: 0,
        refreshedInPreview: 1,
        existingInJobPool: 1,
      });
      expect(database.getCollectorPreview()).toMatchObject({
        counts: { total: 1, newInJobs: 0, existingInJobs: 1 },
      });
      expect(
        database.importCollectorCandidates([candidate.sourceKey]),
      ).toMatchObject({ imported: 0, updated: 1 });
      expect(database.listJobs({ query: "采集测试公司" })[0].salary).toBe(
        "8-12K",
      );

      database.saveCollectorCache([
        {
          key: "101210100|软件实施工程师|1",
          candidates: [candidate],
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      ]);
      expect(database.getCollectorCache()).toHaveLength(1);
    } finally {
      database.close();
    }
  });

  it("stores AI analysis results and reuses them by cache key", () => {
    const root = createRoot();
    const database = new JobDatabase(root);
    try {
      const job = database.addJob({
        title: "ERP实施工程师",
        company: "智能制造公司",
        salary: "7-10K",
        city: "宁波",
        link: "",
        description:
          "负责ERP系统实施、客户培训和上线交付。需要了解SQL和MySQL，能够接受偶尔出差。",
      });
      const context = database.getAiJobContext(job.id);
      const result = analyzeWithLocalRules(context);
      const running = database.createAiAnalysis({
        jobId: job.id,
        status: "running",
        provider: "local",
        model: "local-rules-v1",
        cacheKey: "cache-test",
        inputHash: "input-test",
        promptVersion: 1,
        schemaVersion: 1,
      });
      database.completeAiAnalysis(running.id, {
        result,
        latencyMs: 12,
        promptTokens: 0,
        completionTokens: 0,
      });
      expect(database.findCachedAiAnalysis("cache-test")).toMatchObject({
        status: "succeeded",
        provider: "local",
        result: { confidence: result.confidence },
      });
      expect(database.getLatestAiAnalysis(job.id)?.id).toBe(running.id);
      expect(database.getAiUsage(20)).toMatchObject({
        todayRemoteCalls: 0,
        totalAnalyses: 1,
      });
      expect(database.deleteAiAnalysis(running.id)).toBe(1);
      expect(database.getLatestAiAnalysis(job.id)).toBeNull();
    } finally {
      database.close();
    }
  });

  it("manages resume facts and only includes verified facts by default", () => {
    const root = createRoot();
    const database = new JobDatabase(root);
    try {
      const profile = database.saveResumeProfile({
        fullName: "测试同学",
        phone: "13800000000",
        email: "test@example.com",
        currentCity: "杭州",
        targetRoles: ["软件实施工程师", "技术支持工程师"],
        summary: "计算机本科，可立即到岗。",
      });
      expect(profile.fullName).toBe("测试同学");

      const verifiedFact = database.saveResumeFact(null, {
        kind: "项目经历",
        title: "电力设备采购平台",
        organization: "华北电力大学",
        role: "后端开发",
        startDate: "2025-09",
        endDate: "2026-05",
        location: "北京",
        bullets: ["完成设备查询和采购流程接口"],
        skills: ["Java", "MySQL"],
        evidence: "毕业设计源文件和论文",
        verified: true,
        sortOrder: 10,
      });
      const unverifiedFact = database.saveResumeFact(null, {
        kind: "实习经历",
        title: "数据整理实习",
        organization: "示例单位",
        role: "实习生",
        startDate: "2025-07",
        endDate: "2025-08",
        location: "丽水",
        bullets: ["整理业务数据"],
        skills: ["Excel"],
        evidence: "",
        verified: false,
        sortOrder: 20,
      });
      expect(database.getResumeWorkspace()).toMatchObject({
        stats: {
          totalFacts: 2,
          verifiedFacts: 1,
          readyForAi: true,
        },
      });

      expect(() =>
        database.saveResumeVersion(null, {
          name: "实施岗位版",
          targetRole: "软件实施工程师",
          template: "implementation",
          summary: "突出项目和交付能力。",
          selectedFactIds: [verifiedFact.id, unverifiedFact.id],
          includeUnverified: false,
        }),
      ).toThrow("未核实事实不能加入版本");

      const version = database.saveResumeVersion(null, {
        name: "实施岗位版",
        targetRole: "软件实施工程师",
        template: "implementation",
        summary: "突出项目和交付能力。",
        selectedFactIds: [verifiedFact.id],
        includeUnverified: false,
      });
      expect(database.getResumeDocumentData(version.id).facts).toHaveLength(1);

      expect(
        database.setResumeFactVerified(unverifiedFact.id, true).verified,
      ).toBe(true);
      database.saveResumeVersion(version.id, {
        name: "实施岗位版",
        targetRole: "软件实施工程师",
        template: "implementation",
        summary: "突出项目和交付能力。",
        selectedFactIds: [verifiedFact.id, unverifiedFact.id],
        includeUnverified: false,
      });
      expect(database.getResumeDocumentData(version.id).facts).toHaveLength(2);

      expect(database.deleteResumeFact(verifiedFact.id)).toBe(1);
      expect(
        database.getResumeWorkspace().versions[0].selectedFactIds,
      ).toEqual([unverifiedFact.id]);
    } finally {
      database.close();
    }
  });

  it("manages contacts, follow-ups, interviews and reminder metrics", () => {
    const root = createRoot();
    const database = new JobDatabase(root);
    try {
      const job = database.addJob({
        title: "技术支持工程师",
        company: "CRM测试公司",
        salary: "7-9K",
        city: "杭州",
        link: "",
        description: "负责客户支持和系统维护。",
      });
      const contact = database.saveJobContact(job.id, null, {
        name: "招聘老师",
        role: "HR",
        channel: "BOSS",
        contactInfo: "BOSS 站内",
        notes: "已确认接受往届生",
        lastContactAt: new Date().toISOString(),
      });
      expect(contact).toMatchObject({
        jobId: job.id,
        name: "招聘老师",
        channel: "BOSS",
      });

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const overdue = database.saveFollowUp(job.id, null, {
        title: "确认简历是否送达",
        dueAt: yesterday.toISOString(),
        status: "pending",
        notes: "",
      });
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const upcoming = database.saveFollowUp(job.id, null, {
        title: "询问面试安排",
        dueAt: tomorrow.toISOString(),
        status: "pending",
        notes: "",
      });
      expect(database.getCrmOverview().metrics).toMatchObject({
        overdue: 1,
        upcomingSevenDays: 1,
        openFollowUps: 2,
      });
      expect(database.getCrmWorkspace(job.id).followUps).toHaveLength(2);

      expect(database.setFollowUpStatus(overdue.id, "completed")).toMatchObject({
        status: "completed",
      });
      const interviewDate = new Date();
      interviewDate.setDate(interviewDate.getDate() + 3);
      const interview = database.saveInterview(job.id, null, {
        round: "一面",
        scheduledAt: interviewDate.toISOString(),
        mode: "视频",
        location: "腾讯会议",
        questions: ["如何排查客户现场问题？"],
        reflection: "",
        result: "待面试",
        nextStep: "复习 SQL",
      });
      expect(interview.round).toBe("一面");
      expect(database.getCrmOverview().metrics.scheduledInterviews).toBe(1);
      expect(database.getCrmWorkspace(job.id).events.length).toBeGreaterThan(2);

      expect(database.deleteFollowUp(overdue.id)).toBe(1);
      expect(database.deleteFollowUp(upcoming.id)).toBe(1);
      expect(database.deleteInterview(interview.id)).toBe(1);
      expect(database.deleteJobContact(contact.id)).toBe(1);
      expect(database.getCrmWorkspace(job.id).followUps).toHaveLength(0);
    } finally {
      database.close();
    }
  });

  it("persists tasks, resumes queued work and clears finished records", async () => {
    const root = createRoot();
    const database = new JobDatabase(root);
    const service = new TaskService(database);
    try {
      const queued = database.createTask("backup", {}, "backup-resume-test");
      service.resumeQueuedTasks();
      const completed = await waitFor(
        () => database.getTask(queued.id),
        (task) => task?.status === "succeeded",
      );
      expect(completed?.progress).toBe(100);
      expect(typeof completed?.result.path).toBe("string");

      const cancelled = database.createTask("future-worker", {});
      expect(service.cancel(cancelled.id).status).toBe("cancelled");

      const interrupted = database.createTask("future-worker", {});
      database.updateTask(interrupted.id, {
        status: "interrupted",
        error: "应用重启",
      });
      expect(database.listTasks("interrupted")).toHaveLength(1);

      const retried = service.retry(interrupted.id);
      const retryResult = await waitFor(
        () => database.getTask(retried.id),
        (task) => task?.status === "failed",
      );
      expect(retryResult?.attempts).toBe(1);
      expect(service.clearFinished().ok).toBe(true);
      expect(database.listTasks()).toHaveLength(0);
    } finally {
      service.shutdown();
      database.close();
    }
  });

  const currentLegacyPath = process.env.JOB_WORKBENCH_REAL_LEGACY_DB;
  it.skipIf(!currentLegacyPath || !fs.existsSync(currentLegacyPath))(
    "migrates the current V0.5 database without data loss",
    async () => {
      const root = createRoot();
      const database = new JobDatabase(root);
      try {
        const preview = database.inspectLegacyDatabase(currentLegacyPath!);
        expect(preview.integrity).toBe("ok");
        const result = await database.migrateLegacy(currentLegacyPath!);
        expect(database.listJobs({ archived: "all" })).toHaveLength(
          preview.counts.jobs,
        );
        expect(fs.existsSync(result.backupPath)).toBe(true);
        expect(database.getSchemaVersion()).toBe(6);
      } finally {
        database.close();
      }
    },
  );
});
