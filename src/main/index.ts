import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  shell,
  Tray,
} from "electron";
import { JobDatabase } from "./database";
import { TaskService } from "./task-service";
import { AiAnalysisService } from "./ai-service";
import { AiSettingsService } from "./ai-settings";
import { CollectorBrowserService } from "./collector-browser";
import { CollectorService } from "./collector-service";
import { renderResumeHtml } from "./resume-render";
import { AppLogger } from "./app-logger";
import { HealthService } from "./health-service";
import { ReminderService } from "./reminder-service";
import { createTrayImage } from "./tray-icon";
import {
  AiAnalysisIdSchema,
  AiAnalyzeRequestSchema,
  AiSettingsInputSchema,
  ArchiveJobsSchema,
  CollectorIdsSchema,
  CollectorRequestSchema,
  CrmDeleteSchema,
  CrmJobIdSchema,
  JobStatusSchema,
  ListJobsSchema,
  ManualJobSchema,
  NotificationSettingSchema,
  PermanentDeleteSchema,
  ResumeExportRequestSchema,
  ResumeIdSchema,
  ResumeProfileInputSchema,
  ResumeVerifiedSchema,
  SaveFollowUpSchema,
  SaveInterviewSchema,
  SaveJobContactSchema,
  SaveResumeFactSchema,
  SaveResumeVersionSchema,
  SaveViewSchema,
  SetFavoriteSchema,
  SetFollowUpStatusSchema,
  UpdateJobSchema,
  UpdateJobStatusSchema,
} from "../shared/contracts";
import type { MigrationPreview } from "../shared/contracts";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const userDataRoot =
  process.env.JOB_WORKBENCH_USER_DATA ||
  path.join(process.env.LOCALAPPDATA || app.getPath("appData"), "JobHunter");
app.setPath("userData", userDataRoot);
const startedAt = Date.now();
const hasSingleInstanceLock = app.requestSingleInstanceLock();

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let database: JobDatabase | null = null;
let taskService: TaskService | null = null;
let collectorBrowser: CollectorBrowserService | null = null;
let aiSettings: AiSettingsService | null = null;
let appLogger: AppLogger | null = null;
let healthService: HealthService | null = null;
let reminderService: ReminderService | null = null;
let reminderTimer: NodeJS.Timeout | null = null;
let isQuitting = false;
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

function getAppLogger(): AppLogger {
  appLogger ||= new AppLogger(app.getPath("userData"));
  return appLogger;
}

function getHealthService(): HealthService {
  healthService ||= new HealthService(
    getDatabase(),
    getCollectorBrowser(),
    getAiSettingsService(),
    getAppLogger(),
    app.getVersion(),
    startedAt,
    () => Boolean(tray),
  );
  return healthService;
}

function getReminderService(): ReminderService {
  reminderService ||= new ReminderService(
    getDatabase(),
    getAppLogger(),
    showMainWindow,
  );
  return reminderService;
}

function showMainWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function updateTrayMenu() {
  if (!tray || !database) return;
  let openFollowUps = 0;
  try {
    openFollowUps = database.getCrmOverview().metrics.openFollowUps;
  } catch {
    openFollowUps = 0;
  }
  tray.setToolTip(
    `求职工作台${openFollowUps ? ` · ${openFollowUps} 个跟进待处理` : ""}`,
  );
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "显示求职工作台",
        click: showMainWindow,
      },
      {
        label: `未完成跟进：${openFollowUps}`,
        enabled: false,
      },
      {
        label: "立即检查提醒",
        click: () => {
          getReminderService().check();
          updateTrayMenu();
        },
      },
      {
        label: "打开数据目录",
        click: () => void shell.openPath(getDatabase().dataDir),
      },
      { type: "separator" },
      {
        label: "退出求职工作台",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
}

function createTray() {
  if (tray) return;
  tray = new Tray(createTrayImage());
  tray.setToolTip("求职工作台");
  tray.on("click", showMainWindow);
  tray.on("double-click", showMainWindow);
  updateTrayMenu();
}

function safeFileName(value: string): string {
  const cleaned = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 120);
  return cleaned || "求职简历";
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
  mainWindow.on("close", (event) => {
    if (!isQuitting && tray) {
      event.preventDefault();
      mainWindow?.hide();
      getAppLogger().log("info", "window.hidden_to_tray");
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
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
    if (!database) {
      return {
        todayRemoteCalls: 0,
        dailyLimit: 20,
        totalAnalyses: 0,
        cachedHits: 0,
      };
    }
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
  ipcMain.handle("workbench:resume-workspace", () => {
    return getDatabase().getResumeWorkspace();
  });
  ipcMain.handle("workbench:save-resume-profile", (_event, input) => {
    return getDatabase().saveResumeProfile(
      ResumeProfileInputSchema.parse(input),
    );
  });
  ipcMain.handle("workbench:save-resume-fact", (_event, input) => {
    const id =
      input && typeof input.id === "string" ? String(input.id) : null;
    const parsed = SaveResumeFactSchema.parse({
      ...(id ? { id } : {}),
      fields: input?.fields,
    });
    return getDatabase().saveResumeFact(parsed.id || null, parsed.fields);
  });
  ipcMain.handle("workbench:set-resume-fact-verified", (_event, input) => {
    const parsed = ResumeVerifiedSchema.parse(input);
    return getDatabase().setResumeFactVerified(
      parsed.id,
      parsed.verified,
    );
  });
  ipcMain.handle("workbench:delete-resume-fact", (_event, input) => {
    const { id } = ResumeIdSchema.parse(input);
    const deleted = getDatabase().deleteResumeFact(id);
    return {
      ok: true,
      message: deleted ? "简历事实已删除" : "简历事实不存在",
    };
  });
  ipcMain.handle("workbench:save-resume-version", (_event, input) => {
    const id =
      input && typeof input.id === "string" ? String(input.id) : null;
    const parsed = SaveResumeVersionSchema.parse({
      ...(id ? { id } : {}),
      fields: input?.fields,
    });
    return getDatabase().saveResumeVersion(
      parsed.id || null,
      parsed.fields,
    );
  });
  ipcMain.handle("workbench:delete-resume-version", (_event, input) => {
    const { id } = ResumeIdSchema.parse(input);
    const deleted = getDatabase().deleteResumeVersion(id);
    return {
      ok: true,
      message: deleted ? "简历版本已删除" : "简历版本不存在",
    };
  });
  ipcMain.handle("workbench:crm-overview", () => {
    return getDatabase().getCrmOverview();
  });
  ipcMain.handle("workbench:crm-workspace", (_event, input) => {
    const { jobId } = CrmJobIdSchema.parse(input);
    return getDatabase().getCrmWorkspace(jobId);
  });
  ipcMain.handle("workbench:save-contact", (_event, input) => {
    const { jobId } = CrmJobIdSchema.parse(input);
    const id =
      input && typeof input.id === "string" ? String(input.id) : null;
    const parsed = SaveJobContactSchema.parse({
      ...(id ? { id } : {}),
      fields: input?.fields,
    });
    return getDatabase().saveJobContact(
      jobId,
      parsed.id || null,
      parsed.fields,
    );
  });
  ipcMain.handle("workbench:delete-contact", (_event, input) => {
    const { id } = CrmDeleteSchema.parse(input);
    const deleted = getDatabase().deleteJobContact(id);
    return {
      ok: true,
      message: deleted ? "联系人已删除" : "联系人不存在",
    };
  });
  ipcMain.handle("workbench:save-follow-up", (_event, input) => {
    const { jobId } = CrmJobIdSchema.parse(input);
    const id =
      input && typeof input.id === "string" ? String(input.id) : null;
    const parsed = SaveFollowUpSchema.parse({
      ...(id ? { id } : {}),
      fields: input?.fields,
    });
    const result = getDatabase().saveFollowUp(
      jobId,
      parsed.id || null,
      parsed.fields,
    );
    updateTrayMenu();
    return result;
  });
  ipcMain.handle("workbench:set-follow-up-status", (_event, input) => {
    const parsed = SetFollowUpStatusSchema.parse(input);
    const result = getDatabase().setFollowUpStatus(parsed.id, parsed.status);
    updateTrayMenu();
    return result;
  });
  ipcMain.handle("workbench:delete-follow-up", (_event, input) => {
    const { id } = CrmDeleteSchema.parse(input);
    const deleted = getDatabase().deleteFollowUp(id);
    updateTrayMenu();
    return {
      ok: true,
      message: deleted ? "跟进任务已删除" : "跟进任务不存在",
    };
  });
  ipcMain.handle("workbench:save-interview", (_event, input) => {
    const { jobId } = CrmJobIdSchema.parse(input);
    const id =
      input && typeof input.id === "string" ? String(input.id) : null;
    const parsed = SaveInterviewSchema.parse({
      ...(id ? { id } : {}),
      fields: input?.fields,
    });
    return getDatabase().saveInterview(
      jobId,
      parsed.id || null,
      parsed.fields,
    );
  });
  ipcMain.handle("workbench:delete-interview", (_event, input) => {
    const { id } = CrmDeleteSchema.parse(input);
    const deleted = getDatabase().deleteInterview(id);
    return {
      ok: true,
      message: deleted ? "面试记录已删除" : "面试记录不存在",
    };
  });
  ipcMain.handle("workbench:system-health", () => {
    return getHealthService().getStatus();
  });
  ipcMain.handle("workbench:set-notifications", (_event, input) => {
    const { enabled } = NotificationSettingSchema.parse(input);
    getDatabase().setAppSetting(
      "notifications.enabled",
      enabled ? "true" : "false",
    );
    updateTrayMenu();
    return {
      ok: true,
      message: enabled ? "系统通知已开启" : "系统通知已关闭",
    };
  });
  ipcMain.handle("workbench:run-reminder-check", () => {
    const result = getReminderService().check();
    updateTrayMenu();
    return result;
  });
  ipcMain.handle("workbench:open-data-directory", async () => {
    const target = getDatabase().dataDir;
    const error = await shell.openPath(target);
    return {
      ok: !error,
      message: error || `已打开数据目录：${target}`,
    };
  });
  ipcMain.handle("workbench:export-diagnostics", async () => {
    if (!mainWindow) return null;
    const status = await getHealthService().getStatus();
    const report = getHealthService().buildDiagnosticsReport(status);
    const stamp = new Date()
      .toISOString()
      .replaceAll(":", "")
      .replaceAll("-", "")
      .slice(0, 15);
    const save = await dialog.showSaveDialog(mainWindow, {
      title: "保存脱敏诊断报告",
      defaultPath: path.join(
        app.getPath("documents"),
        `求职工作台-诊断-${stamp}.json`,
      ),
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (save.canceled || !save.filePath) return null;
    const fs = await import("node:fs/promises");
    await fs.writeFile(save.filePath, report, "utf8");
    getAppLogger().log("info", "diagnostics.exported");
    return save.filePath;
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
  ipcMain.handle(
    "workbench:export-resume",
    async (_event, rawInput?: unknown) => {
      if (!mainWindow) return null;
      const { versionId } = ResumeExportRequestSchema.parse(rawInput || {});
      const { profile, facts, version } =
        getDatabase().getResumeDocumentData(versionId);
      if (!profile) throw new Error("数据库中还没有个人资料");
      if (!profile.fullName.trim()) throw new Error("请先填写姓名");
      if (!facts.length) throw new Error("当前简历版本没有可导出的事实");
      const html = renderResumeHtml({ profile, facts, version });
      const pdfWindow = new BrowserWindow({
        show: false,
        webPreferences: { sandbox: true },
      });
      let pdf: Buffer;
      try {
        await pdfWindow.loadURL(
          `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
        );
        pdf = await pdfWindow.webContents.printToPDF({
          printBackground: true,
          pageSize: "A4",
        });
      } finally {
        pdfWindow.destroy();
      }

      const save = await dialog.showSaveDialog(mainWindow, {
        title: "保存简历 PDF",
        defaultPath: path.join(
          app.getPath("documents"),
          `${safeFileName(version?.name || "求职简历")}.pdf`,
        ),
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (save.canceled || !save.filePath) return null;
      const fs = await import("node:fs/promises");
      await fs.writeFile(save.filePath, pdf);
      return save.filePath;
    },
  );
}

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", showMainWindow);
  app.whenReady().then(() => {
    getAppLogger().log("info", `app.started version=${app.getVersion()}`);
    registerIpc();
    getTaskService().resumeQueuedTasks();
    createTray();
    createWindow();
    const initialReminder = setTimeout(() => {
      getReminderService().check();
      updateTrayMenu();
    }, 4_000);
    initialReminder.unref();
    reminderTimer = setInterval(() => {
      getReminderService().check();
      updateTrayMenu();
    }, 5 * 60 * 1_000);
    reminderTimer.unref();

    app.on("activate", showMainWindow);
  });

  app.on("window-all-closed", () => {
    if (!tray) app.quit();
  });

  app.on("before-quit", () => {
    isQuitting = true;
    if (reminderTimer) clearInterval(reminderTimer);
    reminderTimer = null;
    tray?.destroy();
    tray = null;
    getAppLogger().log("info", "app.stopped");
    taskService?.shutdown();
    taskService = null;
    database?.close();
    database = null;
  });
}
