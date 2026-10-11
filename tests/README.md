# DevTools proof-of-concept tests

`npm test` covers native sidebar registration, use of live expressions,
refresh on sidebar selection and navigation, and the dashboard's refresh
behavior. The extension does not copy SugarCube variable graphs.

`npm run test:browser` builds the extension, generates a real SugarCube
2.37.3 HTML story, and checks the manifest includes a DevTools page but
does not request `debugger` permission, register injected content scripts,
or mount a page inspector.

The automated browser test cannot confirm how the native DevTools Elements
sidebar renders complex game objects. Manually load the extension into Chromium,
open a local SugarCube story and DevTools, then confirm both native SugarCube
sidebars show live values. Edit a variable in the Console, and refresh the
sidebar. No debugger warning should appear.

The pinned SugarCube runtime is checked against its SHA-256 checksum in
`tests/browser/prepare-story.mjs`.
