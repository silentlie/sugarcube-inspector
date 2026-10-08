import { z } from "zod";
import { SugarCubeSnapshotSchema } from "./types";

export const CHANNEL = "sugarcube-inspector:v1" as const;

export const InspectorMessageSchema = z.discriminatedUnion("type", [
  z.object({
    channel: z.literal(CHANNEL),
    type: z.literal("ready"),
  }),
  z.object({
    channel: z.literal(CHANNEL),
    type: z.literal("request"),
  }),
  z.object({
    channel: z.literal(CHANNEL),
    type: z.literal("snapshot"),
    data: SugarCubeSnapshotSchema,
  }),
]);

export type InspectorMessage = z.infer<typeof InspectorMessageSchema>;
