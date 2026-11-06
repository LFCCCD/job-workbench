import type { OperationResult, TaskRecord, TaskStatus } from "../shared/contracts";
import { CollectorRequestSchema } from "../shared/contracts";
import type { CollectorService } from "./collector-service";
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
