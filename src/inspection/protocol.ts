import { z } from "zod";

const indexSchema = z.number().int().nonnegative();

export const SegmentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("property"), key: z.string() }),
  z.object({ kind: z.literal("symbol"), index: indexSchema }),
  z.object({ kind: z.literal("mapKey"), index: indexSchema }),
  z.object({ kind: z.literal("mapValue"), index: indexSchema }),
  z.object({ kind: z.literal("setValue"), index: indexSchema }),
]);

export const PathSchema = z.object({
  root: z.enum(["story", "temporary"]),
  segments: z.array(SegmentSchema),
});

export const TargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("path"), path: PathSchema }),
  z.object({
    kind: z.literal("remote"),
    sessionId: z.string(),
    objectId: z.string(),
  }),
]);

export const StatusRequestSchema = z.object({
  tabId: indexSchema.optional(),
});

export const TabRequestSchema = z.object({
  tabId: indexSchema,
});

export const InspectRequestSchema = z.object({
  target: TargetSchema,
  offset: indexSchema.max(100_000),
});

export type Scope = z.infer<typeof PathSchema>["root"];
export type Segment = z.infer<typeof SegmentSchema>;
export type Path = z.infer<typeof PathSchema>;
export type Target = z.infer<typeof TargetSchema>;
export type StatusRequest = z.infer<typeof StatusRequestSchema>;
export type TabRequest = z.infer<typeof TabRequestSchema>;
export type InspectRequest = z.infer<typeof InspectRequestSchema>;

export type InspectorMode =
  | { mode: "main" }
  | { mode: "cdp"; sessionId: string };

export type Entry = {
  name: string;
  preview: string;
  expandable: boolean;
  target?: Target;
  nonEnumerable?: boolean;
  category?: "own" | "internal" | "private";
};

export type Inspection = { entries: Entry[]; total: number; offset: number };
