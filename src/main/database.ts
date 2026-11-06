import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  DatabaseSync,
  backup as backupDatabase,
} from "node:sqlite";
import {
  AiAnalysisResultSchema,
  CollectorCacheEntrySchema,
  CollectorCandidateSchema,
  ListJobsSchema,
} from "../shared/contracts";
import type {
  AiAnalysisRecord,
  AiAnalysisStatus,
  AiAnalysisResult,
  AiJobContext,
  AiResumeFactInput,
  AiResumeVersionInput,
  CollectorCacheEntry,
  CollectorCandidate,
  CollectorCandidatePreview,
  CollectorImportResult,
  CollectorPreviewData,
  DashboardData,
  JobDetail,
  JobEventRecord,
  JobFilters,
  JobRecord,
  JobRecordUpdate,
  JobStatus,
  ManualJobInput,
  MigrationPreview,
  MigrationResult,
  RestoreResult,
  SavedView,
  TaskRecord,
  TaskStatus,
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

const CURRENT_SCHEMA_VERSION = 5;
const REQUIRED_TABLES = [
  "jobs",
  "job_events",
  "resume_profile",
  "resume_facts",
  "resume_versions",
  "app_settings",
  "ai_analyses",
] as const;

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

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        progress INTEGER NOT NULL DEFAULT 0,
        payload_json TEXT NOT NULL DEFAULT '{}',
        result_json TEXT NOT NULL DEFAULT '{}',
        error TEXT NOT NULL DEFAULT '',
        attempts INTEGER NOT NULL DEFAULT 0,
        idempotency_key TEXT UNIQUE,
        created_at TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT,
        heartbeat_at TEXT
      );

      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS saved_views (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        filters_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS collector_candidates (
        source_key TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
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
        reason TEXT NOT NULL DEFAULT '',
        risks_json TEXT NOT NULL DEFAULT '[]',
        description TEXT NOT NULL DEFAULT '',
        greeting TEXT NOT NULL DEFAULT '',
        link TEXT NOT NULL DEFAULT '',
        source_queries_json TEXT NOT NULL DEFAULT '[]',
        seen_count INTEGER NOT NULL DEFAULT 1,
        state TEXT NOT NULL DEFAULT 'pending',
        imported_job_id TEXT,
        collected_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS collector_cache (
        cache_key TEXT PRIMARY KEY,
        candidates_json TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ai_analyses (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        cache_key TEXT NOT NULL,
        input_hash TEXT NOT NULL,
        prompt_version INTEGER NOT NULL,
        schema_version INTEGER NOT NULL,
        result_json TEXT NOT NULL DEFAULT '{}',
        error TEXT NOT NULL DEFAULT '',
        cached_from_id TEXT,
        latency_ms INTEGER NOT NULL DEFAULT 0,
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
      CREATE INDEX IF NOT EXISTS idx_jobs_archived ON jobs(archived_at);
      CREATE INDEX IF NOT EXISTS idx_job_events_job ON job_events(job_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_collector_candidates_state
        ON collector_candidates(state, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ai_analyses_job
        ON ai_analyses(job_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ai_analyses_cache
        ON ai_analyses(cache_key, status, created_at DESC);
    `);

    this.ensureArchivedColumn();
    this.ensureSourceKeyColumn();
    this.applyMigrations();
    this.checkIntegrity();
    this.markInterruptedTasks();
  }

  private ensureArchivedColumn() {
    const columns = this.db
      .prepare("PRAGMA table_info(jobs)")
      .all() as SqlRow[];
    if (!columns.some((column) => column.name === "archived_at")) {
      this.db.exec("ALTER TABLE jobs ADD COLUMN archived_at TEXT");
    }
  }

  private ensureSourceKeyColumn() {
    const columns = this.db
      .prepare("PRAGMA table_info(jobs)")
      .all() as SqlRow[];
    if (!columns.some((column) => column.name === "source_key")) {
      this.db.exec("ALTER TABLE jobs ADD COLUMN source_key TEXT");
    }
    this.db.exec(
      "CREATE INDEX IF NOT EXISTS idx_jobs_source_key ON jobs(source_key)",
    );
  }

  getSchemaVersion(): number {
    const row = this.db
      .prepare(
        "SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations",
      )
      .get() as SqlRow;
    return Number(row.version || 0);
  }

  private applyMigrations() {
    const record = this.db.prepare(`
      INSERT OR IGNORE INTO schema_migrations (version, name, applied_at)
      VALUES (?, ?, ?)
    `);
    const timestamp = new Date().toISOString();
    if (this.getSchemaVersion() < 1) {
      record.run(1, "initial-desktop-schema", timestamp);
    }
    if (this.getSchemaVersion() < 2) {
      const tableNames = new Set(
        (
          this.db
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
            .all() as SqlRow[]
        ).map((row) => String(row.name)),
      );
      if (!tableNames.has("tasks") || !tableNames.has("schema_migrations")) {
        throw new Error("M2 schema migration prerequisites are missing");
      }
      record.run(2, "durable-tasks-and-archive", timestamp);
    }
    if (this.getSchemaVersion() < 3) {
      const tableNames = new Set(
        (
          this.db
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
            .all() as SqlRow[]
        ).map((row) => String(row.name)),
      );
      if (!tableNames.has("saved_views")) {
        throw new Error("M2 saved views migration is missing");
      }
      record.run(3, "job-filters-and-saved-views", timestamp);
    }
    if (this.getSchemaVersion() < 4) {
      const tableNames = new Set(
        (
          this.db
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
            .all() as SqlRow[]
        ).map((row) => String(row.name)),
      );
      const jobColumns = new Set(
        (
          this.db.prepare("PRAGMA table_info(jobs)").all() as SqlRow[]
        ).map((row) => String(row.name)),
      );
      if (
        !tableNames.has("collector_candidates") ||
        !tableNames.has("collector_cache") ||
        !jobColumns.has("source_key")
      ) {
        throw new Error("M2 collector migration prerequisites are missing");
      }
      record.run(4, "collector-candidate-staging-and-cache", timestamp);
    }
    if (this.getSchemaVersion() < 5) {
      const tableNames = new Set(
        (
          this.db
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
            .all() as SqlRow[]
        ).map((row) => String(row.name)),
      );
      if (!tableNames.has("ai_analyses")) {
        throw new Error("M4 AI analysis migration prerequisites are missing");
      }
      record.run(5, "ai-analysis-results-and-cache", timestamp);
    }
    if (this.getSchemaVersion() > CURRENT_SCHEMA_VERSION) {
      throw new Error("数据库版本高于当前应用版本");
    }
    this.db.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION}`);
  }

  checkIntegrity(): string {
    const row = this.db.prepare("PRAGMA integrity_check").get() as SqlRow;
    const result = String(row.integrity_check || "");
    if (result !== "ok") {
      throw new Error(`数据库完整性检查失败：${result}`);
    }
    return result;
  }

  private markInterruptedTasks() {
    this.db
      .prepare(`
        UPDATE tasks
        SET status = 'interrupted',
            error = '应用重启时任务尚未完成',
            finished_at = ?
        WHERE status = 'running'
      `)
      .run(new Date().toISOString());
  }

  createTask(
    type: string,
    payload: Record<string, unknown> = {},
    idempotencyKey: string | null = null,
  ): TaskRecord {
    if (idempotencyKey) {
      const existing = this.db
        .prepare("SELECT * FROM tasks WHERE idempotency_key = ?")
        .get(idempotencyKey) as SqlRow | undefined;
      if (existing) return this.rowToTask(existing);
    }
    const id = `task-${randomUUID()}`;
    const timestamp = new Date().toISOString();
    this.db
      .prepare(`
        INSERT INTO tasks (
          id, type, status, progress, payload_json, result_json, error,
          attempts, idempotency_key, created_at
        ) VALUES (?, ?, 'queued', 0, ?, '{}', '', 0, ?, ?)
      `)
      .run(
        id,
        type,
        JSON.stringify(payload),
        idempotencyKey,
        timestamp,
      );
    return this.getTask(id)!;
  }

  getTask(id: string): TaskRecord | null {
    const row = this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as
      | SqlRow
      | undefined;
    return row ? this.rowToTask(row) : null;
  }

  listTasks(status?: TaskStatus | null): TaskRecord[] {
    const rows = status
      ? (this.db
          .prepare(
            "SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC",
          )
          .all(status) as SqlRow[])
      : (this.db
          .prepare("SELECT * FROM tasks ORDER BY created_at DESC LIMIT 100")
          .all() as SqlRow[]);
    return rows.map((row) => this.rowToTask(row));
  }

  updateTask(
    id: string,
    patch: {
      status?: TaskStatus;
      progress?: number;
      result?: Record<string, unknown>;
      error?: string;
      attempts?: number;
    },
  ): TaskRecord {
    const current = this.getTask(id);
    if (!current) throw new Error("任务不存在");
    const timestamp = new Date().toISOString();
    const status = patch.status || current.status;
    this.db
      .prepare(`
        UPDATE tasks SET
          status = ?, progress = ?, result_json = ?, error = ?, attempts = ?,
          started_at = CASE
            WHEN ? = 'running' AND started_at IS NULL THEN ?
            ELSE started_at
          END,
          finished_at = CASE
            WHEN ? IN ('succeeded', 'failed', 'cancelled', 'interrupted')
              THEN ?
            ELSE finished_at
          END,
          heartbeat_at = ?
        WHERE id = ?
      `)
      .run(
        status,
        Math.max(0, Math.min(100, patch.progress ?? current.progress)),
        JSON.stringify(patch.result ?? current.result),
        patch.error ?? current.error,
        patch.attempts ?? current.attempts,
        status,
        timestamp,
        status,
        timestamp,
        timestamp,
        id,
      );
    return this.getTask(id)!;
  }

  clearFinishedTasks(): number {
    const result = this.db
      .prepare(
        `DELETE FROM tasks
         WHERE status IN ('succeeded', 'failed', 'cancelled', 'interrupted')`,
      )
      .run();
    return Number(result.changes);
  }

  getCollectorPreview(): CollectorPreviewData {
    const rows = this.db
      .prepare(`
        SELECT
          candidate.*,
          CASE WHEN job.id IS NULL THEN 0 ELSE 1 END AS exists_in_jobs
        FROM collector_candidates AS candidate
        LEFT JOIN jobs AS job ON job.source_key = candidate.source_key
        WHERE candidate.state = 'pending'
        ORDER BY
          CASE WHEN job.id IS NULL THEN 0 ELSE 1 END,
          candidate.score DESC,
          candidate.updated_at DESC
      `)
      .all() as SqlRow[];
    const candidates = rows.map(
      (row): CollectorCandidatePreview => ({
        candidate: this.rowToCollectorCandidate(row),
        taskId: String(row.task_id),
        seenCount: Number(row.seen_count || 1),
        existsInJobs: Boolean(row.exists_in_jobs),
        updatedAt: String(row.updated_at),
      }),
    );
    const existingInJobs = candidates.filter(
      (candidate) => candidate.existsInJobs,
    ).length;
    return {
      candidates,
      counts: {
        total: candidates.length,
        newInJobs: candidates.length - existingInJobs,
        existingInJobs,
      },
    };
  }

  stageCollectorCandidates(
    taskId: string,
    input: CollectorCandidate[],
  ): {
    addedToPreview: number;
    refreshedInPreview: number;
    existingInJobPool: number;
  } {
    const candidates = input.map((candidate) =>
      CollectorCandidateSchema.parse(candidate),
    );
    const timestamp = new Date().toISOString();
    const insert = this.db.prepare(`
      INSERT INTO collector_candidates (
        source_key, task_id, title, company, salary, city, district,
        experience, degree, industry, company_scale, skills_json, category,
        score, reason, risks_json, description, greeting, link,
        source_queries_json, seen_count, state, imported_job_id,
        collected_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        1, 'pending', NULL, ?, ?
      )
      ON CONFLICT(source_key) DO UPDATE SET
        task_id = excluded.task_id,
        title = excluded.title,
        company = excluded.company,
        salary = excluded.salary,
        city = excluded.city,
        district = excluded.district,
        experience = excluded.experience,
        degree = excluded.degree,
        industry = excluded.industry,
        company_scale = excluded.company_scale,
        skills_json = excluded.skills_json,
        category = excluded.category,
        score = excluded.score,
        reason = excluded.reason,
        risks_json = excluded.risks_json,
        description = excluded.description,
        greeting = excluded.greeting,
        link = excluded.link,
        source_queries_json = excluded.source_queries_json,
        seen_count = collector_candidates.seen_count + 1,
        state = 'pending',
        imported_job_id = NULL,
        collected_at = excluded.collected_at,
        updated_at = excluded.updated_at
    `);
    let addedToPreview = 0;
    let refreshedInPreview = 0;
    let existingInJobPool = 0;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const candidate of candidates) {
        const previous = this.db
          .prepare(
            "SELECT source_key FROM collector_candidates WHERE source_key = ?",
          )
          .get(candidate.sourceKey);
        const existingJob = this.db
          .prepare("SELECT id FROM jobs WHERE source_key = ? LIMIT 1")
          .get(candidate.sourceKey);
        if (previous) refreshedInPreview += 1;
        else addedToPreview += 1;
        if (existingJob) existingInJobPool += 1;
        insert.run(
          candidate.sourceKey,
          taskId,
          candidate.title,
          candidate.company,
          candidate.salary,
          candidate.city,
          candidate.district,
          candidate.experience,
          candidate.degree,
          candidate.industry,
          candidate.companyScale,
          JSON.stringify(candidate.skills),
          candidate.category,
          candidate.score,
          candidate.reason,
          JSON.stringify(candidate.risks),
          candidate.description,
          candidate.greeting,
          candidate.link,
          JSON.stringify(candidate.sourceQueries),
          candidate.collectedAt,
          timestamp,
        );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return { addedToPreview, refreshedInPreview, existingInJobPool };
  }

  importCollectorCandidates(ids: string[]): CollectorImportResult {
    const uniqueIds = [...new Set(ids)];
    if (!uniqueIds.length) {
      return { imported: 0, updated: 0, message: "没有选择候选岗位" };
    }
    const placeholders = uniqueIds.map(() => "?").join(", ");
    const candidates = this.db
      .prepare(
        `SELECT * FROM collector_candidates
         WHERE state = 'pending' AND source_key IN (${placeholders})`,
      )
      .all(...uniqueIds) as SqlRow[];
    const timestamp = new Date().toISOString();
    let imported = 0;
    let updated = 0;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const row of candidates) {
        const candidate = this.rowToCollectorCandidate(row);
        const existing = this.db
          .prepare("SELECT id FROM jobs WHERE source_key = ? LIMIT 1")
          .get(candidate.sourceKey) as SqlRow | undefined;
        let jobId: string;
        if (existing) {
          jobId = String(existing.id);
          this.db
            .prepare(`
              UPDATE jobs SET
                title = ?, company = ?, salary = ?, city = ?, district = ?,
                experience = ?, degree = ?, industry = ?, company_scale = ?,
                skills_json = ?, category = ?, score = ?, grade = ?,
                reason = ?, risks_json = ?, description = ?, greeting = ?,
                link = ?, source_queries_json = ?, last_seen_at = ?,
                updated_at = ?
              WHERE id = ?
            `)
            .run(
              candidate.title,
              candidate.company,
              candidate.salary,
              candidate.city,
              candidate.district,
              candidate.experience,
              candidate.degree,
              candidate.industry,
              candidate.companyScale,
              JSON.stringify(candidate.skills),
              candidate.category,
              candidate.score,
              this.gradeForScore(candidate.score),
              candidate.reason,
              JSON.stringify(candidate.risks),
              candidate.description,
              candidate.greeting,
              candidate.link,
              JSON.stringify(candidate.sourceQueries),
              candidate.collectedAt,
              timestamp,
              jobId,
            );
          updated += 1;
        } else {
          jobId = `collected-${randomUUID()}`;
          this.db
            .prepare(`
              INSERT INTO jobs (
                id, title, company, salary, city, district, experience,
                degree, industry, company_scale, skills_json, category, score,
                grade, reason, risks_json, description, greeting, link, source,
                source_key, source_queries_json, status, favorite, notes,
                first_seen_at, last_seen_at, updated_at
              ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                'BOSS采集', ?, ?, '待判断', 0, '', ?, ?, ?
              )
            `)
            .run(
              jobId,
              candidate.title,
              candidate.company,
              candidate.salary,
              candidate.city,
              candidate.district,
              candidate.experience,
              candidate.degree,
              candidate.industry,
              candidate.companyScale,
              JSON.stringify(candidate.skills),
              candidate.category,
              candidate.score,
              this.gradeForScore(candidate.score),
              candidate.reason,
              JSON.stringify(candidate.risks),
              candidate.description,
              candidate.greeting,
              candidate.link,
              candidate.sourceKey,
              JSON.stringify(candidate.sourceQueries),
              candidate.collectedAt,
              candidate.collectedAt,
              timestamp,
            );
          imported += 1;
        }
        this.db
          .prepare(`
            UPDATE collector_candidates
            SET state = 'imported', imported_job_id = ?, updated_at = ?
            WHERE source_key = ?
          `)
          .run(jobId, timestamp, candidate.sourceKey);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return {
      imported,
      updated,
      message: `已导入 ${imported} 个岗位，更新 ${updated} 个已有岗位`,
    };
  }

  dismissCollectorCandidates(ids: string[]): number {
    if (!ids.length) return 0;
    const placeholders = ids.map(() => "?").join(", ");
    const result = this.db
      .prepare(
        `DELETE FROM collector_candidates
         WHERE state = 'pending' AND source_key IN (${placeholders})`,
      )
      .run(...[...new Set(ids)]);
    return Number(result.changes);
  }

  getCollectorCache(): CollectorCacheEntry[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM collector_cache WHERE expires_at > ? ORDER BY updated_at DESC",
      )
      .all(new Date().toISOString()) as SqlRow[];
    return rows.map((row) =>
      CollectorCacheEntrySchema.parse({
        key: String(row.cache_key),
        candidates: JSON.parse(String(row.candidates_json || "[]")),
        expiresAt: String(row.expires_at),
      }),
    );
  }

  saveCollectorCache(entries: CollectorCacheEntry[]): number {
    if (!entries.length) return 0;
    const timestamp = new Date().toISOString();
    const statement = this.db.prepare(`
      INSERT INTO collector_cache (
        cache_key, candidates_json, expires_at, updated_at
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET
        candidates_json = excluded.candidates_json,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at
    `);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const entry of entries) {
        statement.run(
          entry.key,
          JSON.stringify(entry.candidates),
          entry.expiresAt,
          timestamp,
        );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return entries.length;
  }

  getAppSetting(key: string): string | null {
    const row = this.db
      .prepare("SELECT value FROM app_settings WHERE key = ?")
      .get(key) as SqlRow | undefined;
    return row ? String(row.value) : null;
  }

  setAppSetting(key: string, value: string): void {
    this.db
      .prepare(`
        INSERT INTO app_settings (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `)
      .run(key, value, new Date().toISOString());
  }

  getAiJobContext(jobId: string): AiJobContext {
    const job = this.getJob(jobId);
    if (!job) throw new Error("岗位不存在");
    const factRows = this.db
      .prepare(
        "SELECT * FROM resume_facts WHERE verified = 1 ORDER BY sort_order, id",
      )
      .all() as SqlRow[];
    const facts = factRows.map(
      (row): AiResumeFactInput => ({
        id: String(row.id),
        kind: String(row.kind || ""),
        title: String(row.title || ""),
        organization: String(row.organization || ""),
        role: String(row.role || ""),
        startDate: String(row.start_date || ""),
        endDate: String(row.end_date || ""),
        location: String(row.location || ""),
        bullets: JSON.parse(String(row.bullets_json || "[]")) as string[],
        skills: JSON.parse(String(row.skills_json || "[]")) as string[],
        evidence: String(row.evidence || ""),
      }),
    );
    const versionRows = this.db
      .prepare(
        "SELECT * FROM resume_versions ORDER BY updated_at DESC, id DESC",
      )
      .all() as SqlRow[];
    const resumeVersions = versionRows.map(
      (row): AiResumeVersionInput => ({
        id: String(row.id),
        name: String(row.name || ""),
        targetRole: String(row.target_role || ""),
        summary: String(row.summary || ""),
        selectedFactIds: JSON.parse(
          String(row.selected_fact_ids_json || "[]"),
        ) as string[],
      }),
    );
    const factsVersion = createHash("sha256")
      .update(JSON.stringify(facts))
      .digest("hex");
    return { job, facts, resumeVersions, factsVersion };
  }

  createAiAnalysis(input: {
    jobId: string;
    status: AiAnalysisStatus;
    provider: string;
    model: string;
    cacheKey: string;
    inputHash: string;
    promptVersion: number;
    schemaVersion: number;
    result?: AiAnalysisResult | null;
    error?: string;
    cachedFromId?: string | null;
    latencyMs?: number;
    promptTokens?: number;
    completionTokens?: number;
  }): AiAnalysisRecord {
    const id = `analysis-${randomUUID()}`;
    const timestamp = new Date().toISOString();
    this.db
      .prepare(`
        INSERT INTO ai_analyses (
          id, job_id, status, provider, model, cache_key, input_hash,
          prompt_version, schema_version, result_json, error, cached_from_id,
          latency_ms, prompt_tokens, completion_tokens, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        input.jobId,
        input.status,
        input.provider,
        input.model,
        input.cacheKey,
        input.inputHash,
        input.promptVersion,
        input.schemaVersion,
        JSON.stringify(input.result || null),
        input.error || "",
        input.cachedFromId || null,
        input.latencyMs || 0,
        input.promptTokens || 0,
        input.completionTokens || 0,
        timestamp,
        timestamp,
      );
    return this.getAiAnalysis(id)!;
  }

  completeAiAnalysis(
    id: string,
    input: {
      result: AiAnalysisResult;
      latencyMs: number;
      promptTokens: number;
      completionTokens: number;
    },
  ): AiAnalysisRecord {
    this.db
      .prepare(`
        UPDATE ai_analyses SET
          status = 'succeeded',
          result_json = ?,
          error = '',
          latency_ms = ?,
          prompt_tokens = ?,
          completion_tokens = ?,
          updated_at = ?
        WHERE id = ?
      `)
      .run(
        JSON.stringify(input.result),
        input.latencyMs,
        input.promptTokens,
        input.completionTokens,
        new Date().toISOString(),
        id,
      );
    return this.getAiAnalysis(id)!;
  }

  finishAiAnalysis(
    id: string,
    status: "failed" | "cancelled" | "running",
    error: string,
  ): AiAnalysisRecord {
    this.db
      .prepare(`
        UPDATE ai_analyses
        SET status = ?, error = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(status, error.slice(0, 4_000), new Date().toISOString(), id);
    return this.getAiAnalysis(id)!;
  }

  findCachedAiAnalysis(cacheKey: string): AiAnalysisRecord | null {
    const row = this.db
      .prepare(`
        SELECT * FROM ai_analyses
        WHERE cache_key = ? AND status = 'succeeded'
        ORDER BY created_at DESC
        LIMIT 1
      `)
      .get(cacheKey) as SqlRow | undefined;
    return row ? this.rowToAiAnalysis(row) : null;
  }

  getAiAnalysis(id: string): AiAnalysisRecord | null {
    const row = this.db
      .prepare("SELECT * FROM ai_analyses WHERE id = ?")
      .get(id) as SqlRow | undefined;
    return row ? this.rowToAiAnalysis(row) : null;
  }

  getLatestAiAnalysis(jobId: string): AiAnalysisRecord | null {
    const row = this.db
      .prepare(`
        SELECT * FROM ai_analyses
        WHERE job_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `)
      .get(jobId) as SqlRow | undefined;
    return row ? this.rowToAiAnalysis(row) : null;
  }

  listAiAnalyses(limit = 30): AiAnalysisRecord[] {
    const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
    return (
      this.db
        .prepare(
          "SELECT * FROM ai_analyses ORDER BY created_at DESC LIMIT ?",
        )
        .all(safeLimit) as SqlRow[]
    ).map((row) => this.rowToAiAnalysis(row));
  }

  getAiUsage(dailyLimit: number): {
    todayRemoteCalls: number;
    dailyLimit: number;
    totalAnalyses: number;
    cachedHits: number;
  } {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const todayRemoteCalls = Number(
      (
        this.db
          .prepare(`
            SELECT COUNT(*) AS count FROM ai_analyses
            WHERE provider <> 'local'
              AND cached_from_id IS NULL
              AND created_at >= ?
          `)
          .get(dayStart.toISOString()) as SqlRow
      ).count || 0,
    );
    const totalAnalyses = Number(
      (
        this.db
          .prepare("SELECT COUNT(*) AS count FROM ai_analyses")
          .get() as SqlRow
      ).count || 0,
    );
    const cachedHits = Number(
      (
        this.db
          .prepare(
            "SELECT COUNT(*) AS count FROM ai_analyses WHERE cached_from_id IS NOT NULL",
          )
          .get() as SqlRow
      ).count || 0,
    );
    return { todayRemoteCalls, dailyLimit, totalAnalyses, cachedHits };
  }

  deleteAiAnalysis(id: string): number {
    const result = this.db
      .prepare("DELETE FROM ai_analyses WHERE id = ?")
      .run(id);
    return Number(result.changes);
  }

  private rowToAiAnalysis(row: SqlRow): AiAnalysisRecord {
    let result: AiAnalysisResult | null = null;
    const resultJson = String(row.result_json || "");
    if (resultJson && !["{}", "null"].includes(resultJson)) {
      result = AiAnalysisResultSchema.parse(
        JSON.parse(resultJson),
      );
    }
    return {
      id: String(row.id),
      jobId: String(row.job_id),
      status: String(row.status) as AiAnalysisStatus,
      provider: String(row.provider),
      model: String(row.model),
      cacheKey: String(row.cache_key),
      promptVersion: Number(row.prompt_version || 0),
      schemaVersion: Number(row.schema_version || 0),
      result,
      error: String(row.error || ""),
      cachedFromId: row.cached_from_id
        ? String(row.cached_from_id)
        : null,
      latencyMs: Number(row.latency_ms || 0),
      promptTokens: Number(row.prompt_tokens || 0),
      completionTokens: Number(row.completion_tokens || 0),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private rowToCollectorCandidate(row: SqlRow): CollectorCandidate {
    return CollectorCandidateSchema.parse({
      sourceKey: String(row.source_key),
      title: String(row.title),
      company: String(row.company),
      salary: String(row.salary || ""),
      city: String(row.city || ""),
      district: String(row.district || ""),
      experience: String(row.experience || ""),
      degree: String(row.degree || ""),
      industry: String(row.industry || ""),
      companyScale: String(row.company_scale || ""),
      skills: JSON.parse(String(row.skills_json || "[]")),
      category: String(row.category || ""),
      score: Number(row.score || 0),
      reason: String(row.reason || ""),
      risks: JSON.parse(String(row.risks_json || "[]")),
      description: String(row.description || ""),
      greeting: String(row.greeting || ""),
      link: String(row.link || ""),
      sourceQueries: JSON.parse(String(row.source_queries_json || "[]")),
      collectedAt: String(row.collected_at),
    });
  }

  private gradeForScore(score: number): string {
    if (score >= 75) return "优先沟通";
    if (score >= 60) return "值得沟通";
    if (score >= 45) return "谨慎沟通";
    return "暂不优先";
  }

  private rowToTask(row: SqlRow): TaskRecord {
    return {
      id: String(row.id),
      type: String(row.type),
      status: String(row.status) as TaskStatus,
      progress: Number(row.progress || 0),
      payload: JSON.parse(String(row.payload_json || "{}")) as Record<
        string,
        unknown
      >,
      result: JSON.parse(String(row.result_json || "{}")) as Record<
        string,
        unknown
      >,
      error: String(row.error || ""),
      attempts: Number(row.attempts || 0),
      idempotencyKey: row.idempotency_key
        ? String(row.idempotency_key)
        : null,
      createdAt: String(row.created_at || ""),
      startedAt: row.started_at ? String(row.started_at) : null,
      finishedAt: row.finished_at ? String(row.finished_at) : null,
      heartbeatAt: row.heartbeat_at ? String(row.heartbeat_at) : null,
    };
  }

  inspectLegacyDatabase(sourcePath: string): MigrationPreview {
    if (!fs.existsSync(sourcePath)) throw new Error("旧数据库不存在");
    const source = new DatabaseSync(sourcePath, { readOnly: true });
    try {
      const integrityRow = source
        .prepare("PRAGMA integrity_check")
        .get() as SqlRow;
      const integrity = String(integrityRow.integrity_check || "");
      if (integrity !== "ok") {
        throw new Error(`源数据库完整性检查失败：${integrity}`);
      }
      const sourceTables = new Set(
        (
          source
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
            .all() as SqlRow[]
        ).map((row) => String(row.name)),
      );
      const missingTables = REQUIRED_TABLES.filter(
        (table) => !sourceTables.has(table),
      );
      if (!sourceTables.has("jobs")) {
        throw new Error("选择的数据库不是旧版求职工作台数据库");
      }
      const counts = Object.fromEntries(
        REQUIRED_TABLES.map((table) => [
          table,
          sourceTables.has(table)
            ? Number(
                (
                  source
                    .prepare(`SELECT COUNT(*) AS count FROM ${table}`)
                    .get() as SqlRow
                ).count || 0,
              )
            : 0,
        ]),
      );
      const versionRow = source
        .prepare("PRAGMA user_version")
        .get() as SqlRow;
      const schemaVersion = Number(versionRow.user_version || 0);
      const warnings = missingTables.map(
        (table) => `源数据库缺少 ${table}，将跳过该表`,
      );
      if (schemaVersion === 0) {
        warnings.push("源数据库没有 Schema 版本记录，将按 V0.5 兼容模式迁移");
      }
      return {
        sourcePath,
        integrity,
        schemaVersion,
        counts,
        warnings,
      };
    } finally {
      source.close();
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

  getJobDetail(id: string): JobDetail {
    const job = this.getJob(id);
    if (!job) throw new Error("岗位不存在");
    const events = (
      this.db
        .prepare(
          "SELECT * FROM job_events WHERE job_id = ? ORDER BY id DESC",
        )
        .all(id) as SqlRow[]
    ).map(
      (row): JobEventRecord => ({
        id: Number(row.id),
        eventType: String(row.event_type),
        fromStatus: row.from_status ? String(row.from_status) : null,
        toStatus: row.to_status ? String(row.to_status) : null,
        note: String(row.note || ""),
        createdAt: String(row.created_at),
      }),
    );
    return { job, events };
  }

  listJobs(input: Partial<JobFilters> = {}): JobRecord[] {
    const filters = ListJobsSchema.parse(input);
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (filters.archived === "active") {
      where.push("archived_at IS NULL");
    } else if (filters.archived === "archived") {
      where.push("archived_at IS NOT NULL");
    }
    if (filters.query) {
      where.push(
        "(title LIKE ? OR company LIKE ? OR city LIKE ? OR district LIKE ? OR description LIKE ?)",
      );
      const query = `%${filters.query}%`;
      params.push(query, query, query, query, query);
    }
    if (filters.category) {
      where.push("category = ?");
      params.push(filters.category);
    }
    if (filters.status) {
      where.push("status = ?");
      params.push(filters.status);
    }
    if (filters.favoriteOnly) {
      where.push("favorite = 1");
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const orderSql =
      filters.sort === "score"
        ? "favorite DESC, score DESC, updated_at DESC"
        : filters.sort === "company"
          ? "company COLLATE NOCASE, title COLLATE NOCASE"
          : "favorite DESC, updated_at DESC";
    return (
      this.db
        .prepare(
          `SELECT * FROM jobs ${whereSql}
           ORDER BY ${orderSql}`,
        )
        .all(...params) as SqlRow[]
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
    const pendingTasks = Number(
      (
        this.db
          .prepare(
            "SELECT COUNT(*) AS count FROM tasks WHERE status IN ('queued', 'running')",
          )
          .get() as SqlRow
      ).count || 0,
    );
    const pendingCandidates = Number(
      (
        this.db
          .prepare(
            "SELECT COUNT(*) AS count FROM collector_candidates WHERE state = 'pending'",
          )
          .get() as SqlRow
      ).count || 0,
    );

    return {
      total,
      active: total - archived,
      archived,
      averageScore: average,
      statusCounts,
      databasePath: this.databasePath,
      lastBackupPath: lastBackup ? String(lastBackup.value) : null,
      schemaVersion: this.getSchemaVersion(),
      pendingTasks,
      pendingCandidates,
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

  updateJob(id: string, fields: JobRecordUpdate): JobRecord {
    if (!this.getJob(id)) throw new Error("岗位不存在");
    const timestamp = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(`
          UPDATE jobs SET
            title = ?, company = ?, salary = ?, city = ?, district = ?,
            experience = ?, degree = ?, category = ?, link = ?,
            description = ?, notes = ?, updated_at = ?
          WHERE id = ?
        `)
        .run(
          fields.title,
          fields.company,
          fields.salary,
          fields.city,
          fields.district,
          fields.experience,
          fields.degree,
          fields.category,
          fields.link,
          fields.description,
          fields.notes,
          timestamp,
          id,
        );
      this.db
        .prepare(`
          INSERT INTO job_events (
            job_id, event_type, from_status, to_status, note, created_at
          ) VALUES (?, 'job_edit', NULL, NULL, '更新岗位信息', ?)
        `)
        .run(id, timestamp);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.getJob(id)!;
  }

  setFavorite(id: string, favorite: boolean): JobRecord {
    if (!this.getJob(id)) throw new Error("岗位不存在");
    this.db
      .prepare("UPDATE jobs SET favorite = ?, updated_at = ? WHERE id = ?")
      .run(favorite ? 1 : 0, new Date().toISOString(), id);
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
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.db
        .prepare(`SELECT id FROM jobs WHERE id IN (${placeholders})`)
        .all(...ids) as SqlRow[];
      const result = this.db
        .prepare(
          `UPDATE jobs
           SET archived_at = ?, updated_at = ?
           WHERE id IN (${placeholders})`,
        )
        .run(archived ? timestamp : null, timestamp, ...ids);
      const event = this.db.prepare(`
        INSERT INTO job_events (
          job_id, event_type, from_status, to_status, note, created_at
        ) VALUES (?, ?, NULL, NULL, ?, ?)
      `);
      for (const row of existing) {
        event.run(
          String(row.id),
          archived ? "archived" : "restored",
          archived ? "移入回收站" : "从回收站恢复",
          timestamp,
        );
      }
      this.db.exec("COMMIT");
      return Number(result.changes);
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  permanentlyDeleteJobs(ids: string[]): number {
    if (!ids.length) return 0;
    const placeholders = ids.map(() => "?").join(", ");
    const result = this.db
      .prepare(
        `DELETE FROM jobs
         WHERE archived_at IS NOT NULL AND id IN (${placeholders})`,
      )
      .run(...ids);
    return Number(result.changes);
  }

  listSavedViews(): SavedView[] {
    return (
      this.db
        .prepare("SELECT * FROM saved_views ORDER BY updated_at DESC")
        .all() as SqlRow[]
    ).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      filters: ListJobsSchema.parse(
        JSON.parse(String(row.filters_json || "{}")),
      ),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }));
  }

  saveView(name: string, filters: JobFilters): SavedView {
    const timestamp = new Date().toISOString();
    const id = `view-${randomUUID()}`;
    this.db
      .prepare(`
        INSERT INTO saved_views (id, name, filters_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET
          filters_json = excluded.filters_json,
          updated_at = excluded.updated_at
      `)
      .run(id, name, JSON.stringify(filters), timestamp, timestamp);
    const row = this.db
      .prepare("SELECT * FROM saved_views WHERE name = ?")
      .get(name) as SqlRow;
    return {
      id: String(row.id),
      name: String(row.name),
      filters: ListJobsSchema.parse(JSON.parse(String(row.filters_json))),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  deleteSavedView(id: string): number {
    const result = this.db
      .prepare("DELETE FROM saved_views WHERE id = ?")
      .run(id);
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

  async migrateLegacy(sourcePath: string): Promise<MigrationResult> {
    const preview = this.inspectLegacyDatabase(sourcePath);
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
          ai_analyses: [
            "id",
            "job_id",
            "status",
            "provider",
            "model",
            "cache_key",
            "input_hash",
            "prompt_version",
            "schema_version",
            "result_json",
            "error",
            "cached_from_id",
            "latency_ms",
            "prompt_tokens",
            "completion_tokens",
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
    this.checkIntegrity();
    return { sourcePath, backupPath, counts: preview.counts };
  }

  async restoreBackup(sourcePath: string): Promise<RestoreResult> {
    const preview = this.inspectLegacyDatabase(sourcePath);
    const safetyBackup = await this.createBackup("pre-restore");
    const escapedPath = path.resolve(sourcePath).replaceAll("'", "''");
    this.db.exec("PRAGMA foreign_keys = OFF");
    this.db.exec(`ATTACH DATABASE '${escapedPath}' AS restore_db`);
    try {
      const sourceTables = new Set(
        (
          this.db
            .prepare(
              "SELECT name FROM restore_db.sqlite_master WHERE type = 'table'",
            )
            .all() as SqlRow[]
        ).map((row) => String(row.name)),
      );
      const targetColumns = (table: string) =>
        new Set(
          (
            this.db.prepare(`PRAGMA main.table_info(${table})`).all() as SqlRow[]
          ).map((row) => String(row.name)),
        );
      const sourceColumns = (table: string) =>
        new Set(
          (
            this.db
              .prepare(`PRAGMA restore_db.table_info(${table})`)
              .all() as SqlRow[]
          ).map((row) => String(row.name)),
        );

      this.db.exec("BEGIN IMMEDIATE");
      try {
        this.db.exec("DELETE FROM job_events");
        this.db.exec("DELETE FROM jobs");
        this.db.exec("DELETE FROM resume_facts");
        this.db.exec("DELETE FROM resume_versions");
        this.db.exec("DELETE FROM resume_profile");
        this.db.exec("DELETE FROM tasks");
        this.db.exec("DELETE FROM app_settings");
        this.db.exec("DELETE FROM collector_candidates");
        this.db.exec("DELETE FROM collector_cache");
        this.db.exec("DELETE FROM ai_analyses");
        for (const table of [
          "jobs",
          "job_events",
          "resume_profile",
          "resume_facts",
          "resume_versions",
          "tasks",
          "app_settings",
          "collector_candidates",
          "collector_cache",
          "ai_analyses",
        ]) {
          if (!sourceTables.has(table)) continue;
          const target = targetColumns(table);
          const common = [...sourceColumns(table)].filter((column) =>
            target.has(column),
          );
          if (!common.length) continue;
          const columns = common.join(", ");
          this.db.exec(
            `INSERT INTO main.${table} (${columns})
             SELECT ${columns} FROM restore_db.${table}`,
          );
        }
        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
    } finally {
      this.db.exec("DETACH DATABASE restore_db");
      this.db.exec("PRAGMA foreign_keys = ON");
    }
    this.applyMigrations();
    this.checkIntegrity();
    return {
      restoredFrom: sourcePath,
      safetyBackup,
      counts: preview.counts,
    };
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
