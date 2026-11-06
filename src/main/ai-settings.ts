import fs from "node:fs";
import path from "node:path";
import { safeStorage } from "electron";
import {
  AiSettingsInputSchema,
  type AiProviderKind,
  type AiSettingsInput,
  type AiSettingsView,
} from "../shared/contracts";
import { JobDatabase } from "./database";

type StoredAiSettings = {
  provider: AiProviderKind;
  baseUrl: string;
  model: string;
  dailyRequestLimit: number;
};

const DEFAULT_SETTINGS: StoredAiSettings = {
  provider: "local",
  baseUrl: "",
  model: "local-rules-v1",
  dailyRequestLimit: 20,
};

const PROVIDER_DEFAULTS: Record<
  "deepseek" | "dashscope",
  { baseUrl: string; model: string }
> = {
  deepseek: {
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
  },
  dashscope: {
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
  },
};

function validateProviderSettings(
  input: AiSettingsInput,
): StoredAiSettings {
  let baseUrl = input.baseUrl.trim();
  let model = input.model.trim();
  if (input.provider === "local") {
    baseUrl = "";
    model = "local-rules-v1";
  } else if (input.provider === "deepseek" || input.provider === "dashscope") {
    const defaults = PROVIDER_DEFAULTS[input.provider];
    baseUrl = baseUrl || defaults.baseUrl;
    model = model || defaults.model;
  }
  if (input.provider !== "local") {
    if (!model) throw new Error("AI 模型名称不能为空");
    let url: URL;
    try {
      url = new URL(baseUrl);
    } catch {
      throw new Error("AI Provider 地址无效");
    }
    const localHttp =
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(url.hostname);
    if (url.protocol !== "https:" && !localHttp) {
      throw new Error("AI Provider 地址必须使用 HTTPS，本机调试可使用 localhost");
    }
    if (url.username || url.password) {
      throw new Error("AI Provider 地址不能包含用户名或密码");
    }
  }
  return {
    provider: input.provider,
    baseUrl,
    model,
    dailyRequestLimit: input.dailyRequestLimit,
  };
}

export class AiSettingsService {
  private readonly credentialPath: string;

  constructor(
    private readonly database: JobDatabase,
    userDataDir: string,
  ) {
    this.credentialPath = path.join(
      userDataDir,
      "secrets",
      "ai-provider-key.bin",
    );
  }

  async getView(): Promise<AiSettingsView> {
    const settings = this.getStoredSettings();
    return {
      ...settings,
      hasApiKey: fs.existsSync(this.credentialPath),
      encryptionAvailable: await safeStorage.isAsyncEncryptionAvailable(),
    };
  }

  async save(input: AiSettingsInput): Promise<AiSettingsView> {
    const parsed = AiSettingsInputSchema.parse(input);
    const settings = validateProviderSettings(parsed);
    if (parsed.apiKey?.trim()) {
      await this.saveApiKey(parsed.apiKey.trim());
    }
    this.database.setAppSetting("ai.settings", JSON.stringify(settings));
    return this.getView();
  }

  clearApiKey(): void {
    if (fs.existsSync(this.credentialPath)) {
      fs.rmSync(this.credentialPath);
    }
  }

  async getRuntimeConfig(): Promise<
    StoredAiSettings & { apiKey: string }
  > {
    const settings = this.getStoredSettings();
    const apiKey =
      settings.provider === "local" ? "" : await this.loadApiKey();
    if (settings.provider !== "local" && !apiKey) {
      throw new Error("请先保存当前 AI Provider 的 API Key");
    }
    return { ...settings, apiKey };
  }

  private getStoredSettings(): StoredAiSettings {
    const raw = this.database.getAppSetting("ai.settings");
    if (!raw) return DEFAULT_SETTINGS;
    try {
      const parsed = JSON.parse(raw) as Partial<StoredAiSettings>;
      return {
        provider:
          parsed.provider &&
          ["local", "deepseek", "dashscope", "custom"].includes(parsed.provider)
            ? parsed.provider
            : "local",
        baseUrl:
          typeof parsed.baseUrl === "string"
            ? parsed.baseUrl
            : DEFAULT_SETTINGS.baseUrl,
        model:
          typeof parsed.model === "string"
            ? parsed.model
            : DEFAULT_SETTINGS.model,
        dailyRequestLimit:
          typeof parsed.dailyRequestLimit === "number"
            ? Math.max(1, Math.min(100, Math.trunc(parsed.dailyRequestLimit)))
            : DEFAULT_SETTINGS.dailyRequestLimit,
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  private async saveApiKey(apiKey: string) {
    if (!(await safeStorage.isAsyncEncryptionAvailable())) {
      throw new Error("当前系统无法使用安全凭据存储，API Key 未保存");
    }
    const encrypted = await safeStorage.encryptStringAsync(apiKey);
    fs.mkdirSync(path.dirname(this.credentialPath), { recursive: true });
    const temporaryPath = `${this.credentialPath}.tmp`;
    fs.writeFileSync(temporaryPath, encrypted, { mode: 0o600 });
    fs.renameSync(temporaryPath, this.credentialPath);
  }

  private async loadApiKey(): Promise<string> {
    if (!fs.existsSync(this.credentialPath)) return "";
    if (!(await safeStorage.isAsyncEncryptionAvailable())) return "";
    try {
      const result = await safeStorage.decryptStringAsync(
        fs.readFileSync(this.credentialPath),
      );
      if (result.shouldReEncrypt) {
        await this.saveApiKey(result.result);
      }
      return result.result;
    } catch {
      return "";
    }
  }
}
