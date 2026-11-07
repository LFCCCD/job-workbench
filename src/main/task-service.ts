import type { OperationResult, TaskRecord, TaskStatus } from "../shared/contracts";
import {
  AiAnalyzeRequestSchema,
  CollectorRequestSchema,
  DetailBackfillRequestSchema,
} from "../shared/contracts";
import type { AiAnalysisService } from "./ai-service";
import type { CollectorService } from "./collector-service";
import type { DetailBackfillService } from "./detail-backfill-service";
import { JobDatabase } from "./database";

type TaskHandlerContext = {
  taskId: string;
  signal: AbortSignal;
  reportProgress(progress: number): void;
};

type TaskHandler = (
  payload: Record<string, unknown>,
  context: TaskHandlerContext,
) => Promise<Record<string, unknown>>;

export class TaskService {
  private readonly handlers = new Map<string, TaskHandler>();
  private readonly running = new Map<string, AbortController>();

  constructor(
    private readonly database: JobDatabase,
    private readonly collector: CollectorService | null = null,
    private readonly ai: AiAnalysisService | null = null,
    private readonly detailBackfill: DetailBackfillService | null = null,
  ) {
    this.handlers.set("backup", async () => {
      const path = await this.database.createBackup("scheduled");
      return { path };
    });
    if (this.collector) {
      this.handlers.set("collector", async (payload, context) => {
        const request = CollectorRequestSchema.parse(payload);
        const collected = await this.collector!.run(request, context);
        const staged = this.database.stageCollectorCandidates(
          context.taskId,
          collected.candidates,
        );
        return {
          captured: collected.candidates.length,
          addedToPreview: staged.addedToPreview,
          refreshedInPreview: staged.refreshedInPreview,
          existingInJobPool: staged.existingInJobPool,
          cachedSearches: collected.cachedSearches,
          warnings: collected.warnings,
        };
      });
    }
    if (this.ai) {
      this.handlers.set("ai-analysis", async (payload, context) => {
        const request = AiAnalyzeRequestSchema.parse(payload);
        return this.ai!.analyzeJob(request.jobId, request.force, context);
      });
    }
    if (this.detailBackfill) {
      this.handlers.set("detail-backfill", async (payload, context) => {
        const request = DetailBackfillRequestSchema.parse(payload);
        const targets = this.database.getDetailBackfillTargets(
          request.scope,
          request.batchSize,
        );
        if (!targets.length) {
          return {
            targets: 0,
            succeeded: 0,
            failed: 0,
            updatedCandidates: 0,
            updatedJobs: 0,
            warnings: [],
          };
        }
        const result = await this.detailBackfill!.run(
          targets,
          request.requestDelayMs,
          context,
        );
        const applied = this.database.applyDetailBackfillResults(
          result.details,
        );
        const succeeded = result.details.filter(
          (detail) => detail.success,
        ).length;
        return {
          targets: targets.length,
          succeeded,
          failed: targets.length - succeeded,
          updatedCandidates: applied.updatedCandidates,
          updatedJobs: applied.updatedJobs,
          warnings: result.warnings,
        };
      });
    }
  }

  resumeQueuedTasks() {
    for (const task of this.database.listTasks("queued")) {
      void this.runTask(task.id);
    }
  }

  listTasks(): TaskRecord[] {
    return this.database.listTasks();
  }

  enqueue(
    type: string,
    payload: Record<string, unknown> = {},
    idempotencyKey: string | null = null,
  ): TaskRecord {
    const task = this.database.createTask(type, payload, idempotencyKey);
    if (task.status === "queued") {
      queueMicrotask(() => void this.runTask(task.id));
    }
    return task;
  }

  cancel(id: string): TaskRecord {
    const task = this.database.getTask(id);
    if (!task) throw new Error("任务不存在");
    if (!["queued", "running"].includes(task.status)) {
      return task;
    }
    this.running.get(id)?.abort();
    return this.database.updateTask(id, {
      status: "cancelled",
      error: "用户取消任务",
    });
  }

  retry(id: string): TaskRecord {
    const task = this.database.getTask(id);
    if (!task) throw new Error("任务不存在");
    if (!["failed", "cancelled", "interrupted"].includes(task.status)) {
      throw new Error("只有未成功任务可以重试");
    }
    const retried = this.database.createTask(task.type, task.payload);
    this.database.updateTask(retried.id, {
      attempts: task.attempts + 1,
    });
    queueMicrotask(() => void this.runTask(retried.id));
    return this.database.getTask(retried.id)!;
  }

  clearFinished(): OperationResult {
    const count = this.database.clearFinishedTasks();
    return { ok: true, message: `已清理 ${count} 个任务记录` };
  }

  shutdown() {
    for (const controller of this.running.values()) {
      controller.abort();
    }
    this.running.clear();
  }

  private async runTask(id: string) {
    if (this.running.has(id)) return;
    const task = this.database.getTask(id);
    if (!task || task.status !== "queued") return;

    const handler = this.handlers.get(task.type);
    if (!handler) {
      this.database.updateTask(id, {
        status: "failed",
        error: `不支持的任务类型：${task.type}`,
      });
      return;
    }

    const controller = new AbortController();
    this.running.set(id, controller);
    this.database.updateTask(id, {
      status: "running",
      progress: 1,
      error: "",
    });

    try {
      const result = await handler(task.payload, {
        taskId: id,
        signal: controller.signal,
        reportProgress: (progress) => {
          const current = this.database.getTask(id);
          if (
            current &&
            (current.status === "running" || current.status === "queued")
          ) {
            this.database.updateTask(id, { progress });
          }
        },
      });
      if (controller.signal.aborted) return;
      this.database.updateTask(id, {
        status: "succeeded",
        progress: 100,
        result,
        error: "",
      });
    } catch (error) {
      const currentStatus = this.database.getTask(id)?.status;
      if (controller.signal.aborted || currentStatus === "cancelled") return;
      this.database.updateTask(id, {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.running.delete(id);
    }
  }
}

export const terminalTaskStatuses: TaskStatus[] = [
  "succeeded",
  "failed",
  "cancelled",
  "interrupted",
];
