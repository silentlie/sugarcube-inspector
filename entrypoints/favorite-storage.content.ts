import { browser } from "wxt/browser";
import { favoriteStorageEvents as events, getFavoriteStoragePrefix } from "@/src/variables/favoriteStorage";

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

    document.dispatchEvent(new Event(events.ready));
  },
});
