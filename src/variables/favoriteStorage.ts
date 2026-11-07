import type { FavoritePath } from "./location";

export const inspectorSettingsKey = "__sugarcubeInspector";

export const favoriteStorageEvents = {
  ready: "sugarcube-inspector:favorites-ready",
  load: "sugarcube-inspector:favorites-load",
  loaded: "sugarcube-inspector:favorites-loaded",
  pin: "sugarcube-inspector:favorites-pin",
  unpin: "sugarcube-inspector:favorites-unpin",
  remote: "sugarcube-inspector:favorites-remote",
} as const;

export function getFavoriteStoragePrefix(): string | undefined {
  return favoriteSyncGroup(location.href, getStoryIFID());
}

export function getStoryIFID(): string | undefined {
  const ifid = document.querySelector('tw-storydata[format="SugarCube"]')
    ?.getAttribute("ifid")?.trim().toLowerCase();
  return ifid && /^[a-z0-9-]{8,63}$/.test(ifid) ? ifid : undefined;
}

export const favoriteSyncMessage = "sugarcube-inspector:favorite-update";

export function favoriteSyncGroup(url: string, ifid: unknown): string | undefined {
  if (typeof ifid !== "string" || !/^[a-z0-9-]{8,63}$/.test(ifid)) return;
  try {
    const location = new URL(url);
    if (!["file:", "http:", "https:"].includes(location.protocol)) return;
    const origin = location.protocol === "file:" ? "file:" : location.origin;
    return `favorites:${origin}:${ifid}:`;
  } catch { return; }
}

export function decodeFavoriteUpdate(data: unknown): { detail: string; pinned: boolean } | undefined {
  if (!data || typeof data !== "object") return;
  const { detail, pinned } = data as { detail?: unknown; pinned?: unknown };
  if (typeof pinned !== "boolean" || typeof detail !== "string" || detail.length > 64_000 ||
      decodeFavoritePaths(detail)?.length !== 1) return;
  return { detail, pinned };
}

export function decodeFavoritePaths(detail: unknown): FavoritePath[] | undefined {
  if (typeof detail !== "string") return;
  let data: unknown;
  try {
    data = JSON.parse(detail);
  } catch {
    return;
  }
  return validateFavoritePaths(data);
}

export function validateFavoritePaths(data: unknown): FavoritePath[] | undefined {
  if (!Array.isArray(data)) return;
  const paths: FavoritePath[] = [];
  for (const item of data) {
    if (item === null || typeof item !== "object") return;
    const { root, path } = item as { root?: unknown; path?: unknown };
    if ((root !== "variables" && root !== "temporary") || !Array.isArray(path) ||
        !path.length || !path.every((key) => typeof key === "string") ||
        (root === "variables" && path[0] === inspectorSettingsKey)) return;
    paths.push({ root, path });
  }
  return paths;
}
