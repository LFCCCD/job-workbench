import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JobDatabase } from "./database";

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
        schemaVersion: 2,
        pendingTasks: 0,
      });

      database.updateStatus(job.id, "准备沟通");
      expect(database.getJob(job.id)?.status).toBe("准备沟通");

      expect(database.setArchived([job.id], true)).toBe(1);
      expect(database.listJobs()).toHaveLength(0);
      expect(database.listJobs(true)).toHaveLength(1);

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
        expect(database.listJobs(true)).toHaveLength(preview.counts.jobs);
        expect(fs.existsSync(result.backupPath)).toBe(true);
        expect(database.getSchemaVersion()).toBe(2);
      } finally {
        database.close();
      }
    },
  );
});
