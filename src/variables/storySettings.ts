import { getState } from "../sugarcube/state";
import { inspectorSettingsKey, validateFavoritePaths } from "./favoriteStorage";
import type { FavoritePath } from "./location";

function settings(): { version: 1; favorites: FavoritePath[] } | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(getState().variables, inspectorSettingsKey);
  if (!descriptor) return;
  const value: unknown = descriptor.value;
  if (value && typeof value === "object" &&
      Object.getOwnPropertyDescriptor(value, "version")?.value === 1) {
    const favorites = validateFavoritePaths(Object.getOwnPropertyDescriptor(value, "favorites")?.value);
    if (favorites) return { version: 1, favorites };
  }
  throw new Error("The reserved inspector story variable is already in use or invalid.");
}

export function readStoryFavorites(): FavoritePath[] | undefined {
  return settings()?.favorites;
}

export function writeStoryFavorites(favorites: FavoritePath[]): void {
  settings(); // Do not overwrite an unrelated story variable using our reserved name.
  Object.defineProperty(getState().variables, inspectorSettingsKey, {
    value: { version: 1, favorites }, enumerable: true, writable: true, configurable: true,
  });
}
