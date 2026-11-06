import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
} from "electron";
import { JobDatabase } from "./database";
import { TaskService } from "./task-service";
import { AiAnalysisService } from "./ai-service";
import { AiSettingsService } from "./ai-settings";
import { CollectorBrowserService } from "./collector-browser";
import { CollectorService } from "./collector-service";
import {
  AiAnalysisIdSchema,
  AiAnalyzeRequestSchema,
  AiSettingsInputSchema,
  ArchiveJobsSchema,
  CollectorIdsSchema,
  CollectorRequestSchema,
  JobStatusSchema,
  ListJobsSchema,
  ManualJobSchema,
  PermanentDeleteSchema,
  SaveViewSchema,
  SetFavoriteSchema,
  UpdateJobSchema,
  UpdateJobStatusSchema,
} from "../shared/contracts";
import type { MigrationPreview } from "../shared/contracts";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const userDataRoot =
  process.env.JOB_WORKBENCH_USER_DATA ||
  path.join(process.env.LOCALAPPDATA || app.getPath("appData"), "JobHunter");
app.setPath("userData", userDataRoot);

let mainWindow: BrowserWindow | null = null;
let database: JobDatabase | null = null;
let taskService: TaskService | null = null;
let collectorBrowser: CollectorBrowserService | null = null;
let aiSettings: AiSettingsService | null = null;
let pendingMigration: MigrationPreview | null = null;

function getDatabase(): JobDatabase {
  if (!database) {
    database = new JobDatabase(app.getPath("userData"));
  }
  return database;
}

function getTaskService(): TaskService {
  if (!taskService) {
    const collector = new CollectorService(
      getDatabase(),
      path.join(currentDir, "collector-worker.js"),
    );
    const settings = getAiSettingsService();
    const ai = new AiAnalysisService(
      getDatabase(),
      settings,
      path.join(currentDir, "ai-worker.js"),
    );
    taskService = new TaskService(getDatabase(), collector, ai);
  }
  return taskService;
}

function getCollectorBrowser(): CollectorBrowserService {
  collectorBrowser ||= new CollectorBrowserService(app.getPath("userData"));
  return collectorBrowser;
}

function getAiSettingsService(): AiSettingsService {
  aiSettings ||= new AiSettingsService(
    getDatabase(),
    app.getPath("userData"),
  );
  return aiSettings;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    title: "求职工作台",
    backgroundColor: "#edf4f2",
    webPreferences: {
      preload: path.join(currentDir, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const currentUrl = mainWindow?.webContents.getURL() || "";
    if (currentUrl && url !== currentUrl) event.preventDefault();
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(path.join(currentDir, "../renderer/index.html"));
  }
}

function registerIpc() {
  ipcMain.handle("workbench:dashboard", () => getDatabase().getDashboard());
  ipcMain.handle("workbench:list-jobs", (_event, input) => {
    return getDatabase().listJobs(ListJobsSchema.parse(input || {}));
  });
  ipcMain.handle("workbench:job-detail", (_event, id) => {
    return getDatabase().getJobDetail(String(id));
  });
  ipcMain.handle("workbench:add-job", (_event, input) => {
    return getDatabase().addJob(ManualJobSchema.parse(input));
  });
  ipcMain.handle("workbench:update-job", (_event, input) => {
    const parsed = UpdateJobSchema.parse(input);
    return getDatabase().updateJob(parsed.id, parsed.fields);
  });
  ipcMain.handle("workbench:update-status", (_event, input) => {
    const { id, status } = UpdateJobStatusSchema.parse(input);
    return getDatabase().updateStatus(id, JobStatusSchema.parse(status));
  });
  ipcMain.handle("workbench:set-favorite", (_event, input) => {
    const parsed = SetFavoriteSchema.parse(input);
    return getDatabase().setFavorite(parsed.id, parsed.favorite);
  });
  ipcMain.handle("workbench:archive-jobs", (_event, input) => {
    const { ids } = ArchiveJobsSchema.parse(input);
    const count = getDatabase().setArchived(ids, true);
    return { ok: true, message: `已归档 ${count} 个岗位` };
  });
  ipcMain.handle("workbench:restore-jobs", (_event, input) => {
    const { ids } = ArchiveJobsSchema.parse(input);
    const count = getDatabase().setArchived(ids, false);
    return { ok: true, message: `已恢复 ${count} 个岗位` };
  });
  ipcMain.handle("workbench:delete-jobs-permanently", (_event, input) => {
    const { ids } = PermanentDeleteSchema.parse(input);
    const count = getDatabase().permanentlyDeleteJobs(ids);
    return { ok: true, message: `已永久删除 ${count} 个岗位` };
  });
  ipcMain.handle("workbench:list-views", () => {
    return getDatabase().listSavedViews();
  });
  ipcMain.handle("workbench:save-view", (_event, input) => {
    const parsed = SaveViewSchema.parse(input);
    return getDatabase().saveView(parsed.name, parsed.filters);
  });
  ipcMain.handle("workbench:delete-view", (_event, id) => {
    const deleted = getDatabase().deleteSavedView(String(id));
    return { ok: true, message: deleted ? "筛选视图已删除" : "筛选视图不存在" };
  });
  ipcMain.handle("workbench:create-backup", async () => {
    return getDatabase().createBackup("manual");
  });
  ipcMain.handle("workbench:list-tasks", () => {
    return getTaskService().listTasks();
  });
  ipcMain.handle("workbench:create-backup-task", () => {
    return getTaskService().enqueue("backup");
  });
  ipcMain.handle("workbench:create-collector-task", (_event, input) => {
    const request = CollectorRequestSchema.parse(input);
    return getTaskService().enqueue("collector", request);
  });
  ipcMain.handle("workbench:collector-status", () => {
    return getCollectorBrowser().status();
  });
  ipcMain.handle("workbench:open-collector-browser", () => {
    return getCollectorBrowser().open();
  });
  ipcMain.handle("workbench:collector-preview", () => {
    return getDatabase().getCollectorPreview();
  });
  ipcMain.handle("workbench:import-collector-candidates", (_event, input) => {
    const { ids } = CollectorIdsSchema.parse(input);
    return getDatabase().importCollectorCandidates(ids);
  });
  ipcMain.handle("workbench:dismiss-collector-candidates", (_event, input) => {
    const { ids } = CollectorIdsSchema.parse(input);
    const count = getDatabase().dismissCollectorCandidates(ids);
    return { ok: true, message: `已移除 ${count} 个候选岗位` };
  });
  ipcMain.handle("workbench:ai-settings", () => {
    return getAiSettingsService().getView();
  });
  ipcMain.handle("workbench:save-ai-settings", (_event, input) => {
    return getAiSettingsService().save(AiSettingsInputSchema.parse(input));
  });
  ipcMain.handle("workbench:clear-ai-key", () => {
    getAiSettingsService().clearApiKey();
    return { ok: true, message: "AI API Key 已清除" };
  });
  ipcMain.handle("workbench:create-ai-analysis", (_event, input) => {
    const request = AiAnalyzeRequestSchema.parse(input);
    return getTaskService().enqueue("ai-analysis", request);
  });
  ipcMain.handle("workbench:job-ai-analysis", (_event, jobId) => {
    return getDatabase().getLatestAiAnalysis(String(jobId));
  });
  ipcMain.handle("workbench:list-ai-analyses", (_event, limit) => {
    return getDatabase().listAiAnalyses(
      typeof limit === "number" ? limit : 30,
    );
  });
  ipcMain.handle("workbench:ai-usage", async () => {
    const settings = await getAiSettingsService().getView();
    return getDatabase().getAiUsage(settings.dailyRequestLimit);
  });
  ipcMain.handle("workbench:delete-ai-analysis", (_event, input) => {
    const { id } = AiAnalysisIdSchema.parse(input);
    const deleted = getDatabase().deleteAiAnalysis(id);
    return {
      ok: true,
      message: deleted ? "分析记录已删除" : "分析记录不存在",
    };
  });
  ipcMain.handle("workbench:cancel-task", (_event, id) => {
    return getTaskService().cancel(String(id));
  });
  ipcMain.handle("workbench:retry-task", (_event, id) => {
    return getTaskService().retry(String(id));
  });
  ipcMain.handle("workbench:clear-finished-tasks", () => {
    return getTaskService().clearFinished();
  });
  ipcMain.handle("workbench:inspect-legacy-database", async () => {
    if (!mainWindow) return null;
    const defaultDb = path.join(
      app.getPath("desktop"),
      "work",
      "job-hunter",
      "data",
      "job-hunter.sqlite",
    );
    const selection = await dialog.showOpenDialog(mainWindow, {
      title: "选择旧版求职工作台数据库",
      defaultPath: defaultDb,
      properties: ["openFile"],
      filters: [{ name: "SQLite Database", extensions: ["sqlite", "db"] }],
    });
    if (selection.canceled || !selection.filePaths[0]) return null;
    pendingMigration = getDatabase().inspectLegacyDatabase(
      selection.filePaths[0],
    );
    return pendingMigration;
  });
  ipcMain.handle("workbench:confirm-migration", async () => {
    if (!pendingMigration) throw new Error("没有待确认的迁移任务");
    const preview = pendingMigration;
    pendingMigration = null;
    return getDatabase().migrateLegacy(preview.sourcePath);
  });
  ipcMain.handle("workbench:restore-backup", async () => {
    if (!mainWindow) return null;
    const database = getDatabase();
    const selection = await dialog.showOpenDialog(mainWindow, {
      title: "选择要恢复的 SQLite 备份",
      defaultPath: database.backupDir,
      properties: ["openFile"],
      filters: [{ name: "SQLite Backup", extensions: ["sqlite", "db"] }],
    });
    if (selection.canceled || !selection.filePaths[0]) return null;
    const preview = database.inspectLegacyDatabase(selection.filePaths[0]);
    const summary = Object.entries(preview.counts)
      .map(([table, count]) => `${table}: ${count}`)
      .join("\n");
    const confirmation = await dialog.showMessageBox(mainWindow, {
      type: "warning",
      title: "恢复数据库",
      message: "恢复会覆盖当前数据，但系统会先自动创建安全备份。",
      detail: summary,
      buttons: ["取消", "确认恢复"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (confirmation.response !== 1) return null;
    return database.restoreBackup(preview.sourcePath);
  });
  ipcMain.handle("workbench:export-resume", async () => {
    if (!mainWindow) return null;
    const { profile, facts } = getDatabase().getResumeDocumentData();
    if (!profile) throw new Error("数据库中还没有个人资料");
    const sections = facts
      .map((fact) => {
        const bullets = JSON.parse(String(fact.bullets_json || "[]")) as string[];
        return `<section><h2>${escapeHtml(fact.kind)}</h2><h3>${escapeHtml(
          fact.title,
        )}</h3><p>${escapeHtml(fact.organization)} ${escapeHtml(
          fact.role,
        )}</p><ul>${bullets
          .map((bullet) => `<li>${escapeHtml(bullet)}</li>`)
          .join("")}</ul></section>`;
      })
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      body{font-family:"Microsoft YaHei",sans-serif;color:#172a30;padding:44px;line-height:1.65}
      h1{font-size:28px;margin:0 0 4px}h2{font-size:16px;border-bottom:1px solid #d8e4e3;padding-bottom:4px;margin-top:24px}
      h3{font-size:15px;margin-bottom:2px}p{color:#53666c}ul{margin-top:5px}
    </style></head><body><h1>${escapeHtml(
      profile.full_name,
    )}</h1><p>${escapeHtml(profile.phone)} · ${escapeHtml(
      profile.email,
    )} · ${escapeHtml(profile.current_city)}</p>${sections}</body></html>`;
    const pdfWindow = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true },
    });
    await pdfWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
    );
    const pdf = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
    });
    pdfWindow.destroy();

    const save = await dialog.showSaveDialog(mainWindow, {
      title: "保存简历 PDF",
      defaultPath: path.join(app.getPath("documents"), "求职简历.pdf"),
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (save.canceled || !save.filePath) return null;
    const fs = await import("node:fs/promises");
    await fs.writeFile(save.filePath, pdf);
    return save.filePath;
  });
}

app.whenReady().then(() => {
  registerIpc();
  getTaskService().resumeQueuedTasks();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  taskService?.shutdown();
  taskService = null;
  database?.close();
  database = null;
});
