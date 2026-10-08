import { z } from "zod";
import type { SerializedValue } from "./serialize";

const SerializedValueSchema = z.custom<SerializedValue>(
  (value) => Array.isArray(value) && value.length > 0,
);

export const SugarCubeSnapshotSchema = z.object({
  story: z.object({
    name: z.string(),
    ifId: z.string(),
    version: z.string().optional(),
  }),

  passage: z.object({
    name: z.string(),
    tags: z.array(z.string()),
  }),

  history: z.object({
    turns: z.number().int().nonnegative(),
    length: z.number().int().nonnegative(),
  }),

  variables: z.object({
    story: SerializedValueSchema,
    temporary: SerializedValueSchema,
  }),

  capturedAt: z.number(),
});

export type SugarCubeSnapshot = z.infer<typeof SugarCubeSnapshotSchema>;
