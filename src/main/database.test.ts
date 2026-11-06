import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JobDatabase } from "./database";
import { TaskService } from "./task-service";

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
        schemaVersion: 4,
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
        expect(database.getSchemaVersion()).toBe(4);
      } finally {
        database.close();
      }
    },
  );
});
