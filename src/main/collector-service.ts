import { utilityProcess } from "electron";
import { CollectorWorkerMessageSchema } from "./collector-protocol";
import { JobDatabase } from "./database";
import type {
  CollectorCandidate,
  CollectorRequest,
} from "../shared/contracts";

export type CollectorRunContext = {
  signal: AbortSignal;
  reportProgress(progress: number): void;
};

export type CollectorRunResult = {
  candidates: CollectorCandidate[];
  warnings: string[];
  cachedSearches: number;
};

export class CollectorService {
  constructor(
    private readonly database: JobDatabase,
    private readonly workerPath: string,
  ) {}

  run(
    request: CollectorRequest,
    context: CollectorRunContext,
  ): Promise<CollectorRunResult> {
    if (context.signal.aborted) {
      return Promise.reject(new Error("采集任务已取消"));
    }
    const worker = utilityProcess.fork(this.workerPath, [], {
      serviceName: "BOSS Collector",
      stdio: "pipe",
    });

    return new Promise((resolve, reject) => {
      let settled = false;
      let lastProgress = 1;
      const timeout = setTimeout(() => {
        finishWithError(new Error("采集任务超时，已关闭 Worker"));
      }, 8 * 60 * 1_000);

      const cleanup = () => {
        clearTimeout(timeout);
        context.signal.removeEventListener("abort", onAbort);
      };
      const finishWithError = (error: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        worker.kill();
        reject(error);
      };
      const onAbort = () => finishWithError(new Error("采集任务已取消"));

      context.signal.addEventListener("abort", onAbort, { once: true });
      worker.on("spawn", () => {
        worker.postMessage({
          type: "start",
          request,
          cache: this.database.getCollectorCache(),
        });
      });
      worker.on("message", (rawMessage) => {
        if (settled) return;
        const parsed = CollectorWorkerMessageSchema.safeParse(rawMessage);
        if (!parsed.success) {
          finishWithError(new Error("Collector Worker 返回了无法识别的消息"));
          return;
        }
        if (parsed.data.type === "progress") {
          lastProgress = Math.max(lastProgress, parsed.data.progress);
          context.reportProgress(lastProgress);
          return;
        }
        if (parsed.data.type === "error") {
          finishWithError(new Error(parsed.data.error));
          return;
        }
        if (parsed.data.type !== "result") {
          finishWithError(
            new Error("Collector Worker 返回了不匹配的采集结果"),
          );
          return;
        }
        try {
          this.database.saveCollectorCache(parsed.data.cacheEntries);
        } catch (error) {
          finishWithError(
            error instanceof Error
              ? error
              : new Error("保存采集缓存失败"),
          );
          return;
        }
        settled = true;
        cleanup();
        worker.kill();
        resolve({
          candidates: parsed.data.candidates,
          warnings: parsed.data.warnings,
          cachedSearches: parsed.data.cacheEntries.length,
        });
      });
      worker.on("exit", (code) => {
        if (!settled) {
          finishWithError(
            new Error(`Collector Worker 异常退出（代码 ${String(code)}）`),
          );
        }
      });
    });
  }
}
