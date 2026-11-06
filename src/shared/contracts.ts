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

export const AiProviderKindSchema = z.enum([
  "local",
  "deepseek",
  "dashscope",
  "custom",
]);

export const AiEvidenceSchema = z
  .object({
    source: z.enum(["jd", "fact"]),
    factId: z.string().trim().max(50).nullable().default(null),
    quote: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const AiRequirementSchema = z
  .object({
    requirement: z.string().trim().min(1).max(500),
    status: z.enum(["satisfied", "partial", "missing", "unknown"]),
    evidence: z.array(AiEvidenceSchema).max(6).default([]),
    note: z.string().trim().max(1_000).default(""),
  })
  .strict();

export const AiAnalysisResultSchema = z
  .object({
    jobSummary: z
      .object({
        responsibilities: z.string().trim().min(1).max(1_500),
        workMode: z.string().trim().max(500).default(""),
        evidence: z.array(AiEvidenceSchema).min(1).max(5),
      })
      .strict(),
    hardRequirements: z.array(AiRequirementSchema).max(15),
    bonuses: z
      .array(
        z
          .object({
            text: z.string().trim().min(1).max(500),
            evidence: z.array(AiEvidenceSchema).max(5).default([]),
          })
          .strict(),
      )
      .max(12),
    risks: z
      .array(
        z
          .object({
            severity: z.enum(["high", "medium", "low"]),
            title: z.string().trim().min(1).max(300),
            evidence: z.array(AiEvidenceSchema).min(1).max(5),
            question: z.string().trim().max(500).default(""),
          })
          .strict(),
      )
      .max(12),
    interviewQuestions: z
      .array(
        z
          .object({
            category: z.enum(["技术", "项目", "业务", "行为"]),
            question: z.string().trim().min(1).max(500),
            preparation: z.string().trim().max(1_000).default(""),
          })
          .strict(),
      )
      .max(15),
    questionsToAsk: z.array(z.string().trim().min(1).max(500)).max(15),
    resumeRecommendation: z
      .object({
        versionName: z.string().trim().max(200).default(""),
        gaps: z.array(z.string().trim().max(500)).max(12),
      })
      .strict(),
    confidence: z.enum(["high", "medium", "low"]),
    confidenceReason: z.string().trim().min(1).max(800),
    unknowns: z.array(z.string().trim().min(1).max(500)).max(20),
  })
  .strict();

export const AiSettingsInputSchema = z
  .object({
    provider: AiProviderKindSchema,
    baseUrl: z.string().trim().max(500).default(""),
    model: z.string().trim().max(200).default(""),
    dailyRequestLimit: z.number().int().min(1).max(100).default(20),
    apiKey: z.string().trim().max(500).optional(),
  })
  .strict();

export const AiAnalyzeRequestSchema = z
  .object({
    jobId: z.string().min(1).max(500),
    force: z.boolean().default(false),
  })
  .strict();

export const AiAnalysisIdSchema = z.object({
  id: z.string().min(1).max(500),
});

export const resumeFactKinds = [
  "教育经历",
  "实习经历",
  "项目经历",
  "技能",
  "证书",
  "奖项",
  "校园经历",
] as const;

export const ResumeProfileInputSchema = z
  .object({
    fullName: z.string().trim().min(1, "姓名不能为空").max(100),
    phone: z.string().trim().max(50).default(""),
    email: z.string().trim().max(200).default(""),
    currentCity: z.string().trim().max(100).default(""),
    targetRoles: z.array(z.string().trim().min(1).max(100)).max(10).default([]),
    summary: z.string().trim().max(5_000).default(""),
  })
  .strict();

export const SaveResumeFactSchema = z
  .object({
    id: z.string().min(1).max(100).optional(),
    fields: z
      .object({
        kind: z.enum(resumeFactKinds),
        title: z.string().trim().min(1, "事实标题不能为空").max(200),
        organization: z.string().trim().max(200).default(""),
        role: z.string().trim().max(200).default(""),
        startDate: z.string().trim().max(30).default(""),
        endDate: z.string().trim().max(30).default(""),
        location: z.string().trim().max(100).default(""),
        bullets: z
          .array(z.string().trim().min(1).max(1_000))
          .max(20)
          .default([]),
        skills: z
          .array(z.string().trim().min(1).max(100))
          .max(30)
          .default([]),
        evidence: z.string().trim().max(5_000).default(""),
        verified: z.boolean().default(false),
        sortOrder: z.number().int().min(-10_000).max(10_000).default(0),
      })
      .strict(),
  })
  .strict();

export const SaveResumeVersionSchema = z
  .object({
    id: z.string().min(1).max(100).optional(),
    fields: z
      .object({
        name: z.string().trim().min(1, "版本名称不能为空").max(200),
        targetRole: z.string().trim().max(200).default(""),
        template: z.enum(["general", "technical", "implementation"]).default(
          "general",
        ),
        summary: z.string().trim().max(5_000).default(""),
        selectedFactIds: z
          .array(z.string().min(1).max(100))
          .max(100)
          .default([]),
        includeUnverified: z.boolean().default(false),
      })
      .strict(),
  })
  .strict();

export const ResumeIdSchema = z.object({
  id: z.string().min(1).max(100),
});

export const ResumeVerifiedSchema = z.object({
  id: z.string().min(1).max(100),
  verified: z.boolean(),
});

export const ResumeExportRequestSchema = z.object({
  versionId: z.string().min(1).max(100).nullable().default(null),
});

const OptionalDateStringSchema = z
  .string()
  .trim()
  .max(50)
  .refine((value) => !value || !Number.isNaN(Date.parse(value)), {
    message: "日期时间格式无效",
  });

export const contactChannels = [
  "BOSS",
  "微信",
  "电话",
  "邮件",
  "其他",
] as const;

export const SaveJobContactSchema = z
  .object({
    id: z.string().min(1).max(100).optional(),
    fields: z
      .object({
        name: z.string().trim().min(1, "联系人名称不能为空").max(100),
        role: z.string().trim().max(100).default(""),
        channel: z.enum(contactChannels).default("BOSS"),
        contactInfo: z.string().trim().max(500).default(""),
        notes: z.string().trim().max(5_000).default(""),
        lastContactAt: OptionalDateStringSchema.default(""),
      })
      .strict(),
  })
  .strict();

export const followUpStatuses = [
  "pending",
  "completed",
  "cancelled",
] as const;

export const SaveFollowUpSchema = z
  .object({
    id: z.string().min(1).max(100).optional(),
    fields: z
      .object({
        title: z.string().trim().min(1, "跟进标题不能为空").max(200),
        dueAt: OptionalDateStringSchema.refine(Boolean, "跟进时间不能为空"),
        status: z.enum(followUpStatuses).default("pending"),
        notes: z.string().trim().max(5_000).default(""),
      })
      .strict(),
  })
  .strict();

export const interviewModes = [
  "现场",
  "电话",
  "视频",
  "其他",
] as const;

export const SaveInterviewSchema = z
  .object({
    id: z.string().min(1).max(100).optional(),
    fields: z
      .object({
        round: z.string().trim().min(1, "面试轮次不能为空").max(100),
        scheduledAt: OptionalDateStringSchema.default(""),
        mode: z.enum(interviewModes).default("视频"),
        location: z.string().trim().max(500).default(""),
        questions: z
          .array(z.string().trim().min(1).max(1_000))
          .max(50)
          .default([]),
        reflection: z.string().trim().max(10_000).default(""),
        result: z.string().trim().max(1_000).default(""),
        nextStep: z.string().trim().max(2_000).default(""),
      })
      .strict(),
  })
  .strict();

export const CrmJobIdSchema = z.object({
  jobId: z.string().min(1).max(500),
});

export const CrmDeleteSchema = z.object({
  id: z.string().min(1).max(100),
});

export const SetFollowUpStatusSchema = z.object({
  id: z.string().min(1).max(100),
  status: z.enum(followUpStatuses),
});

export const NotificationSettingSchema = z.object({
  enabled: z.boolean(),
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
export type AiProviderKind = z.infer<typeof AiProviderKindSchema>;
export type AiEvidence = z.infer<typeof AiEvidenceSchema>;
export type AiAnalysisResult = z.infer<typeof AiAnalysisResultSchema>;
export type AiSettingsInput = z.infer<typeof AiSettingsInputSchema>;
export type AiAnalyzeRequest = z.infer<typeof AiAnalyzeRequestSchema>;
export type ResumeFactKind = (typeof resumeFactKinds)[number];
export type ResumeProfileInput = z.infer<typeof ResumeProfileInputSchema>;
export type ResumeFactFields = z.infer<
  typeof SaveResumeFactSchema
>["fields"];
export type ResumeVersionFields = z.infer<
  typeof SaveResumeVersionSchema
>["fields"];
export type ContactChannel = (typeof contactChannels)[number];
export type ContactFields = z.infer<typeof SaveJobContactSchema>["fields"];
export type FollowUpStatus = (typeof followUpStatuses)[number];
export type FollowUpFields = z.infer<typeof SaveFollowUpSchema>["fields"];
export type InterviewMode = (typeof interviewModes)[number];
export type InterviewFields = z.infer<typeof SaveInterviewSchema>["fields"];

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

export interface AiResumeFactInput {
  id: string;
  kind: string;
  title: string;
  organization: string;
  role: string;
  startDate: string;
  endDate: string;
  location: string;
  bullets: string[];
  skills: string[];
  evidence: string;
}

export interface AiResumeVersionInput {
  id: string;
  name: string;
  targetRole: string;
  summary: string;
  selectedFactIds: string[];
}

export interface AiJobContext {
  job: JobRecord;
  facts: AiResumeFactInput[];
  resumeVersions: AiResumeVersionInput[];
  factsVersion: string;
}

export interface AiSettingsView {
  provider: AiProviderKind;
  baseUrl: string;
  model: string;
  dailyRequestLimit: number;
  hasApiKey: boolean;
  encryptionAvailable: boolean;
}

export type AiAnalysisStatus = "running" | "succeeded" | "failed" | "cancelled";

export interface AiAnalysisRecord {
  id: string;
  jobId: string;
  status: AiAnalysisStatus;
  provider: string;
  model: string;
  cacheKey: string;
  promptVersion: number;
  schemaVersion: number;
  result: AiAnalysisResult | null;
  error: string;
  cachedFromId: string | null;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  createdAt: string;
  updatedAt: string;
}

export interface AiUsageSummary {
  todayRemoteCalls: number;
  dailyLimit: number;
  totalAnalyses: number;
  cachedHits: number;
}

export interface ResumeProfileRecord {
  fullName: string;
  phone: string;
  email: string;
  currentCity: string;
  targetRoles: string[];
  summary: string;
  updatedAt: string;
}

export interface ResumeFactRecord {
  id: string;
  kind: ResumeFactKind;
  title: string;
  organization: string;
  role: string;
  startDate: string;
  endDate: string;
  location: string;
  bullets: string[];
  skills: string[];
  evidence: string;
  verified: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ResumeVersionRecord {
  id: string;
  name: string;
  targetRole: string;
  template: "general" | "technical" | "implementation";
  summary: string;
  selectedFactIds: string[];
  includeUnverified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ResumeWorkspace {
  profile: ResumeProfileRecord | null;
  facts: ResumeFactRecord[];
  versions: ResumeVersionRecord[];
  stats: {
    totalFacts: number;
    verifiedFacts: number;
    versionCount: number;
    readyForAi: boolean;
  };
}

export interface JobContactRecord {
  id: string;
  jobId: string;
  name: string;
  role: string;
  channel: ContactChannel;
  contactInfo: string;
  notes: string;
  lastContactAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface FollowUpRecord {
  id: string;
  jobId: string;
  title: string;
  dueAt: string;
  status: FollowUpStatus;
  notes: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InterviewRecord {
  id: string;
  jobId: string;
  round: string;
  scheduledAt: string;
  mode: InterviewMode;
  location: string;
  questions: string[];
  reflection: string;
  result: string;
  nextStep: string;
  createdAt: string;
  updatedAt: string;
}

export interface CrmWorkspace {
  job: JobRecord;
  contacts: JobContactRecord[];
  followUps: FollowUpRecord[];
  interviews: InterviewRecord[];
  events: JobEventRecord[];
}

export interface CrmAgendaItem {
  kind: "follow-up" | "interview";
  id: string;
  jobId: string;
  jobTitle: string;
  company: string;
  title: string;
  scheduledAt: string;
  status: string;
}

export interface CrmOverview {
  metrics: {
    overdue: number;
    dueToday: number;
    upcomingSevenDays: number;
    openFollowUps: number;
    scheduledInterviews: number;
  };
  agenda: CrmAgendaItem[];
}

export interface DueFollowUpReminder {
  id: string;
  jobId: string;
  jobTitle: string;
  company: string;
  title: string;
  dueAt: string;
}

export type HealthCheckStatus = "ok" | "warning" | "error";

export interface HealthCheckItem {
  id: string;
  label: string;
  status: HealthCheckStatus;
  detail: string;
}

export interface SystemHealth {
  overall: HealthCheckStatus;
  appVersion: string;
  uptimeSeconds: number;
  schemaVersion: number;
  databasePath: string;
  dataDirectory: string;
  backupDirectory: string;
  logsDirectory: string;
  databaseIntegrity: string;
  recentBackups: string[];
  edgeRunning: boolean;
  edgeEndpoint: string;
  aiProvider: AiProviderKind;
  aiConfigured: boolean;
  pendingTasks: number;
  pendingCandidates: number;
  dueFollowUps: number;
  notificationSupported: boolean;
  notificationsEnabled: boolean;
  trayActive: boolean;
  checks: HealthCheckItem[];
}

export interface ReminderCheckResult {
  due: number;
  delivered: number;
  suppressed: boolean;
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
  getAiSettings(): Promise<AiSettingsView>;
  saveAiSettings(input: AiSettingsInput): Promise<AiSettingsView>;
  clearAiApiKey(): Promise<OperationResult>;
  createAiAnalysisTask(input: AiAnalyzeRequest): Promise<TaskRecord>;
  getJobAiAnalysis(jobId: string): Promise<AiAnalysisRecord | null>;
  listAiAnalyses(limit?: number): Promise<AiAnalysisRecord[]>;
  getAiUsage(): Promise<AiUsageSummary>;
  deleteAiAnalysis(id: string): Promise<OperationResult>;
  getResumeWorkspace(): Promise<ResumeWorkspace>;
  saveResumeProfile(input: ResumeProfileInput): Promise<ResumeProfileRecord>;
  saveResumeFact(
    id: string | null,
    fields: ResumeFactFields,
  ): Promise<ResumeFactRecord>;
  setResumeFactVerified(id: string, verified: boolean): Promise<ResumeFactRecord>;
  deleteResumeFact(id: string): Promise<OperationResult>;
  saveResumeVersion(
    id: string | null,
    fields: ResumeVersionFields,
  ): Promise<ResumeVersionRecord>;
  deleteResumeVersion(id: string): Promise<OperationResult>;
  getCrmOverview(): Promise<CrmOverview>;
  getCrmWorkspace(jobId: string): Promise<CrmWorkspace>;
  saveJobContact(
    jobId: string,
    id: string | null,
    fields: ContactFields,
  ): Promise<JobContactRecord>;
  deleteJobContact(id: string): Promise<OperationResult>;
  saveFollowUp(
    jobId: string,
    id: string | null,
    fields: FollowUpFields,
  ): Promise<FollowUpRecord>;
  setFollowUpStatus(
    id: string,
    status: FollowUpStatus,
  ): Promise<FollowUpRecord>;
  deleteFollowUp(id: string): Promise<OperationResult>;
  saveInterview(
    jobId: string,
    id: string | null,
    fields: InterviewFields,
  ): Promise<InterviewRecord>;
  deleteInterview(id: string): Promise<OperationResult>;
  getSystemHealth(): Promise<SystemHealth>;
  setNotificationsEnabled(enabled: boolean): Promise<OperationResult>;
  runReminderCheck(): Promise<ReminderCheckResult>;
  openDataDirectory(): Promise<OperationResult>;
  exportDiagnostics(): Promise<string | null>;
  cancelTask(id: string): Promise<TaskRecord>;
  retryTask(id: string): Promise<TaskRecord>;
  clearFinishedTasks(): Promise<OperationResult>;
  exportResumePdf(versionId?: string | null): Promise<string | null>;
}

export type JobRecordUpdate = z.infer<typeof UpdateJobSchema>["fields"];
