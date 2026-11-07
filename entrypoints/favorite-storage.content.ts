import { browser } from "wxt/browser";
import { decodeDrawerPreferences, drawerPreferenceEvents as drawerEvents, drawerPreferencesKey } from "@/src/inspector/drawerPreferences";
import { decodeFavoriteUpdate, favoriteStorageEvents as events, favoriteSyncMessage, getFavoriteStoragePrefix, getStoryIFID } from "@/src/variables/favoriteStorage";

export default defineContentScript({
  matches: ["file:///*"],
  world: "ISOLATED",
  runAt: "document_idle",

  main(ctx) {
    if (!document.querySelector('tw-storydata[format="SugarCube"]')) return;
    document.addEventListener(drawerEvents.load, () => {
      void browser.storage.local.get(drawerPreferencesKey).then((stored) => {
        document.dispatchEvent(new CustomEvent(drawerEvents.loaded, { detail: JSON.stringify(stored[drawerPreferencesKey]) }));
      }).catch(() => console.warn("SugarCube Inspector could not load drawer preferences."));
    }, { signal: ctx.signal });
    let saving = Promise.resolve();
    document.addEventListener(drawerEvents.save, (event) => {
      const preferences = decodeDrawerPreferences((event as CustomEvent<unknown>).detail);
      if (!preferences) return;
      saving = saving.then(() => browser.storage.local.set({ [drawerPreferencesKey]: preferences }))
        .catch(() => console.warn("SugarCube Inspector could not save drawer preferences."));
    }, { signal: ctx.signal });
    document.dispatchEvent(new Event(drawerEvents.ready));
    const prefix = getFavoriteStoragePrefix();
    if (!prefix) return;

    document.addEventListener(events.load, () => {
      void browser.storage.local.get(null).then((stored) => {
        const paths = Object.entries(stored).filter(([key]) => key.startsWith(prefix)).map(([, path]) => path);
        document.dispatchEvent(new CustomEvent(events.loaded, { detail: JSON.stringify(paths) }));
      }).catch(() => console.warn("SugarCube Inspector could not load favorites."));
    }, { signal: ctx.signal });

    function send(event: Event) {
      const update = decodeFavoriteUpdate({ detail: (event as CustomEvent<unknown>).detail, pinned: event.type === events.pin });
      if (!update) return;
      void browser.runtime.sendMessage({ type: favoriteSyncMessage, ifid: getStoryIFID(), ...update })
        .catch(() => console.warn("SugarCube Inspector could not synchronize favorites."));
    }
    document.addEventListener(events.pin, send, { signal: ctx.signal });
    document.addEventListener(events.unpin, send, { signal: ctx.signal });
    const receive = (message: unknown) => {
      if (!message || typeof message !== "object") return;
      const data = message as Record<string, unknown>;
      const update = decodeFavoriteUpdate(data);
      if (data.type === favoriteSyncMessage && data.group === prefix && update) {
        document.dispatchEvent(new CustomEvent(events.remote, { detail: JSON.stringify(update) }));
      }
    };
    browser.runtime.onMessage.addListener(receive);
    ctx.onInvalidated(() => browser.runtime.onMessage.removeListener(receive));
    document.dispatchEvent(new Event(events.ready));
  },
});
