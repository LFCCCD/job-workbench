import { contextBridge, ipcRenderer } from "electron";
import type {
  JobFilters,
  JobStatus,
  JobWorkbenchApi,
  ManualJobInput,
  JobRecordUpdate,
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
  cancelTask: (id: string) =>
    ipcRenderer.invoke("workbench:cancel-task", id),
  retryTask: (id: string) => ipcRenderer.invoke("workbench:retry-task", id),
  clearFinishedTasks: () =>
    ipcRenderer.invoke("workbench:clear-finished-tasks"),
  exportResumePdf: () => ipcRenderer.invoke("workbench:export-resume"),
};

contextBridge.exposeInMainWorld("jobWorkbench", api);
