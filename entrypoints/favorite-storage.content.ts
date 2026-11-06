import { browser } from "wxt/browser";
import { decodeFavoritePaths, favoriteStorageEvents as events, getFavoriteStoragePrefix } from "@/src/variables/favoriteStorage";

export default defineContentScript({
  matches: ["file:///*"],
  world: "ISOLATED",
  runAt: "document_idle",

  main(ctx) {
    const prefix = getFavoriteStoragePrefix();
    if (!prefix) return;

    document.addEventListener(events.load, () => {
      void browser.storage.local.get(null).then((stored) => {
        const paths = Object.entries(stored).filter(([key]) => key.startsWith(prefix)).map(([, path]) => path);
        document.dispatchEvent(new CustomEvent(events.loaded, { detail: JSON.stringify(paths) }));
      }).catch(() => console.warn("SugarCube Inspector could not load favorites."));
    }, { signal: ctx.signal });

    function update(event: Event) {
      const detail = (event as CustomEvent<unknown>).detail;
      if (typeof detail !== "string" || detail.length > 64_000) return;
      const paths = decodeFavoritePaths(detail);
      if (paths?.length !== 1) return;
      const [path] = paths;
      // Each pin has its own key so tabs can update different pins independently.
      const key = prefix + JSON.stringify(path);
      const saved = event.type === events.pin
        ? browser.storage.local.set({ [key]: path }) : browser.storage.local.remove(key);
      void saved.catch(() => console.warn("SugarCube Inspector could not save a favorite."));
    }

    document.addEventListener(events.pin, update, { signal: ctx.signal });
    document.addEventListener(events.unpin, update, { signal: ctx.signal });
    document.dispatchEvent(new Event(events.ready));
  },
});
