import { contextBridge, ipcRenderer } from "electron";
import type {
  JobStatus,
  JobWorkbenchApi,
  ManualJobInput,
} from "../shared/contracts";

const api: JobWorkbenchApi = {
  getDashboard: () => ipcRenderer.invoke("workbench:dashboard"),
  listJobs: (includeArchived = false) =>
    ipcRenderer.invoke("workbench:list-jobs", { includeArchived }),
  addJob: (input: ManualJobInput) =>
    ipcRenderer.invoke("workbench:add-job", input),
  updateJobStatus: (input: { id: string; status: JobStatus }) =>
    ipcRenderer.invoke("workbench:update-status", input),
  archiveJobs: (ids: string[]) =>
    ipcRenderer.invoke("workbench:archive-jobs", { ids }),
  restoreJobs: (ids: string[]) =>
    ipcRenderer.invoke("workbench:restore-jobs", { ids }),
  inspectLegacyDatabase: () =>
    ipcRenderer.invoke("workbench:inspect-legacy-database"),
  confirmLegacyMigration: () =>
    ipcRenderer.invoke("workbench:confirm-migration"),
  chooseAndRestore: () => ipcRenderer.invoke("workbench:restore-backup"),
  createBackup: () => ipcRenderer.invoke("workbench:create-backup"),
  exportResumePdf: () => ipcRenderer.invoke("workbench:export-resume"),
};

contextBridge.exposeInMainWorld("jobWorkbench", api);
