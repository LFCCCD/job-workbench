import { utilityProcess } from "electron";
import type { DetailBackfillTarget } from "../shared/contracts";
import { CollectorWorkerMessageSchema } from "./collector-protocol";

export type DetailBackfillRunContext = {
  signal: AbortSignal;
  reportProgress(progress: number): void;
};

export type DetailBackfillRunResult = {
  details: Array<{
    targetKey: string;
    candidateSourceKey: string | null;
    jobId: string | null;
    success: boolean;
    candidate: DetailBackfillTarget["candidate"] | null;
    error: string;
  }>;
  warnings: string[];
};

export class DetailBackfillService {
  constructor(private readonly workerPath: string) {}

  run(
    targets: DetailBackfillTarget[],
    requestDelayMs: number,
    context: DetailBackfillRunContext,
  ): Promise<DetailBackfillRunResult> {
    const worker = utilityProcess.fork(this.workerPath, [], {
      serviceName: "BOSS Detail Backfill",
      stdio: "pipe",
    });
    return new Promise((resolve, reject) => {
      let settled = false;
      let lastProgress = 1;
      const timeout = setTimeout(() => {
        finishWithError(new Error("详情补全任务超时，Worker 已关闭"));
      }, 10 * 60 * 1_000);
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
      const onAbort = () => finishWithError(new Error("详情补全任务已取消"));
      context.signal.addEventListener("abort", onAbort, { once: true });
      worker.on("spawn", () => {
        worker.postMessage({
          type: "backfill",
          targets,
          requestDelayMs,
        });
      });
      worker.on("message", (rawMessage) => {
        if (settled) return;
        const parsed = CollectorWorkerMessageSchema.safeParse(rawMessage);
        if (!parsed.success) {
          finishWithError(
            new Error("详情补全 Worker 返回了无法识别的消息"),
          );
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
        if (parsed.data.type !== "backfill-result") {
          finishWithError(
            new Error("详情补全 Worker 返回了不匹配的结果"),
          );
          return;
        }
        settled = true;
        cleanup();
        worker.kill();
        resolve({
          details: parsed.data.details,
          warnings: parsed.data.warnings,
        });
      });
      worker.on("exit", (code) => {
        if (!settled) {
          finishWithError(
            new Error(
              `详情补全 Worker 异常退出（代码 ${String(code)}）`,
            ),
          );
        }
      });
    });
  }
}
