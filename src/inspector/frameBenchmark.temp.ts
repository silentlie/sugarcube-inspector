/** Temporary frame-pacing benchmark variants. */
export type FrameMode = "normal" | "plain" | "noTree" | "noAnt" | "destroy";
declare global { interface Window { __scFrameBenchMode?: FrameMode } }
export function frameMode(): FrameMode { return window.__scFrameBenchMode ?? "normal"; }
