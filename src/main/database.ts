import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  DatabaseSync,
  backup as backupDatabase,
} from "node:sqlite";
import type {
  DashboardData,
  JobRecord,
  JobStatus,
  ManualJobInput,
} from "../shared/contracts";

type SqlRow = Record<string, unknown>;

function sqlValue(
  value: unknown,
): string | number | bigint | null | Uint8Array {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    value instanceof Uint8Array
  ) {
    return value;
  }
  return value === undefined ? null : String(value);
}

const JOB_COLUMNS = `
  id, title, company, salary, city, district, experience, degree, industry,
  company_scale, skills_json, category, score, grade, reason, risks_json,
  description, greeting, link, source, source_queries_json, status, favorite,
  notes, contacted_at, applied_at, next_follow_up_at, first_seen_at,
  last_seen_at, updated_at
`;

export class JobDatabase {
  readonly dataDir: string;
  readonly databasePath: string;
  readonly backupDir: string;
  private db: DatabaseSync;

  constructor(userDataDir: string) {
    this.dataDir = path.join(userDataDir, "data");
    this.databasePath = path.join(this.dataDir, "job-workbench.sqlite");
    this.backupDir = path.join(userDataDir, "backups");
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.mkdirSync(this.backupDir, { recursive: true });

    this.db = new DatabaseSync(this.databasePath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        company TEXT NOT NULL,
        salary TEXT NOT NULL DEFAULT '',
        city TEXT NOT NULL DEFAULT '',
        district TEXT NOT NULL DEFAULT '',
        experience TEXT NOT NULL DEFAULT '',
        degree TEXT NOT NULL DEFAULT '',
        industry TEXT NOT NULL DEFAULT '',
        company_scale TEXT NOT NULL DEFAULT '',
        skills_json TEXT NOT NULL DEFAULT '[]',
        category TEXT NOT NULL DEFAULT '',
        score INTEGER NOT NULL DEFAULT 0,
        grade TEXT NOT NULL DEFAULT '',
        reason TEXT NOT NULL DEFAULT '',
        risks_json TEXT NOT NULL DEFAULT '[]',
        description TEXT NOT NULL DEFAULT '',
        greeting TEXT NOT NULL DEFAULT '',
        link TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT '手工添加',
        source_queries_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT '待判断',
        favorite INTEGER NOT NULL DEFAULT 0,
        notes TEXT NOT NULL DEFAULT '',
        contacted_at TEXT,
        applied_at TEXT,
        next_follow_up_at TEXT,
        archived_at TEXT,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS job_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        from_status TEXT,
        to_status TEXT,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS resume_profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        full_name TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        current_city TEXT NOT NULL DEFAULT '',
        target_roles_json TEXT NOT NULL DEFAULT '[]',
        summary TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS resume_facts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        organization TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL DEFAULT '',
        start_date TEXT NOT NULL DEFAULT '',
        end_date TEXT NOT NULL DEFAULT '',
        location TEXT NOT NULL DEFAULT '',
        bullets_json TEXT NOT NULL DEFAULT '[]',
        skills_json TEXT NOT NULL DEFAULT '[]',
        evidence TEXT NOT NULL DEFAULT '',
        verified INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS resume_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        target_role TEXT NOT NULL DEFAULT '',
        template TEXT NOT NULL DEFAULT 'general',
        summary TEXT NOT NULL DEFAULT '',
        selected_fact_ids_json TEXT NOT NULL DEFAULT '[]',
        include_unverified INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
      CREATE INDEX IF NOT EXISTS idx_jobs_archived ON jobs(archived_at);
      CREATE INDEX IF NOT EXISTS idx_job_events_job ON job_events(job_id, created_at DESC);
    `);

    this.ensureArchivedColumn();
  }

  private ensureArchivedColumn() {
    const columns = this.db
      .prepare("PRAGMA table_info(jobs)")
      .all() as SqlRow[];
    if (!columns.some((column) => column.name === "archived_at")) {
      this.db.exec("ALTER TABLE jobs ADD COLUMN archived_at TEXT");
    }
  }

  private rowToJob(row: SqlRow): JobRecord {
    return {
      id: String(row.id),
      title: String(row.title || ""),
      company: String(row.company || ""),
      salary: String(row.salary || ""),
      city: String(row.city || ""),
      district: String(row.district || ""),
      experience: String(row.experience || ""),
      degree: String(row.degree || ""),
      category: String(row.category || ""),
      score: Number(row.score || 0),
      status: String(row.status || "待判断") as JobStatus,
      favorite: Boolean(row.favorite),
      notes: String(row.notes || ""),
      description: String(row.description || ""),
      link: String(row.link || ""),
      archivedAt: row.archived_at ? String(row.archived_at) : null,
      createdAt: String(row.first_seen_at || ""),
      updatedAt: String(row.updated_at || ""),
    };
  }

  getJob(id: string): JobRecord | null {
    const row = this.db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as
      | SqlRow
      | undefined;
    return row ? this.rowToJob(row) : null;
  }

  listJobs(includeArchived = false): JobRecord[] {
    const where = includeArchived ? "" : "WHERE archived_at IS NULL";
    return (
      this.db
        .prepare(
          `SELECT * FROM jobs ${where}
           ORDER BY favorite DESC, score DESC, updated_at DESC`,
        )
        .all() as SqlRow[]
    ).map((row) => this.rowToJob(row));
  }

  getDashboard(): DashboardData {
    const total = Number(
      (this.db.prepare("SELECT COUNT(*) AS count FROM jobs").get() as SqlRow)
        .count || 0,
    );
    const archived = Number(
      (
        this.db
          .prepare(
            "SELECT COUNT(*) AS count FROM jobs WHERE archived_at IS NOT NULL",
          )
          .get() as SqlRow
      ).count || 0,
    );
    const average = Number(
      (
        this.db
          .prepare("SELECT COALESCE(ROUND(AVG(score), 1), 0) AS value FROM jobs")
          .get() as SqlRow
      ).value || 0,
    );
    const statusRows = this.db
      .prepare("SELECT status, COUNT(*) AS count FROM jobs GROUP BY status")
      .all() as SqlRow[];
    const statusCounts = Object.fromEntries(
      statusRows.map((row) => [String(row.status), Number(row.count)]),
    );
    const lastBackup = this.db
      .prepare("SELECT value FROM app_settings WHERE key = 'lastBackupPath'")
      .get() as SqlRow | undefined;

    return {
      total,
      active: total - archived,
      archived,
      averageScore: average,
      statusCounts,
      databasePath: this.databasePath,
      lastBackupPath: lastBackup ? String(lastBackup.value) : null,
    };
  }

  addJob(input: ManualJobInput): JobRecord {
    const timestamp = new Date().toISOString();
    const id = `manual-${randomUUID()}`;
    this.db
      .prepare(`
        INSERT INTO jobs (
          id, title, company, salary, city, district, description, link,
          source, status, first_seen_at, last_seen_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, '', ?, ?, '手工添加', '待判断', ?, ?, ?)
      `)
      .run(
        id,
        input.title,
        input.company,
        input.salary,
        input.city,
        input.description,
        input.link,
        timestamp,
        timestamp,
        timestamp,
      );
    return this.getJob(id)!;
  }

  updateStatus(id: string, status: JobStatus): JobRecord {
    const current = this.getJob(id);
    if (!current) throw new Error("岗位不存在");
    const timestamp = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?")
        .run(status, timestamp, id);
      this.db
        .prepare(`
          INSERT INTO job_events (
            job_id, event_type, from_status, to_status, note, created_at
          ) VALUES (?, 'status_change', ?, ?, '', ?)
        `)
        .run(id, current.status, status, timestamp);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.getJob(id)!;
  }

  setArchived(ids: string[], archived: boolean): number {
    if (!ids.length) return 0;
    const placeholders = ids.map(() => "?").join(", ");
    const timestamp = new Date().toISOString();
    const result = this.db
      .prepare(
        `UPDATE jobs
         SET archived_at = ?, updated_at = ?
         WHERE id IN (${placeholders})`,
      )
      .run(archived ? timestamp : null, timestamp, ...ids);
    return Number(result.changes);
  }

  async createBackup(label = "manual"): Promise<string> {
    const stamp = new Date()
      .toISOString()
      .replaceAll(":", "")
      .replaceAll("-", "")
      .replace("T", "-")
      .slice(0, 15);
    const destination = path.join(
      this.backupDir,
      `job-workbench-${stamp}-${label}.sqlite`,
    );
    await backupDatabase(this.db, destination);
    this.db
      .prepare(`
        INSERT INTO app_settings (key, value, updated_at)
        VALUES ('lastBackupPath', ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `)
      .run(destination, new Date().toISOString());
    return destination;
  }

  async migrateLegacy(sourcePath: string): Promise<{
    sourcePath: string;
    backupPath: string;
    counts: Record<string, number>;
  }> {
    if (!fs.existsSync(sourcePath)) throw new Error("旧数据库不存在");
    const backupPath = await this.createBackup("before-migration");
    const source = new DatabaseSync(sourcePath, { readOnly: true });
    const counts: Record<string, number> = {};
    try {
      const sourceTables = new Set(
        (
          source
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
            .all() as SqlRow[]
        ).map((row) => String(row.name)),
      );

      this.db.exec("BEGIN IMMEDIATE");
      try {
        if (sourceTables.has("jobs")) {
          const sourceJobs = source
            .prepare(`SELECT ${JOB_COLUMNS} FROM jobs`)
            .all() as SqlRow[];
          const insert = this.db.prepare(`
            INSERT INTO jobs (
              id, title, company, salary, city, district, experience, degree,
              industry, company_scale, skills_json, category, score, grade,
              reason, risks_json, description, greeting, link, source,
              source_queries_json, status, favorite, notes, contacted_at,
              applied_at, next_follow_up_at, first_seen_at, last_seen_at,
              updated_at, archived_at
            ) VALUES (
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
            ON CONFLICT(id) DO UPDATE SET
              title = excluded.title,
              company = excluded.company,
              salary = excluded.salary,
              city = excluded.city,
              district = excluded.district,
              description = excluded.description,
              link = excluded.link,
              updated_at = excluded.updated_at
          `);
          for (const row of sourceJobs) {
            insert.run(
              ...JOB_COLUMNS.split(",").map((column) =>
                sqlValue(row[column.trim()]),
              ),
              null,
            );
          }
          counts.jobs = sourceJobs.length;
        }

        for (const [table, columns] of Object.entries({
          job_events: [
            "job_id",
            "event_type",
            "from_status",
            "to_status",
            "note",
            "created_at",
          ],
          resume_profile: [
            "id",
            "full_name",
            "phone",
            "email",
            "current_city",
            "target_roles_json",
            "summary",
            "updated_at",
          ],
          resume_facts: [
            "id",
            "kind",
            "title",
            "organization",
            "role",
            "start_date",
            "end_date",
            "location",
            "bullets_json",
            "skills_json",
            "evidence",
            "verified",
            "sort_order",
            "created_at",
            "updated_at",
          ],
          resume_versions: [
            "id",
            "name",
            "target_role",
            "template",
            "summary",
            "selected_fact_ids_json",
            "include_unverified",
            "created_at",
            "updated_at",
          ],
        })) {
          if (!sourceTables.has(table)) continue;
          const rows = source
            .prepare(`SELECT ${columns.join(", ")} FROM ${table}`)
            .all() as SqlRow[];
          if (!rows.length) {
            counts[table] = 0;
            continue;
          }
          const placeholders = columns.map(() => "?").join(", ");
          const insert = this.db.prepare(
            `INSERT OR REPLACE INTO ${table} (${columns.join(", ")})
             VALUES (${placeholders})`,
          );
          for (const row of rows) {
            insert.run(...columns.map((column) => sqlValue(row[column])));
          }
          counts[table] = rows.length;
        }

        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
    } finally {
      source.close();
    }
    return { sourcePath, backupPath, counts };
  }

  getResumeDocumentData(): {
    profile: SqlRow | null;
    facts: SqlRow[];
  } {
    const profile = this.db
      .prepare("SELECT * FROM resume_profile WHERE id = 1")
      .get() as SqlRow | undefined;
    const facts = this.db
      .prepare(
        "SELECT * FROM resume_facts WHERE verified = 1 ORDER BY sort_order, id",
      )
      .all() as SqlRow[];
    return { profile: profile || null, facts };
  }

  close() {
    this.db.close();
  }
}
