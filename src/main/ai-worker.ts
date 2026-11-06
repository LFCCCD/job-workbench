import {
  analyzeWithLocalRules,
  buildAiPrompt,
  callOpenAiCompatible,
  validateAiAnalysis,
} from "./ai-analysis";
import {
  AiWorkerStartSchema,
  type AiWorkerMessage,
} from "./ai-worker-protocol";

type UtilityParentPort = {
  on(
    event: "message",
    listener: (event: { data?: unknown } | unknown) => void,
  ): void;
  postMessage(message: AiWorkerMessage): void;
};

const parentPort = (
  process as NodeJS.Process & { parentPort?: UtilityParentPort }
).parentPort;

if (!parentPort) {
  throw new Error("AI Worker 必须由 Electron utilityProcess 启动");
}

const abortController = new AbortController();

function send(message: AiWorkerMessage) {
  parentPort?.postMessage(message);
}

async function run(rawMessage: unknown) {
  const start = AiWorkerStartSchema.parse(rawMessage);
  send({ type: "progress", progress: 10, message: "正在准备岗位和事实输入" });
  const startedAt = Date.now();
  if (start.provider.kind === "local") {
    send({ type: "progress", progress: 45, message: "正在执行本地证据分析" });
    const analysis = validateAiAnalysis(
      analyzeWithLocalRules(start.context),
      start.context,
    );
    send({
      type: "result",
      analysis,
      latencyMs: Date.now() - startedAt,
      promptTokens: 0,
      completionTokens: 0,
    });
    return;
  }
  if (!start.provider.apiKey) {
    throw new Error("尚未配置 AI Provider API Key");
  }
  send({ type: "progress", progress: 25, message: "正在请求 AI Provider" });
  const response = await callOpenAiCompatible({
    baseUrl: start.provider.baseUrl,
    model: start.provider.model,
    apiKey: start.provider.apiKey,
    prompt: buildAiPrompt(start.context),
    signal: abortController.signal,
  });
  send({ type: "progress", progress: 80, message: "正在校验事实与 JD 引用" });
  const analysis = validateAiAnalysis(response.result, start.context);
  send({
    type: "result",
    analysis,
    latencyMs: Date.now() - startedAt,
    promptTokens: response.promptTokens,
    completionTokens: response.completionTokens,
  });
}

parentPort.on("message", (event) => {
  const data =
    event && typeof event === "object" && "data" in event
      ? (event as { data: unknown }).data
      : event;
  void run(data).catch((error) => {
    send({
      type: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  });
});

process.on("SIGTERM", () => abortController.abort());
process.on("SIGINT", () => abortController.abort());
