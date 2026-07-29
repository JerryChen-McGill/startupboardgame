import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(testDirectory, "..");
const appSource = fs.readFileSync(path.join(rootDirectory, "app.js"), "utf8");
const htmlSource = fs.readFileSync(path.join(rootDirectory, "index.html"), "utf8");
const cssSource = fs.readFileSync(path.join(rootDirectory, "styles.css"), "utf8");
const data = JSON.parse(fs.readFileSync(path.join(rootDirectory, "data", "game-data.json"), "utf8"));

test("relationship workbench exposes all forty cards instead of the twenty-card subset", () => {
  const totalCards = Object.values(data.cards).flat().length;
  assert.equal(totalCards, 40);
  assert.match(appSource, /function relationshipMapCards\(type\)\s*{\s*return gameData\.cards\[type\];\s*}/);
  assert.match(htmlSource, /id="network-card-count">40 张卡/);
});

test("unconfirmed and confirmed objects have distinct dashed and solid styles", () => {
  assert.match(appSource, /card\.confirmed = Boolean\(card\.confirmed\)/);
  assert.match(appSource, /relation\.confirmed = Boolean\(relation\.confirmed\)/);
  assert.match(cssSource, /\.network-node rect[\s\S]*stroke-dasharray:\s*7 5/);
  assert.match(cssSource, /\.network-node\.is-confirmed rect[\s\S]*stroke-dasharray:\s*none/);
  assert.match(cssSource, /\.relation-path[\s\S]*stroke-dasharray:\s*7 8/);
  assert.match(cssSource, /\.relation-path\.is-confirmed[\s\S]*stroke-dasharray:\s*none/);
});

test("editor supports both entities, local drafts, audit history, and separate exports", () => {
  [
    'id="card-editor-form"',
    'id="relation-editor-form"',
    'id="toggle-card-confirmation"',
    'id="toggle-relation-confirmation"',
    'id="export-game-json"',
    'id="export-change-log"',
    'id="change-log-preview"',
  ].forEach((marker) => assert.ok(htmlSource.includes(marker), `missing ${marker}`));
  assert.match(appSource, /const EDITOR_STORAGE_KEY = "startup-boardgame-relationship-editor-v1"/);
  assert.match(appSource, /function recordEditorChange\(/);
  assert.match(appSource, /function exportEditedGameData\(/);
  assert.match(appSource, /function exportEditorChangeLog\(/);
  assert.match(appSource, /JSON\.stringify\(value, null, 2\)/);
});
