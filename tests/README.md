# Testing SugarCube Inspector

Run the following checks from the repository root:

```sh
npm ci
npm run lint
npm run compile
npm test
npm run test:browser
```

Unit and integration tests exercise direct variable inspection and tree behavior. Playwright browser tests build the Chromium extension and exercise its MAIN-world drawer against a SugarCube story fixture.

The optional performance benchmark is run separately with `npm run benchmark:lifecycle`; see `docs/inspection-lifecycle-cost.md` for methodology and limitations.

This feature uses direct MAIN-world access; CDP attachment and dual-mode inspection belong to earlier experiments and are not part of this implementation.
