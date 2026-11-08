# Testing SugarCube Inspector

Run the following checks from the repository root:

```sh
npm ci
npm run lint
npm run compile
npm test
npm run test:browser
```

See the [coverage review](coverage-review.md) for the behaviors covered, the focused restoration/relay tests, and reasons additional tests are deliberately skipped.

Unit and integration tests exercise direct variable inspection and tree behavior. Playwright browser tests build the Chromium extension and exercise its MAIN-world drawer against a SugarCube story fixture.

This feature uses direct MAIN-world access; CDP attachment and dual-mode inspection belong to earlier experiments and are not part of this implementation.
