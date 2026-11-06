import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Notification } from "electron";
import type {
  HealthCheckItem,
  SystemHealth,
} from "../shared/contracts";
import { AiSettingsService } from "./ai-settings";
import { AppLogger } from "./app-logger";
import { CollectorBrowserService } from "./collector-browser";
import { JobDatabase } from "./database";

export class HealthService {
  constructor(
    private readonly database: JobDatabase,
    private readonly collectorBrowser: CollectorBrowserService,
    private readonly aiSettings: AiSettingsService,
    private readonly logger: AppLogger,
    private readonly appVersion: string,
    private readonly startedAt: number,
    private readonly isTrayActive: () => boolean,
  ) {}

  async getStatus(): Promise<SystemHealth> {
    const dashboard = this.database.getDashboard();
    const crm = this.database.getCrmOverview();
    const ai = await this.aiSettings.getView();
    let databaseIntegrity = "ok";
    try {
      databaseIntegrity = this.database.checkIntegrity();
    } catch (error) {
      databaseIntegrity = error instanceof Error ? error.message : String(error);
    }
    let edgeRunning = false;
    let edgeEndpoint = "";
    try {
      const edge = await this.collectorBrowser.status();
      edgeRunning = edge.edgeRunning;
      edgeEndpoint = edge.endpoint;
    } catch {
      edgeRunning = false;
    }
    const recentBackups = this.listRecentBackups();
    const notificationsEnabled =
      this.database.getAppSetting("notifications.enabled") !== "false";
    const aiConfigured = ai.provider === "local" || ai.hasApiKey;
    const checks: HealthCheckItem[] = [
      {
        id: "database",
        label: "SQLite 数据库",
        status: databaseIntegrity === "ok" ? "ok" : "error",
        detail:
          databaseIntegrity === "ok"
            ? `Schema v${dashboard.schemaVersion}，完整性正常`
            : databaseIntegrity,
      },
      {
        id: "backup",
        label: "数据备份",
        status: recentBackups.length ? "ok" : "warning",
        detail: recentBackups.length
          ? `最近备份：${path.basename(recentBackups[0])}`
          : "尚未创建备份",
      },
      {
        id: "edge",
        label: "BOSS 专用 Edge",
        status: edgeRunning ? "ok" : "warning",
        detail: edgeRunning
          ? `调试连接正常：${edgeEndpoint}`
          : "当前未连接，不影响手工管理",
      },
      {
        id: "ai",
        label: "AI Provider",
        status: aiConfigured ? "ok" : "warning",
        detail:
          ai.provider === "local"
            ? "本地预分析可用"
            : ai.hasApiKey
              ? `${ai.provider} / ${ai.model} 已配置`
              : `${ai.provider} 缺少 API Key`,
      },
      {
        id: "tasks",
        label: "后台任务",
        status: "ok",
        detail: `${dashboard.pendingTasks} 个待处理，${dashboard.pendingCandidates} 个候选待预览`,
      },
      {
        id: "reminders",
        label: "提醒与托盘",
        status: notificationsEnabled ? "ok" : "warning",
        detail: notificationsEnabled
          ? `已开启，${crm.metrics.openFollowUps} 个未完成跟进`
          : "系统通知已关闭",
      },
    ];
    const overall = checks.some((check) => check.status === "error")
      ? "error"
      : checks.some((check) => check.status === "warning")
        ? "warning"
        : "ok";
    return {
      overall,
      appVersion: this.appVersion,
      uptimeSeconds: Math.max(
        0,
        Math.round((Date.now() - this.startedAt) / 1_000),
      ),
      schemaVersion: dashboard.schemaVersion,
      databasePath: dashboard.databasePath,
      dataDirectory: this.database.dataDir,
      backupDirectory: this.database.backupDir,
      logsDirectory: this.logger.directory,
      databaseIntegrity,
      recentBackups,
      edgeRunning,
      edgeEndpoint,
      aiProvider: ai.provider,
      aiConfigured,
      pendingTasks: dashboard.pendingTasks,
      pendingCandidates: dashboard.pendingCandidates,
      dueFollowUps: crm.metrics.openFollowUps,
      notificationSupported: Notification.isSupported(),
      notificationsEnabled,
      trayActive: this.isTrayActive(),
      checks,
    };
  }

  buildDiagnosticsReport(status: SystemHealth): string {
    const report = {
      generatedAt: new Date().toISOString(),
      application: {
        name: "求职工作台",
        version: status.appVersion,
        uptimeSeconds: status.uptimeSeconds,
      },
      runtime: {
        platform: process.platform,
        arch: process.arch,
        electron: process.versions.electron,
        node: process.versions.node,
      },
      health: status,
      notificationDeliveriesToday:
        this.database.countNotificationDeliveriesToday(),
      recentLogs: this.logger.readRecent(120),
      privacy: {
        excluded: [
          "API Key",
          "Cookie",
          "联系人信息",
          "简历正文",
          "招聘聊天",
          "岗位完整描述",
        ],
      },
    };
    let json = JSON.stringify(report, null, 2);
    const replacements: Array<[string, string]> = [
      [this.database.dataDir, "<DATA_DIR>"],
      [this.database.backupDir, "<BACKUP_DIR>"],
      [this.logger.directory, "<LOG_DIR>"],
      [os.homedir(), "<HOME>"],
    ];
    for (const [value, replacement] of replacements) {
      const escaped = JSON.stringify(value).slice(1, -1);
      json = json.replaceAll(value, replacement).replaceAll(escaped, replacement);
    }
    return json;
  }

  private listRecentBackups(): string[] {
    try {
      return fs
        .readdirSync(this.database.backupDir)
        .filter((file) => file.endsWith(".sqlite"))
        .map((file) => ({
          file: path.join(this.database.backupDir, file),
          modified: fs.statSync(path.join(this.database.backupDir, file)).mtimeMs,
        }))
        .sort((left, right) => right.modified - left.modified)
        .slice(0, 8)
        .map((item) => item.file);
    } catch {
      return [];
    }
  }
}
