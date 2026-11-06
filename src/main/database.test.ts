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
    } finally {
      target.close();
      legacy.close();
    }
  });
});
