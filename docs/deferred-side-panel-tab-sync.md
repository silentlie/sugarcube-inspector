# Deferred feature: Side-panel active-tab and multi-window synchronisation

**Status:** Deferred / not implemented  
**Recorded:** 2026-10-09  
**Scope:** SugarCube Inspector's Chromium extension side panel

## Why this exists

The side panel is intended to be the extension's **global settings, active-page status and diagnostics interface**. The injected inspector drawer remains a **per-tab, per-game** view of live SugarCube state.

The current side panel (`entrypoints/sidepanel/App.tsx`) calls `detectSugarCube()` when mounted and when the user presses **Refresh**. It queries the active tab with `browser.tabs.query({ active: true, currentWindow: true })` and runs a SugarCube detection script there.

**Current limitation:** When the user switches tabs, the side panel may continue showing the previous game's information until Refresh is pressed. A global side panel can have its own UI instance in each browser window, but extension tab events are not automatically scoped to that window.

This is a future usability improvement, **not a confirmed defect in the inspector's existing RPC startup or snapshot handling**.

## Expected behaviour

1. Each Chrome window has its own side-panel UI, showing that window's currently active tab.
2. When switching between Game A and Game B in **the same window**, the panel updates to the newly active game's identity/status.
3. When a tab switches in **another window**, this window's panel does not change.
4. The panel shows a clear `not supported` / `not detected` / `checking` / `error` state as appropriate.
5. Global extension preferences remain shared across windows; live SugarCube variables and inspector state stay isolated per tab.
6. Tab-specific panel actions (for example, checking the bridge or opening the inspector) target the tab represented by **that** panel, not whichever tab happened to be active globally.

### State ownership

| Data | Intended scope |
| --- | --- |
| Global preferences (enable/disable, notifications, default layout) | Extension-wide, persisted in extension storage |
| Side-panel selection/status and pending request | Per side-panel instance / window |
| Active tab ID and active game metadata | Per window, tied to the selected tab |
| Inspector open/closed and game runtime/variables | Per tab |
| Bridge verification results | Per target tab, not global |

## Suggested implementation (when resumed)

### Identify the owning window

Resolve the side panel's owning window with `browser.windows.getCurrent()` and store its `windowId` for filtering. Verify this behaviour in the supported Chromium version and a real two-window test.

Query active tabs by explicit window ID:

```ts
const panelWindow = await browser.windows.getCurrent();
const windowId = panelWindow.id;
const [tab] = await browser.tabs.query({
  active: true,
  windowId,
});
```

**Why store `windowId`?** Chrome's `tabs.onActivated` event includes `{ tabId, windowId }` and extension listeners can hear tab changes from *other* windows too. Separate React state per panel does **not** filter browser-wide extension events.

### Subscribe to relevant browser events

- `browser.tabs.onActivated`: react only if `info.windowId === panelWindowId`; select `info.tabId` and run detection.
- `browser.tabs.onUpdated`: when the updated tab is this panel's current tab, refresh on a meaningful navigation/load status or URL change. Avoid duplicate detection loops.
- `browser.tabs.onRemoved`: if the selected tab closes, re-query the owning window's active tab and update the panel.
- Unsubscribe listeners on React effect cleanup.

Tab activation is **not** the same as switching which Chrome window has focus. Do not use the browser's globally focused window as a substitute for the panel's owning window.

### Avoid stale asynchronous results

Refactor `detectSugarCube` to take a **specific tab ID**, rather than resolving the active tab internally. Whenever the selected tab changes:

1. Set `checking` and clear the previous game's identity/status.
2. Start detection for the selected tab.
3. Before applying its result, verify that the panel is still mounted and the response belongs to the latest request and the same selected tab.
4. On restricted/unsupported URLs or injection failures, render an appropriate status rather than stale data.

A monotonic request counter/ref (or cancellation, where possible) is sufficient. Never let a delayed result from Game A overwrite Game B's state.

### Passage changes are a separate decision

SugarCube passage navigation usually changes the game state without a browser-tab navigation event. Therefore `tabs.onActivated` and `tabs.onUpdated` **alone will not keep the panel's current-passage label live**.

For an initial version, it is acceptable to update passage metadata on tab activation and manual Refresh, as long as that behaviour is understood. If live passage metadata is desired, add a scoped message/update path from the target tab's content script to its side panel. Reuse existing inspector events where appropriate, but do not assume the side panel can directly call the page-local custom-event RPC.

### Multi-window routing

Keep the side panel global in Chrome's side-panel configuration (one UI instance per window). Prefer direct tab-targeted messaging or `browser.scripting.executeScript({ target: { tabId } })` for tab-specific operations. Only send a command after confirming which window and tab it targets.

This feature does **not** require synchronising the React state of multiple side-panel instances through global storage.

## Acceptance tests

- [ ] Window 1 contains two SugarCube games: switching tabs updates only Window 1's panel.
- [ ] Windows 1 and 2 show different games; both side panels show the correct game simultaneously.
- [ ] Switching tabs in Window 1 leaves Window 2's panel unchanged, and vice versa.
- [ ] Quickly switching A -> B -> A cannot display a late B result for A.
- [ ] Navigating/reloading the active tab refreshes its detection state.
- [ ] Closing the active tab causes the panel to select the replacement active tab or show a clear empty state.
- [ ] Switching to a non-`file://` or non-SugarCube tab shows the correct unsupported/not-detected state.
- [ ] Manual Refresh always targets this panel's displayed active tab.
- [ ] Any future bridge check/inspector control addresses the correct tab, including with two windows.
- [ ] Global preference changes propagate across side panels, without sharing per-tab runtime state.
- [ ] If live passage display is implemented, changing passages updates only the appropriate window's panel.

## Implementation touchpoints

- `entrypoints/sidepanel/App.tsx`: active-tab tracking, listener setup/cleanup, request race handling, and status UI.
- Existing SugarCube detection logic: accept explicit `tabId` and distinguish failure modes.
- Tests: add tab-activation, race-condition, navigation, and multi-window coverage; prefer a real browser test for window ownership.
- Later: settings storage and bridge diagnostics should reuse the same window/tab routing policy.

## Out of scope for this deferred task

- Fixing snapshot cloning without a reproduced problem.
- Rewriting the working MAIN-world bridge initialization.
- Moving live game variables from the injected inspector drawer into the side panel.
- Automatically reinjecting or reloading pages when a connection check fails.
- Creating per-game persistent preferences without an explicit product decision.

## When to revisit

Implement when the side panel becomes a regular way to view active-game status or perform tab-specific actions, especially if users commonly keep multiple SugarCube games/tabs/windows open. Until then, the existing manual Refresh control is an acceptable interim solution.
