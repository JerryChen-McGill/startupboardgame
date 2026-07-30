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

test("site metrics are rendered from data rather than fixed counts", () => {
  assert.match(appSource, /function renderSiteMetrics\(/);
  assert.match(htmlSource, /data-metric="card-count"/);
  assert.match(htmlSource, /data-metric="relation-count"/);
  assert.match(htmlSource, /data-card-filter-count="all"/);
});

test("card library and relationship map use descending relation rank", () => {
  assert.match(appSource, /function rankedCards\(type\)/);
  assert.match(appSource, /function relationshipMapCards\(type\)\s*{\s*return rankedCards\(type\);/);
  assert.match(appSource, /cardDegreeById/);
});

test("card faces use Chinese type labels, unframed icons, and complete descriptions", () => {
  const cards = Object.values(data.cards).flat();
  assert.ok(cards.every((card) => card.note.trim().length > 20));
  ["用户卡", "传播卡", "需求卡", "产品卡"].forEach((label) => {
    assert.ok(appSource.includes(`"${label}"`), `missing card type label ${label}`);
  });
  assert.match(appSource, /\$\{CARD_TYPE_LABELS\[card\.type\]\}/);
  assert.match(appSource, /card\.type === "need" \|\| card\.type === "product"/);
  assert.match(cssSource, /\.card-bottomline::after\s*{[\s\S]*top:\s*0;[\s\S]*bottom:\s*auto;/);
  assert.doesNotMatch(appSource, /\$\{meta\.en\}\s*CARD/);
  assert.doesNotMatch(appSource, /class="card-emoji"[^>]*><i>/);
  assert.doesNotMatch(cssSource, /\.card-emoji i/);
});

test("ten same-bounds connector shapes are encoded and overlaid", () => {
  const shapeKeys = [
    "line",
    "square",
    "circle",
    "diamond",
    "triangle",
    "hexagon",
    "pentagon",
    "star",
    "ellipse-horizontal",
    "ellipse-vertical",
  ];
  shapeKeys.forEach((key) => assert.ok(appSource.includes(`key: "${key}"`), `missing ${key}`));
  assert.match(cssSource, /\.connector-shape\s*{[\s\S]*position:\s*absolute/);
  assert.match(cssSource, /\.connector-shape\s*{[\s\S]*inset:\s*0/);
  assert.match(cssSource, /\.card-edge\s*{[\s\S]*overflow:\s*hidden/);
});

test("connector shapes are doubled and use the requested visual styles", () => {
  assert.match(cssSource, /\.edge-right,[\s\S]*width:\s*40px;[\s\S]*height:\s*80px/);
  assert.match(cssSource, /\.edge-top,[\s\S]*width:\s*80px;[\s\S]*height:\s*40px/);

  ["line", "square", "circle", "diamond", "triangle"].forEach((key) => {
    assert.match(
      cssSource,
      new RegExp(
        `\\.connector-shape\\[data-shape="${key}"\\][\\s\\S]*?fill:\\s*none;[\\s\\S]*?stroke:\\s*#111;`,
      ),
    );
  });

  ["diamond", "triangle"].forEach((key) => {
    assert.match(
      cssSource,
      new RegExp(
        `\\.connector-shape\\[data-shape="${key}"\\][\\s\\S]*?stroke-width:\\s*1\\.3;`,
      ),
    );
  });

  ["hexagon", "pentagon", "star"].forEach((key) => {
    assert.match(
      cssSource,
      new RegExp(
        `\\.connector-shape\\[data-shape="${key}"\\][\\s\\S]*?fill:\\s*none;[\\s\\S]*?stroke:\\s*#888;[\\s\\S]*?stroke-dasharray:\\s*none;[\\s\\S]*?stroke-width:\\s*1\\.3;`,
      ),
    );
  });

  ["ellipse-horizontal", "ellipse-vertical"].forEach((key) => {
    assert.match(
      cssSource,
      new RegExp(
        `\\.connector-shape\\[data-shape="${key}"\\][\\s\\S]*?fill:\\s*none;[\\s\\S]*?stroke:\\s*#888;[\\s\\S]*?stroke-dasharray:\\s*none;`,
      ),
    );
  });
});

test("the imported workspace starts fully confirmed and without unconfirmed relations", () => {
  const cards = Object.values(data.cards).flat();
  assert.ok(cards.every((card) => card.confirmed));
  assert.ok(data.relations.every((relation) => relation.confirmed));
  assert.match(appSource, /startup-boardgame-relationship-editor-v3/);
});

test("the physical prototype section and its styles are removed", () => {
  assert.doesNotMatch(htmlSource, /PHYSICAL PROTOTYPE|id="prototype"/);
  assert.doesNotMatch(cssSource, /\.prototype(?:-|\s|\{)/);
});

test("the startup lab is removed and the rulebook uses the shared light panel", () => {
  assert.doesNotMatch(htmlSource, /STARTUP LAB|id="lab"|id="startup-result"/);
  assert.doesNotMatch(appSource, /bindStartupLab|renderStartup|STARTUP_PAIR_TYPES/);
  assert.match(htmlSource, /class="rulebook-panel"/);
  assert.match(htmlSource, /FUNDING · 融资结算/);
  assert.match(htmlSource, /data-metric="player-range">3–7</);
  assert.match(htmlSource, /href="#cards">看看卡牌</);
  assert.doesNotMatch(htmlSource, /挑战合作能力/);
});

test("editor still supports local changes and separate exports", () => {
  [
    'id="card-editor-form"',
    'id="relation-editor-form"',
    'id="export-game-json"',
    'id="export-change-log"',
    'id="change-log-preview"',
  ].forEach((marker) => assert.ok(htmlSource.includes(marker), `missing ${marker}`));
  assert.match(appSource, /function recordEditorChange\(/);
  assert.match(appSource, /function exportEditedGameData\(/);
});

test("the exported change log concisely lists locations and resulting values", () => {
  assert.match(appSource, /function describeEditorChangeLocation\(/);
  assert.match(appSource, /function describeEditorChangeResult\(/);
  assert.match(appSource, /changes = editorChangeLog\.map\(normalizeEditorChange\)/);
  assert.match(appSource, /changeCount: changes\.length/);
  assert.match(appSource, /location:/);
  assert.match(appSource, /changedTo:/);

  const recordFunction = appSource.match(
    /function recordEditorChange\([\s\S]*?\n}\n\nfunction describeEditorChangeLocation/,
  )?.[0];
  assert.ok(recordFunction, "missing recordEditorChange implementation");
  assert.doesNotMatch(recordFunction, /timestamp|sequence|before:|after:|action:|note:/);
});
