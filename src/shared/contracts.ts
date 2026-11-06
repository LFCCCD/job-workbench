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

export const CollectorCitySchema = z.object({
  name: z.string().trim().min(1).max(50),
  code: z.number().int().positive(),
});

export const CollectorRequestSchema = z.object({
  cities: z.array(CollectorCitySchema).min(1).max(8),
  queries: z
    .array(z.string().trim().min(1).max(100))
    .min(1)
    .max(8),
  pagesPerQuery: z.number().int().min(1).max(3).default(1),
  maxSearchRequests: z.number().int().min(1).max(12).default(6),
  detailLimit: z.number().int().min(0).max(30).default(12),
  requestDelayMs: z.number().int().min(3_500).max(15_000).default(4_500),
});

export const CollectorCandidateSchema = z.object({
  sourceKey: z.string().trim().min(1).max(500),
  title: z.string().trim().min(1).max(200),
  company: z.string().trim().min(1).max(200),
  salary: z.string().trim().max(100).default(""),
  city: z.string().trim().max(100).default(""),
  district: z.string().trim().max(100).default(""),
  experience: z.string().trim().max(100).default(""),
  degree: z.string().trim().max(100).default(""),
  industry: z.string().trim().max(200).default(""),
  companyScale: z.string().trim().max(100).default(""),
  skills: z.array(z.string().trim().max(100)).max(30).default([]),
  category: z.string().trim().max(100).default(""),
  score: z.number().int().min(0).max(100).default(0),
  reason: z.string().trim().max(2_000).default(""),
  risks: z.array(z.string().trim().max(500)).max(20).default([]),
  description: z.string().trim().max(30_000).default(""),
  greeting: z.string().trim().max(5_000).default(""),
  link: z.string().trim().max(2_000).default(""),
  sourceQueries: z.array(z.string().trim().max(100)).max(20).default([]),
  collectedAt: z.string().trim().min(1),
});

export const CollectorCacheEntrySchema = z.object({
  key: z.string().trim().min(1).max(500),
  candidates: z.array(CollectorCandidateSchema).max(100),
  expiresAt: z.string().trim().min(1),
});

export const CollectorIdsSchema = z.object({
  ids: z.array(z.string().min(1).max(500)).min(1).max(500),
});

export type JobStatus = z.infer<typeof JobStatusSchema>;
export type ManualJobInput = z.infer<typeof ManualJobSchema>;
export type MigrationResult = z.infer<typeof MigrationResultSchema>;
export type MigrationPreview = z.infer<typeof MigrationPreviewSchema>;
export type JobFilters = z.infer<typeof ListJobsSchema>;
export type CollectorCity = z.infer<typeof CollectorCitySchema>;
export type CollectorRequest = z.infer<typeof CollectorRequestSchema>;
export type CollectorCandidate = z.infer<typeof CollectorCandidateSchema>;
export type CollectorCacheEntry = z.infer<typeof CollectorCacheEntrySchema>;

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
  pendingCandidates: number;
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

export interface CollectorCandidatePreview {
  candidate: CollectorCandidate;
  taskId: string;
  seenCount: number;
  existsInJobs: boolean;
  updatedAt: string;
}

export interface CollectorPreviewData {
  candidates: CollectorCandidatePreview[];
  counts: {
    total: number;
    newInJobs: number;
    existingInJobs: number;
  };
}

export interface CollectorImportResult {
  imported: number;
  updated: number;
  message: string;
}

export interface CollectorStatus {
  edgeRunning: boolean;
  profilePath: string;
  endpoint: string;
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
  createCollectorTask(request: CollectorRequest): Promise<TaskRecord>;
  getCollectorStatus(): Promise<CollectorStatus>;
  openCollectorBrowser(): Promise<CollectorStatus>;
  listCollectorPreview(): Promise<CollectorPreviewData>;
  importCollectorCandidates(ids: string[]): Promise<CollectorImportResult>;
  dismissCollectorCandidates(ids: string[]): Promise<OperationResult>;
  cancelTask(id: string): Promise<TaskRecord>;
  retryTask(id: string): Promise<TaskRecord>;
  clearFinishedTasks(): Promise<OperationResult>;
  exportResumePdf(): Promise<string | null>;
}

export type JobRecordUpdate = z.infer<typeof UpdateJobSchema>["fields"];
