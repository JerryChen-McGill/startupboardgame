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

test("card library and relationship filters use the requested display order", () => {
  assert.match(appSource, /const CARD_LIBRARY_ORDER = \["user", "need", "product", "promotion"\]/);
  assert.match(
    appSource,
    /const RELATION_FILTER_ORDER = \["user-need", "need-product", "product-promotion", "user-promotion"\]/,
  );
  assert.match(appSource, /const cards = CARD_LIBRARY_ORDER\.flatMap/);
  assert.match(appSource, /\.\.\.RELATION_FILTER_ORDER/);

  const userFilter = htmlSource.indexOf('data-card-filter="user"');
  const needFilter = htmlSource.indexOf('data-card-filter="need"');
  const productFilter = htmlSource.indexOf('data-card-filter="product"');
  const promotionFilter = htmlSource.indexOf('data-card-filter="promotion"');
  assert.ok(userFilter < needFilter && needFilter < productFilter && productFilter < promotionFilter);
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
        `\\.connector-shape\\[data-shape="${key}"\\][\\s\\S]*?fill:\\s*none;[\\s\\S]*?stroke:\\s*#000;`,
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
        `\\.connector-shape\\[data-shape="${key}"\\][\\s\\S]*?fill:\\s*none;[\\s\\S]*?stroke:\\s*#888;[\\s\\S]*?stroke-dasharray:\\s*none;[\\s\\S]*?stroke-width:\\s*1\\.3;`,
      ),
    );
  });
});

test("the connector stylesheet URL is versioned to bypass stale browser caches", () => {
  assert.match(htmlSource, /href="\.\/styles\.css\?v=20260731-5"/);
});

test("the application script URL is versioned to publish ordering changes immediately", () => {
  assert.match(htmlSource, /src="\.\/app\.js\?v=20260731-2"/);
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

test("the homepage demo randomizes current cards and evaluates all four adjacent pairs", () => {
  assert.match(htmlSource, /id="startup-board"/);
  assert.match(htmlSource, /id="shuffle-startup"[\s\S]*?重新组合/);
  assert.match(htmlSource, /id="startup-result"/);
  assert.match(appSource, /function randomStartupCards\(/);
  assert.match(appSource, /function evaluateStartup\(/);
  assert.match(appSource, /\["user", "promotion"\]/);
  assert.match(appSource, /\["user", "need"\]/);
  assert.match(appSource, /\["promotion", "product"\]/);
  assert.match(appSource, /\["need", "product"\]/);
  assert.match(appSource, /200 万/);
  assert.match(appSource, /100 万/);
  assert.match(appSource, /"✓" : "×"/);
  assert.match(appSource, /U 字形连通/);
  assert.match(appSource, /未完全连通，创业失败/);
  assert.match(cssSource, /\.board-match\.is-match \{ background: #2f9a62; \}/);
  assert.match(cssSource, /\.board-match\.is-miss \{ background: #d94b4b; \}/);
  assert.match(cssSource, /\.board-match-1 \{ top: 25%; left: 50%; \}/);
  assert.match(cssSource, /\.board-match-4 \{ top: 75%; left: 50%; \}/);
  assert.match(cssSource, /translate\(-50%, -50%\) translate\(10px, -10px\)/);
  assert.match(cssSource, /\.startup-card\.library-card/);
  assert.match(htmlSource, /class="rulebook-book"/);
  assert.match(htmlSource, /rulebook-page rulebook-page-left/);
  assert.match(htmlSource, /rulebook-page rulebook-page-right/);
  assert.match(htmlSource, /融资与胜利/);
  assert.match(htmlSource, /<span>U 字形连通<\/span>/);
  assert.match(htmlSource, /<span>未完全连通，创业失败<\/span>/);
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
