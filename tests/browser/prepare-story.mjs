import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const version = "2.37.3";
const checksum = "64ccdac806a162d250273aba3c39aee85765fedab4cf70e6176154a8c34b8820";
const formatUrl = `https://raw.githubusercontent.com/tmedwards/sugarcube-2/v${version}/dist/format.js`;
const cacheDirectory = new URL(".cache/", import.meta.url);
const generatedDirectory = new URL(".generated/", import.meta.url);
const cacheFile = new URL(`sugarcube-${version}-format.js`, cacheDirectory);

let formatText;
try {
  formatText = await readFile(cacheFile, "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  const response = await fetch(formatUrl, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`SugarCube download failed: HTTP ${response.status}`);
  formatText = await response.text();
}

if (createHash("sha256").update(formatText).digest("hex") !== checksum) {
  throw new Error("SugarCube story format checksum mismatch.");
}

const format = JSON.parse(formatText.trim().replace(/^window\.storyFormat\(/, "").replace(/\);?$/, ""));
if (format.name !== "SugarCube" || format.version !== version ||
    !format.source.includes("{{STORY_DATA}}") || !format.source.includes("{{STORY_NAME}}")) {
  throw new Error("Unexpected SugarCube story format.");
}

await mkdir(cacheDirectory, { recursive: true });
await writeFile(cacheFile, formatText);
const storyData = await readFile(new URL("fixtures/story-data.html", import.meta.url), "utf8");
const story = format.source
  .replaceAll("{{STORY_NAME}}", "Inspector Smoke Story")
  .replace("{{STORY_DATA}}", storyData);

await mkdir(generatedDirectory, { recursive: true });
await writeFile(new URL("story.html", generatedDirectory), story);
console.log(`Prepared smoke story with verified SugarCube ${version}.`);
