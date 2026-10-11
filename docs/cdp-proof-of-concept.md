# CDP side panel proof of concept

This experimental branch is based on `main`, independently of PR #2.
**There is no snapshot fallback and no page-mounted drawer or MAIN-world bridge.**
Only an established Chrome debugger session mounts the inspector's variable tree.

## Try it

1. Run `npm ci && npm run build` and load `.output/chrome-mv3` as an unpacked Chromium extension.
2. In extension Details, enable **Allow access to file URLs**.
3. Open a local SugarCube game and click the extension icon to open its side panel.
4. Click **Connect**. Chrome displays a debugger warning while the tab is attached.
5. Expand **story** and **temporary**, then their nested properties. Data is requested from the live runtime via CDP.
6. Click **Refresh variables** to discard old handles and construct a new live tree.
7. Click **Disconnect** to immediately unmount the tree and detach the debugger. Open DevTools, then close DevTools and click **Connect** to establish a new session.

If DevTools opens while connected, Chrome detaches the debugger. The tree unmounts and the side panel shows a reconnect prompt. Disconnection does not close the side panel.

## Scope and limitations

- The background owns debugger attachments and object groups. The side panel receives CDP property descriptions and opaque remote handles, not snapshot clones.
- The inspector UI exists **only** while the side panel has a valid connected session. On disconnect, detach, context destruction, or tab change, the remote tree is unmounted. Reconnect obtains new handles.
- Read-only prototype: no value editing, automatic watches, breakpoints, pagination beyond 200 displayed properties, or persistence of expansion/favorites.
- Accessor descriptors are displayed without intentionally invoking getters; some debugger operations and runtime evaluations can still execute JavaScript.
- Private/internal properties and Map/Set internal slots appear where Chrome's Runtime domain exposes them.
- `debugger` and `tabs` permissions are required. We never silently attach.
- Chrome DevTools and the extension generally cannot inspect the same tab at once. Manual Disconnect/Connect is the supported workflow.

The CDP-specific behavior still needs manual validation against a real SugarCube game. The automated browser smoke test verifies no drawer/content script loads; unit tests cover connection gating, detach, and tree teardown.
