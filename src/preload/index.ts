import { contextBridge, ipcRenderer } from "electron";
import type {
  AiAnalyzeRequest,
  AiSettingsInput,
  CollectorRequest,
  ContactFields,
  FollowUpFields,
  FollowUpStatus,
  InterviewFields,
  JobFilters,
  JobStatus,
  JobWorkbenchApi,
  ManualJobInput,
  JobRecordUpdate,
  ResumeFactFields,
  ResumeProfileInput,
  ResumeVersionFields,
} from "../shared/contracts";

const api: JobWorkbenchApi = {
  getDashboard: () => ipcRenderer.invoke("workbench:dashboard"),
  listJobs: (filters: Partial<JobFilters> = {}) =>
    ipcRenderer.invoke("workbench:list-jobs", filters),
  getJobDetail: (id: string) =>
    ipcRenderer.invoke("workbench:job-detail", id),
  addJob: (input: ManualJobInput) =>
    ipcRenderer.invoke("workbench:add-job", input),
  updateJob: (id: string, fields: JobRecordUpdate) =>
    ipcRenderer.invoke("workbench:update-job", { id, fields }),
  updateJobStatus: (input: { id: string; status: JobStatus }) =>
    ipcRenderer.invoke("workbench:update-status", input),
  setJobFavorite: (id: string, favorite: boolean) =>
    ipcRenderer.invoke("workbench:set-favorite", { id, favorite }),
  archiveJobs: (ids: string[]) =>
    ipcRenderer.invoke("workbench:archive-jobs", { ids }),
  restoreJobs: (ids: string[]) =>
    ipcRenderer.invoke("workbench:restore-jobs", { ids }),
  permanentlyDeleteJobs: (ids: string[]) =>
    ipcRenderer.invoke("workbench:delete-jobs-permanently", { ids }),
  listSavedViews: () => ipcRenderer.invoke("workbench:list-views"),
  saveView: (name: string, filters: JobFilters) =>
    ipcRenderer.invoke("workbench:save-view", { name, filters }),
  deleteSavedView: (id: string) =>
    ipcRenderer.invoke("workbench:delete-view", id),
  inspectLegacyDatabase: () =>
    ipcRenderer.invoke("workbench:inspect-legacy-database"),
  confirmLegacyMigration: () =>
    ipcRenderer.invoke("workbench:confirm-migration"),
  chooseAndRestore: () => ipcRenderer.invoke("workbench:restore-backup"),
  createBackup: () => ipcRenderer.invoke("workbench:create-backup"),
  listTasks: () => ipcRenderer.invoke("workbench:list-tasks"),
  createBackupTask: () =>
    ipcRenderer.invoke("workbench:create-backup-task"),
  createCollectorTask: (request: CollectorRequest) =>
    ipcRenderer.invoke("workbench:create-collector-task", request),
  getCollectorStatus: () => ipcRenderer.invoke("workbench:collector-status"),
  openCollectorBrowser: () =>
    ipcRenderer.invoke("workbench:open-collector-browser"),
  listCollectorPreview: () =>
    ipcRenderer.invoke("workbench:collector-preview"),
  importCollectorCandidates: (ids: string[]) =>
    ipcRenderer.invoke("workbench:import-collector-candidates", { ids }),
  dismissCollectorCandidates: (ids: string[]) =>
    ipcRenderer.invoke("workbench:dismiss-collector-candidates", { ids }),
  getAiSettings: () => ipcRenderer.invoke("workbench:ai-settings"),
  saveAiSettings: (input: AiSettingsInput) =>
    ipcRenderer.invoke("workbench:save-ai-settings", input),
  clearAiApiKey: () => ipcRenderer.invoke("workbench:clear-ai-key"),
  createAiAnalysisTask: (input: AiAnalyzeRequest) =>
    ipcRenderer.invoke("workbench:create-ai-analysis", input),
  getJobAiAnalysis: (jobId: string) =>
    ipcRenderer.invoke("workbench:job-ai-analysis", jobId),
  listAiAnalyses: (limit?: number) =>
    ipcRenderer.invoke("workbench:list-ai-analyses", limit),
  getAiUsage: () => ipcRenderer.invoke("workbench:ai-usage"),
  deleteAiAnalysis: (id: string) =>
    ipcRenderer.invoke("workbench:delete-ai-analysis", { id }),
  getResumeWorkspace: () => ipcRenderer.invoke("workbench:resume-workspace"),
  saveResumeProfile: (input: ResumeProfileInput) =>
    ipcRenderer.invoke("workbench:save-resume-profile", input),
  saveResumeFact: (id: string | null, fields: ResumeFactFields) =>
    ipcRenderer.invoke("workbench:save-resume-fact", { id, fields }),
  setResumeFactVerified: (id: string, verified: boolean) =>
    ipcRenderer.invoke("workbench:set-resume-fact-verified", {
      id,
      verified,
    }),
  deleteResumeFact: (id: string) =>
    ipcRenderer.invoke("workbench:delete-resume-fact", { id }),
  saveResumeVersion: (id: string | null, fields: ResumeVersionFields) =>
    ipcRenderer.invoke("workbench:save-resume-version", { id, fields }),
  deleteResumeVersion: (id: string) =>
    ipcRenderer.invoke("workbench:delete-resume-version", { id }),
  getCrmOverview: () => ipcRenderer.invoke("workbench:crm-overview"),
  getCrmWorkspace: (jobId: string) =>
    ipcRenderer.invoke("workbench:crm-workspace", { jobId }),
  saveJobContact: (
    jobId: string,
    id: string | null,
    fields: ContactFields,
  ) => ipcRenderer.invoke("workbench:save-contact", { jobId, id, fields }),
  deleteJobContact: (id: string) =>
    ipcRenderer.invoke("workbench:delete-contact", { id }),
  saveFollowUp: (
    jobId: string,
    id: string | null,
    fields: FollowUpFields,
  ) => ipcRenderer.invoke("workbench:save-follow-up", { jobId, id, fields }),
  setFollowUpStatus: (id: string, status: FollowUpStatus) =>
    ipcRenderer.invoke("workbench:set-follow-up-status", { id, status }),
  deleteFollowUp: (id: string) =>
    ipcRenderer.invoke("workbench:delete-follow-up", { id }),
  saveInterview: (
    jobId: string,
    id: string | null,
    fields: InterviewFields,
  ) => ipcRenderer.invoke("workbench:save-interview", { jobId, id, fields }),
  deleteInterview: (id: string) =>
    ipcRenderer.invoke("workbench:delete-interview", { id }),
  getSystemHealth: () => ipcRenderer.invoke("workbench:system-health"),
  setNotificationsEnabled: (enabled: boolean) =>
    ipcRenderer.invoke("workbench:set-notifications", { enabled }),
  runReminderCheck: () =>
    ipcRenderer.invoke("workbench:run-reminder-check"),
  openDataDirectory: () =>
    ipcRenderer.invoke("workbench:open-data-directory"),
  exportDiagnostics: () =>
    ipcRenderer.invoke("workbench:export-diagnostics"),
  cancelTask: (id: string) =>
    ipcRenderer.invoke("workbench:cancel-task", id),
  retryTask: (id: string) => ipcRenderer.invoke("workbench:retry-task", id),
  clearFinishedTasks: () =>
    ipcRenderer.invoke("workbench:clear-finished-tasks"),
  exportResumePdf: (versionId: string | null = null) =>
    ipcRenderer.invoke("workbench:export-resume", { versionId }),
};

contextBridge.exposeInMainWorld("jobWorkbench", api);
