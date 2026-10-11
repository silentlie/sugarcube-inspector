# Testing the CDP proof of concept

Run `npm run lint`, `npm run compile`, and `npm test` for
static analysis and unit tests. The debugger tests mock the extension APIs
to cover Connect, Disconnect, refresh, remote property descriptions, and
unexpected detach. Side-panel tests ensure the variable tree is mounted
only when connected, is unmounted on disconnect or detach, and remounts
without old expansion state on reconnection.

Run `npm run test:browser` for a real Chromium smoke test. It builds
the unpacked extension, generates a local SugarCube 2.37.3 test story,
and asserts the game loads with no injected inspector drawer or legacy
content-script declarations. The SugarCube format is downloaded once and
verified against a pinned SHA-256 checksum.

Playwright's browser smoke test does **not** exercise Chrome's debugger
attachment or normal DevTools takeover. Use the manual steps in
[the CDP proof-of-concept guide](../docs/cdp-proof-of-concept.md)
before treating the debugger workflow as validated.
