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
  query: z.string().trim().max(200).default(""),
  category: z.string().trim().max(100).default(""),
  status: z.union([JobStatusSchema, z.literal("")]).default(""),
  favoriteOnly: z.boolean().default(false),
  archived: z.enum(["active", "archived", "all"]).default("active"),
  sort: z.enum(["updated", "score", "company"]).default("updated"),
});

export const UpdateJobSchema = z.object({
  id: z.string().min(1),
  fields: z.object({
    title: z.string().trim().min(1).max(200),
    company: z.string().trim().min(1).max(200),
    salary: z.string().trim().max(100),
    city: z.string().trim().max(100),
    district: z.string().trim().max(100),
    experience: z.string().trim().max(100),
    degree: z.string().trim().max(100),
    category: z.string().trim().max(100),
    link: z.string().trim().max(2000),
    description: z.string().trim().max(30_000),
    notes: z.string().trim().max(10_000),
  }),
});

export const SetFavoriteSchema = z.object({
  id: z.string().min(1),
  favorite: z.boolean(),
});

export const PermanentDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
});

export const SaveViewSchema = z.object({
  name: z.string().trim().min(1).max(100),
  filters: ListJobsSchema,
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
export type JobFilters = z.infer<typeof ListJobsSchema>;

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

export interface JobEventRecord {
  id: number;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string;
  createdAt: string;
}

export interface JobDetail {
  job: JobRecord;
  events: JobEventRecord[];
}

export interface SavedView {
  id: string;
  name: string;
  filters: JobFilters;
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
  listJobs(filters?: Partial<JobFilters>): Promise<JobRecord[]>;
  getJobDetail(id: string): Promise<JobDetail>;
  addJob(input: ManualJobInput): Promise<JobRecord>;
  updateJob(id: string, fields: JobRecordUpdate): Promise<JobRecord>;
  updateJobStatus(input: { id: string; status: JobStatus }): Promise<JobRecord>;
  setJobFavorite(id: string, favorite: boolean): Promise<JobRecord>;
  archiveJobs(ids: string[]): Promise<OperationResult>;
  restoreJobs(ids: string[]): Promise<OperationResult>;
  permanentlyDeleteJobs(ids: string[]): Promise<OperationResult>;
  listSavedViews(): Promise<SavedView[]>;
  saveView(name: string, filters: JobFilters): Promise<SavedView>;
  deleteSavedView(id: string): Promise<OperationResult>;
  inspectLegacyDatabase(): Promise<MigrationPreview | null>;
  confirmLegacyMigration(): Promise<MigrationResult>;
  chooseAndRestore(): Promise<RestoreResult | null>;
  createBackup(): Promise<string>;
  listTasks(): Promise<TaskRecord[]>;
  createBackupTask(): Promise<TaskRecord>;
  cancelTask(id: string): Promise<TaskRecord>;
  retryTask(id: string): Promise<TaskRecord>;
  clearFinishedTasks(): Promise<OperationResult>;
  exportResumePdf(): Promise<string | null>;
}

export type JobRecordUpdate = z.infer<typeof UpdateJobSchema>["fields"];
