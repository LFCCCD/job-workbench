import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { CollectorStatus } from "../shared/contracts";
import { bossCollectorConfig } from "./boss-collector";

function findEdgeExecutable(): string {
  const candidates = [
    process.env.PROGRAMFILES
      ? path.join(
          process.env.PROGRAMFILES,
          "Microsoft",
          "Edge",
          "Application",
          "msedge.exe",
        )
      : "",
    process.env["PROGRAMFILES(X86)"]
      ? path.join(
          process.env["PROGRAMFILES(X86)"],
          "Microsoft",
          "Edge",
          "Application",
          "msedge.exe",
        )
      : "",
    process.env.LOCALAPPDATA
      ? path.join(
          process.env.LOCALAPPDATA,
          "Microsoft",
          "Edge",
          "Application",
          "msedge.exe",
        )
      : "",
  ].filter(Boolean);
  const executable = candidates.find((candidate) => fs.existsSync(candidate));
  if (!executable) {
    throw new Error("没有找到 Microsoft Edge，请先安装 Edge");
  }
  return executable;
}

export class CollectorBrowserService {
  readonly profilePath: string;

  constructor(userDataDir: string) {
    this.profilePath = path.join(userDataDir, "collector-edge-profile");
    fs.mkdirSync(this.profilePath, { recursive: true });
  }

  async status(): Promise<CollectorStatus> {
    let edgeRunning = false;
    try {
      const response = await fetch(
        `${bossCollectorConfig.endpoint}/json/version`,
        { signal: AbortSignal.timeout(1_200) },
      );
      edgeRunning = response.ok;
    } catch {
      edgeRunning = false;
    }
    return {
      edgeRunning,
      profilePath: this.profilePath,
      endpoint: bossCollectorConfig.endpoint,
    };
  }

  async open(): Promise<CollectorStatus> {
    const current = await this.status();
    if (current.edgeRunning) return current;
    const executable = findEdgeExecutable();
    const child = spawn(
      executable,
      [
        `--remote-debugging-port=9333`,
        "--remote-debugging-address=127.0.0.1",
        `--user-data-dir=${this.profilePath}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-session-crashed-bubble",
        `${bossCollectorConfig.origin}/web/user/?ka=header-login`,
      ],
      {
        detached: true,
        stdio: "ignore",
        windowsHide: false,
      },
    );
    child.unref();

    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      const status = await this.status();
      if (status.edgeRunning) return status;
    }
    throw new Error(
      "专用 Edge 已启动，但调试端口没有响应。请关闭该 Edge 窗口后重试",
    );
  }
}
