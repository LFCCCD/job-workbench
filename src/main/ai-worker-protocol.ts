import { z } from "zod";
import {
  AiAnalysisResultSchema,
  AiProviderKindSchema,
  JobStatusSchema,
} from "../shared/contracts";

export const AiWorkerStartSchema = z.object({
  type: z.literal("start"),
  context: z.object({
    job: z.object({
      id: z.string(),
      title: z.string(),
      company: z.string(),
      salary: z.string(),
      city: z.string(),
      district: z.string(),
      experience: z.string(),
      degree: z.string(),
      category: z.string(),
      description: z.string(),
      link: z.string(),
      score: z.number(),
      status: JobStatusSchema,
      favorite: z.boolean(),
      notes: z.string(),
      archivedAt: z.string().nullable(),
      createdAt: z.string(),
      updatedAt: z.string(),
    }),
    facts: z.array(
      z.object({
        id: z.string(),
        kind: z.string(),
        title: z.string(),
        organization: z.string(),
        role: z.string(),
        startDate: z.string(),
        endDate: z.string(),
        location: z.string(),
        bullets: z.array(z.string()),
        skills: z.array(z.string()),
        evidence: z.string(),
      }),
    ),
    resumeVersions: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        targetRole: z.string(),
        summary: z.string(),
        selectedFactIds: z.array(z.string()),
      }),
    ),
    factsVersion: z.string(),
  }),
  provider: z.object({
    kind: AiProviderKindSchema,
    baseUrl: z.string(),
    model: z.string(),
    apiKey: z.string(),
  }),
  promptVersion: z.number().int().positive(),
  schemaVersion: z.number().int().positive(),
});

export const AiWorkerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("progress"),
    progress: z.number().min(0).max(100),
    message: z.string().max(500),
  }),
  z.object({
    type: z.literal("result"),
    analysis: AiAnalysisResultSchema,
    latencyMs: z.number().min(0),
    promptTokens: z.number().int().min(0),
    completionTokens: z.number().int().min(0),
  }),
  z.object({
    type: z.literal("error"),
    error: z.string().min(1).max(4_000),
  }),
]);

export type AiWorkerStart = z.infer<typeof AiWorkerStartSchema>;
export type AiWorkerMessage = z.infer<typeof AiWorkerMessageSchema>;
