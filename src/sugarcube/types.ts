import type {
  SugarCubeStoryVariables,
  SugarCubeTemporaryVariables,
} from "twine-sugarcube";
import { z } from "zod";

const isVariableContainer = (value: unknown): value is object =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const StoryVariablesSchema =
  z.custom<SugarCubeStoryVariables>(isVariableContainer);

const TemporaryVariablesSchema =
  z.custom<SugarCubeTemporaryVariables>(isVariableContainer);

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
    story: StoryVariablesSchema,
    temporary: TemporaryVariablesSchema,
  }),

  capturedAt: z.number(),
});

export type SugarCubeSnapshot = z.infer<typeof SugarCubeSnapshotSchema>;
