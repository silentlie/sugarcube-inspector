import type {
  SugarCubeStoryVariables,
  SugarCubeTemporaryVariables,
} from "twine-sugarcube";
import { z } from "zod";
import { isArray } from "@sindresorhus/is";
import { isNonFunctionObject } from "../utils/isNonFunctionObject";

const isVariableContainer = (value: unknown): value is object =>
  isNonFunctionObject(value) && !isArray(value);

const StoryVariablesSchema =
  z.custom<SugarCubeStoryVariables>(isVariableContainer);

const TemporaryVariablesSchema =
  z.custom<SugarCubeTemporaryVariables>(isVariableContainer);

export const SugarCubeVariablesSchema = z.object({
  story: StoryVariablesSchema,
  temporary: TemporaryVariablesSchema,
});

export type SugarCubeVariables = z.infer<typeof SugarCubeVariablesSchema>;

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

  variables: SugarCubeVariablesSchema,

  capturedAt: z.number(),
  /** MAIN-world watch baseline generation. */
  watchGeneration: z.number().int().nonnegative().optional(),
});

export type SugarCubeSnapshot = z.infer<typeof SugarCubeSnapshotSchema>;
