export type DrawerPreferences = { mode: "hover" | "click"; width: number; tabTop: number };
export const drawerPreferencesKey = "drawerPreferences";
export const drawerPreferenceEvents = {
  ready: "sugarcube-inspector:drawer-ready",
  load: "sugarcube-inspector:drawer-load",
  loaded: "sugarcube-inspector:drawer-loaded",
  save: "sugarcube-inspector:drawer-save",
} as const;

export function decodeDrawerPreferences(detail: unknown): DrawerPreferences | undefined {
  if (typeof detail !== "string" || detail.length > 1000) return;
  try {
    const value: unknown = JSON.parse(detail);
    if (!value || typeof value !== "object") return;
    const { mode, width, tabTop } = value as Record<string, unknown>;
    if ((mode !== "hover" && mode !== "click") || typeof width !== "number" || !Number.isFinite(width) || width < 0 ||
        typeof tabTop !== "number" || !Number.isFinite(tabTop) || tabTop < 0) return;
    return { mode, width, tabTop };
  } catch { return; }
}
