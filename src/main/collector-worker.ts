import {
  collectBossCandidates,
  collectBossDetailBackfill,
  BossStopError,
} from "./boss-collector";
import {
  CollectorWorkerStartSchema,
  DetailBackfillStartSchema,
  type CollectorWorkerMessage,
} from "./collector-protocol";

type UtilityParentPort = {
  on(
    event: "message",
    listener: (event: { data?: unknown } | unknown) => void,
  ): void;
  postMessage(message: CollectorWorkerMessage): void;
};

const parentPort = (
  process as NodeJS.Process & { parentPort?: UtilityParentPort }
).parentPort;

if (!parentPort) {
  throw new Error("Collector Worker 必须由 Electron utilityProcess 启动");
}

const abortController = new AbortController();

function send(message: CollectorWorkerMessage) {
  parentPort?.postMessage(message);
}

async function run(rawMessage: unknown) {
  if (
    rawMessage &&
    typeof rawMessage === "object" &&
    "type" in rawMessage &&
    rawMessage.type === "backfill"
  ) {
    const start = DetailBackfillStartSchema.parse(rawMessage);
    const result = await collectBossDetailBackfill({
      targets: start.targets,
      requestDelayMs: start.requestDelayMs,
      signal: abortController.signal,
      progress: (progress, message) => {
        send({ type: "progress", progress, message });
      },
    });
    send({ type: "backfill-result", ...result });
    return;
  }
  const start = CollectorWorkerStartSchema.parse(rawMessage);
  const result = await collectBossCandidates({
    request: start.request,
    cache: start.cache,
    signal: abortController.signal,
    progress: (progress, message) => {
      send({ type: "progress", progress, message });
    },
  });
  send({ type: "result", ...result });
}

parentPort.on("message", (event) => {
  const data =
    event && typeof event === "object" && "data" in event
      ? (event as { data: unknown }).data
      : event;
  void run(data).catch((error) => {
    const message =
      error instanceof BossStopError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    send({ type: "error", error: message });
  });
});

process.on("SIGTERM", () => abortController.abort());
process.on("SIGINT", () => abortController.abort());
