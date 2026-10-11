# Testing the DevTools proof of concept

`npm test` covers the native Elements sidebar registration and the custom
SugarCube tab's directly rendered variable tree. Tests exercise property
descriptors without executing ordinary getters, functions, cyclic objects,
Map/Set contents, symbol names, missing paths, pagination, nested expansion,
and refreshing values after changes to the inspected state.

`npm run test:browser` builds the extension, creates a real SugarCube 2.37.3
HTML story, and verifies the DevTools manifest is packaged without the
`debugger` permission, content scripts, or injected page drawer.

The browser smoke tests do not interact with the Chrome DevTools UI. Manually
open a game in Chromium, select the **SugarCube** DevTools tab, and confirm
that both Story and Temporary variable trees render there. Change a variable
in the Console, click **Refresh variables**, and confirm the new value
appears. The native Elements sidebars remain available for advanced inspection.

The pinned SugarCube runtime is verified against its SHA-256 checksum
in `tests/browser/prepare-story.mjs`.
