import { createHash } from "node:crypto";
import { utilityProcess } from "electron";
import {
  AiWorkerMessageSchema,
  type AiWorkerStart,
  type AiWorkerMessage,
} from "./ai-worker-protocol";
import {
  AI_PROMPT_VERSION,
  AI_SCHEMA_VERSION,
  validateAiAnalysis,
} from "./ai-analysis";
import { AiSettingsService } from "./ai-settings";
import { JobDatabase } from "./database";

export type AiRunContext = {
  signal: AbortSignal;
  reportProgress(progress: number): void;
};

export class AiAnalysisService {
  constructor(
    private readonly database: JobDatabase,
    private readonly settings: AiSettingsService,
    private readonly workerPath: string,
  ) {}

  async analyzeJob(
    jobId: string,
    force: boolean,
    context: AiRunContext,
  ): Promise<Record<string, unknown>> {
    const jobContext = this.database.getAiJobContext(jobId);
    if (!jobContext.job.description.trim()) {
      throw new Error("岗位描述为空，请先补充 JD 后再分析");
    }
    const provider = await this.settings.getRuntimeConfig();
    const inputHash = createHash("sha256")
      .update(
        JSON.stringify({
          job: jobContext.job,
          facts: jobContext.facts,
          resumeVersions: jobContext.resumeVersions,
        }),
      )
      .digest("hex");
    const cacheKey = createHash("sha256")
      .update(
        JSON.stringify({
          inputHash,
          provider: provider.provider,
          baseUrl: provider.baseUrl,
          model: provider.model,
          promptVersion: AI_PROMPT_VERSION,
          schemaVersion: AI_SCHEMA_VERSION,
        }),
      )
      .digest("hex");

    if (!force) {
      const cached = this.database.findCachedAiAnalysis(cacheKey);
      if (cached?.result) {
        const cachedRecord = this.database.createAiAnalysis({
          jobId,
          status: "succeeded",
          provider: cached.provider,
          model: cached.model,
          cacheKey,
          inputHash,
          promptVersion: AI_PROMPT_VERSION,
          schemaVersion: AI_SCHEMA_VERSION,
          result: cached.result,
          cachedFromId: cached.id,
        });
        return {
          analysisId: cachedRecord.id,
          cached: true,
          provider: provider.provider,
          model: provider.model,
        };
      }
    }

    if (provider.provider !== "local") {
      const usage = this.database.getAiUsage(provider.dailyRequestLimit);
      if (usage.todayRemoteCalls >= provider.dailyRequestLimit) {
        throw new Error(
          `今日远程 AI 调用已达到上限 ${provider.dailyRequestLimit} 次，请明天再试或调整上限`,
        );
      }
    }

    const run = this.database.createAiAnalysis({
      jobId,
      status: "running",
      provider: provider.provider,
      model: provider.model,
      cacheKey,
      inputHash,
      promptVersion: AI_PROMPT_VERSION,
      schemaVersion: AI_SCHEMA_VERSION,
    });
    context.reportProgress(3);

    try {
      const workerResult = await this.runWorker(
        {
          type: "start",
          context: jobContext,
          provider: {
            kind: provider.provider,
            baseUrl: provider.baseUrl,
            model: provider.model,
            apiKey: provider.apiKey,
          },
          promptVersion: AI_PROMPT_VERSION,
          schemaVersion: AI_SCHEMA_VERSION,
        },
        context,
      );
      const validated = validateAiAnalysis(workerResult.analysis, jobContext);
      this.database.completeAiAnalysis(run.id, {
        result: validated,
        latencyMs: workerResult.latencyMs,
        promptTokens: workerResult.promptTokens,
        completionTokens: workerResult.completionTokens,
      });
      return {
        analysisId: run.id,
        cached: false,
        provider: provider.provider,
        model: provider.model,
        latencyMs: workerResult.latencyMs,
        promptTokens: workerResult.promptTokens,
        completionTokens: workerResult.completionTokens,
      };
    } catch (error) {
      this.database.finishAiAnalysis(
        run.id,
        context.signal.aborted ? "cancelled" : "failed",
        context.signal.aborted
          ? "用户取消任务"
          : error instanceof Error
            ? error.message
            : String(error),
      );
      throw error;
    }
  }

  private runWorker(
    start: AiWorkerStart,
    context: AiRunContext,
  ): Promise<Extract<AiWorkerMessage, { type: "result" }>> {
    const worker = utilityProcess.fork(this.workerPath, [], {
      serviceName: "AI Analysis",
      stdio: "pipe",
    });
    return new Promise((resolve, reject) => {
      let settled = false;
      let lastProgress = 1;
      const timeout = setTimeout(() => {
        finishWithError(new Error("AI 分析超时，Worker 已关闭"));
      }, 3 * 60 * 1_000);
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
      const onAbort = () => finishWithError(new Error("AI 分析任务已取消"));
      context.signal.addEventListener("abort", onAbort, { once: true });
      worker.on("spawn", () => worker.postMessage(start));
      worker.on("message", (rawMessage) => {
        if (settled) return;
        const parsed = AiWorkerMessageSchema.safeParse(rawMessage);
        if (!parsed.success) {
          finishWithError(new Error("AI Worker 返回了无法识别的消息"));
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
        settled = true;
        cleanup();
        worker.kill();
        resolve(parsed.data);
      });
      worker.on("exit", (code) => {
        if (!settled) {
          finishWithError(
            new Error(`AI Worker 异常退出（代码 ${String(code)}）`),
          );
        }
      });
    });
  }
}
