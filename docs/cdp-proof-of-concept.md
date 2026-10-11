# CDP side panel proof of concept

This experimental branch is based on `main`, independently of PR #2. It is an
alternative to the synchronized snapshot architecture, not a completed migration.

## Try it

1. Build the extension with `npm ci && npm run build` and load `.output/chrome-mv3` in Chromium.
2. In the extension details, enable **Allow access to file URLs**.
3. Open a local SugarCube story, then click the extension action to open the side panel.
4. Click **Connect**. Chrome shows a debugger warning while the session is attached.
5. Expand **story** and **temporary**, then expand nested remote objects. Functions, accessor descriptors, non-enumerable properties, Map/Set internals, and private-property descriptors are available through CDP where the runtime reports them.
6. Click **Refresh variables** to discard the old remote handles and reread the roots. This is manual in the proof of concept.
7. Click **Disconnect**, open Chrome DevTools, close it, then click **Connect** again.

Opening DevTools without disconnecting will usually make Chrome detach the extension's
debugger automatically; the side panel should then unmount live objects and explain why.

## Boundaries

- The CDP backend runs in the background service worker. The side panel receives only
  CDP-provided serializable descriptions and opaque remote object IDs, never cloned game objects.
- The existing content-script drawer and bridge remain in the branch for comparison and
  compatibility with existing tests. **This is not yet a full replacement.**
- This proof of concept is read-only: editing, favorites, automatic watch polling,
  breakpoints, persistence across reloads, and pagination beyond the first 200
  displayed properties are deliberately deferred.
- Remote object handles are valid only for the active debugging session and revision.
  Manual refresh, page navigation, and detach invalidate them.
- The `debugger` and `tabs` permissions are powerful. The UI requires an explicit
  Connect action; the service also verifies a `file://` target before attaching.
- DevTools and this extension generally cannot own the tab's debugger simultaneously.
  The user must close DevTools before clicking Connect again.

This branch is intended to confirm that native CDP property inspection behaves well
with real SugarCube games before replacing the existing inspector UI.
