import fs from "node:fs";
import path from "node:path";

export class AppLogger {
  readonly directory: string;

  constructor(userDataDir: string) {
    this.directory = path.join(userDataDir, "logs");
    fs.mkdirSync(this.directory, { recursive: true });
    this.prune();
  }

  log(level: "info" | "warn" | "error", message: string) {
    try {
      const file = path.join(
        this.directory,
        `app-${new Date().toISOString().slice(0, 10)}.log`,
      );
      const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message.replace(
        /[\r\n]+/g,
        " ",
      )}\n`;
      fs.appendFileSync(file, line, "utf8");
    } catch {
      // Logging must never interrupt application behavior.
    }
  }

  readRecent(limit = 100): string[] {
    try {
      const files = fs
        .readdirSync(this.directory)
        .filter((file) => file.endsWith(".log"))
        .sort()
        .reverse();
      const lines: string[] = [];
      for (const file of files) {
        const content = fs.readFileSync(
          path.join(this.directory, file),
          "utf8",
        );
        lines.push(...content.trim().split(/\r?\n/).filter(Boolean));
        if (lines.length >= limit) break;
      }
      return lines.slice(-limit);
    } catch {
      return [];
    }
  }

  private prune() {
    try {
      const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1_000;
      for (const file of fs.readdirSync(this.directory)) {
        if (!/^app-\d{4}-\d{2}-\d{2}\.log$/.test(file)) continue;
        const filePath = path.join(this.directory, file);
        if (fs.statSync(filePath).mtimeMs < cutoff) {
          fs.rmSync(filePath);
        }
      }
    } catch {
      // A failed cleanup is non-fatal.
    }
  }
}
