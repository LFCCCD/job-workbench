import type { UpdateInfo } from "../shared/contracts";
import { AppLogger } from "./app-logger";
import { JobDatabase } from "./database";

const UPDATE_CACHE_MS = 6 * 60 * 60 * 1_000;

export function compareVersions(left: string, right: string): number {
  const parse = (value: string) => {
    const normalized = value.trim().replace(/^v/i, "");
    const [main, prerelease = ""] = normalized.split("-", 2);
    const parts = main.split(".").map((part) => Number(part) || 0);
    return { parts, prerelease };
  };
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < Math.max(a.parts.length, b.parts.length); index += 1) {
    const difference = (a.parts[index] || 0) - (b.parts[index] || 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  if (a.prerelease === b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;
  return a.prerelease.localeCompare(b.prerelease, "en", { numeric: true });
}

export class UpdateService {
  constructor(
    private readonly database: JobDatabase,
    private readonly appVersion: string,
    private readonly logger: AppLogger,
  ) {}

  getCached(): UpdateInfo | null {
    const raw = this.database.getAppSetting("updates.lastResult");
    if (!raw) return null;
    try {
      const cached = JSON.parse(raw) as UpdateInfo;
      return {
        ...cached,
        currentVersion: this.appVersion,
        available:
          compareVersions(cached.latestVersion, this.appVersion) > 0,
      };
    } catch {
      return null;
    }
  }

  isAutoCheckEnabled(): boolean {
    return this.database.getAppSetting("updates.autoCheck") !== "false";
  }

  setAutoCheck(enabled: boolean) {
    this.database.setAppSetting(
      "updates.autoCheck",
      enabled ? "true" : "false",
    );
  }

  async check(force = false): Promise<UpdateInfo> {
    const cached = this.getCached();
    if (
      !force &&
      cached &&
      Date.now() - Date.parse(cached.checkedAt) < UPDATE_CACHE_MS
    ) {
      return cached;
    }
    const endpoint =
      process.env.JOB_WORKBENCH_UPDATE_API ||
      "https://api.github.com/repos/LFCCCD/job-workbench/releases/latest";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(endpoint, {
        headers: {
          accept: "application/vnd.github+json",
          "user-agent": "job-workbench-update-check",
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`更新服务返回 HTTP ${response.status}`);
      }
      const data = (await response.json()) as {
        tag_name?: string;
        name?: string;
        body?: string;
        html_url?: string;
        published_at?: string;
        prerelease?: boolean;
        assets?: Array<{ browser_download_url?: string; name?: string }>;
      };
      const latestTag = String(data.tag_name || "").trim();
      if (!latestTag) throw new Error("更新服务没有返回版本号");
      const latestVersion = latestTag.replace(/^v/i, "");
      const htmlUrl = safeHttpsUrl(data.html_url);
      const assets = Array.isArray(data.assets) ? data.assets : [];
      const preferredAsset =
        assets.find((asset) => /\.exe$/i.test(String(asset.name || ""))) ||
        assets[0];
      const info: UpdateInfo = {
        currentVersion: this.appVersion,
        latestVersion,
        latestTag,
        name: String(data.name || latestTag).slice(0, 500),
        available: compareVersions(latestVersion, this.appVersion) > 0,
        prerelease: Boolean(data.prerelease),
        publishedAt: String(data.published_at || ""),
        htmlUrl,
        downloadUrl: safeHttpsUrl(preferredAsset?.browser_download_url),
        notes: String(data.body || "").slice(0, 20_000),
        checkedAt: new Date().toISOString(),
      };
      this.database.setAppSetting(
        "updates.lastResult",
        JSON.stringify(info),
      );
      this.logger.log(
        "info",
        `update.checked latest=${latestTag} available=${info.available}`,
      );
      return info;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      this.logger.log("warn", `update.check_failed ${message}`);
      throw new Error(`检查更新失败：${message}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function safeHttpsUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}
