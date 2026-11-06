import { z } from "zod";

export const jobStatuses = [
  "待判断",
  "准备沟通",
  "已沟通",
  "已投递",
  "已回复",
  "面试",
  "Offer",
  "已拒绝",
  "不合适",
] as const;

export const JobStatusSchema = z.enum(jobStatuses);

export const ManualJobSchema = z.object({
  title: z.string().trim().min(1, "岗位名称不能为空").max(200),
  company: z.string().trim().min(1, "公司名称不能为空").max(200),
  salary: z.string().trim().max(100).default(""),
  city: z.string().trim().max(100).default(""),
  link: z.string().trim().max(2000).default(""),
  description: z.string().trim().max(30_000).default(""),
});

export const UpdateJobStatusSchema = z.object({
  id: z.string().min(1),
  status: JobStatusSchema,
});

export const ArchiveJobsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
});

export const ListJobsSchema = z.object({
  includeArchived: z.boolean().default(false),
});

export const MigrationResultSchema = z.object({
  sourcePath: z.string(),
  backupPath: z.string(),
  counts: z.record(z.string(), z.number()),
});

export const MigrationPreviewSchema = z.object({
  sourcePath: z.string(),
  integrity: z.string(),
  schemaVersion: z.number(),
  counts: z.record(z.string(), z.number()),
  warnings: z.array(z.string()),
});

export type JobStatus = z.infer<typeof JobStatusSchema>;
export type ManualJobInput = z.infer<typeof ManualJobSchema>;
export type MigrationResult = z.infer<typeof MigrationResultSchema>;
export type MigrationPreview = z.infer<typeof MigrationPreviewSchema>;

export interface JobRecord {
  id: string;
  title: string;
  company: string;
  salary: string;
  city: string;
  district: string;
  experience: string;
  degree: string;
  category: string;
  score: number;
  status: JobStatus;
  favorite: boolean;
  notes: string;
  description: string;
  link: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardData {
  total: number;
  active: number;
  archived: number;
  averageScore: number;
  statusCounts: Record<string, number>;
  databasePath: string;
  lastBackupPath: string | null;
  schemaVersion: number;
  pendingTasks: number;
}

export interface OperationResult {
  ok: boolean;
  message: string;
}

export interface RestoreResult {
  restoredFrom: string;
  safetyBackup: string;
  counts: Record<string, number>;
}

export type TaskStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted";

export interface TaskRecord {
  id: string;
  type: string;
  status: TaskStatus;
  progress: number;
  payload: Record<string, unknown>;
  result: Record<string, unknown>;
  error: string;
  attempts: number;
  idempotencyKey: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  heartbeatAt: string | null;
}

export interface JobWorkbenchApi {
  getDashboard(): Promise<DashboardData>;
  listJobs(includeArchived?: boolean): Promise<JobRecord[]>;
  addJob(input: ManualJobInput): Promise<JobRecord>;
  updateJobStatus(input: { id: string; status: JobStatus }): Promise<JobRecord>;
  archiveJobs(ids: string[]): Promise<OperationResult>;
  restoreJobs(ids: string[]): Promise<OperationResult>;
  inspectLegacyDatabase(): Promise<MigrationPreview | null>;
  confirmLegacyMigration(): Promise<MigrationResult>;
  chooseAndRestore(): Promise<RestoreResult | null>;
  createBackup(): Promise<string>;
  exportResumePdf(): Promise<string | null>;
}
