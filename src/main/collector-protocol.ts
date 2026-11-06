import { z } from "zod";
import {
  CollectorCacheEntrySchema,
  CollectorCandidateSchema,
  CollectorRequestSchema,
} from "../shared/contracts";

export const CollectorWorkerStartSchema = z.object({
  type: z.literal("start"),
  request: CollectorRequestSchema,
  cache: z.array(CollectorCacheEntrySchema).max(100),
});

export const CollectorWorkerProgressSchema = z.object({
  type: z.literal("progress"),
  progress: z.number().min(0).max(100),
  message: z.string().max(500).default(""),
});

export const CollectorWorkerResultSchema = z.object({
  type: z.literal("result"),
  candidates: z.array(CollectorCandidateSchema).max(1_000),
  cacheEntries: z.array(CollectorCacheEntrySchema).max(100),
  warnings: z.array(z.string().max(1_000)).max(100),
});

export const CollectorWorkerErrorSchema = z.object({
  type: z.literal("error"),
  error: z.string().min(1).max(4_000),
});

export const CollectorWorkerMessageSchema = z.discriminatedUnion("type", [
  CollectorWorkerProgressSchema,
  CollectorWorkerResultSchema,
  CollectorWorkerErrorSchema,
]);

export type CollectorWorkerStart = z.infer<typeof CollectorWorkerStartSchema>;
export type CollectorWorkerMessage = z.infer<
  typeof CollectorWorkerMessageSchema
>;
