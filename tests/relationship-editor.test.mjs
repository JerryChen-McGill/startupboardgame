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
  assert.match(appSource, /const CARD_LIBRARY_ORDER = \["user", "need", "product", "promotion", "event"\]/);
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
  const eventFilter = htmlSource.indexOf('data-card-filter="event"');
  assert.ok(
    userFilter < needFilter &&
      needFilter < productFilter &&
      productFilter < promotionFilter &&
      promotionFilter < eventFilter,
  );
});

test("card faces use Chinese type labels, unframed icons, and complete descriptions", () => {
  const cards = ["user", "need", "product", "promotion"].flatMap((type) => data.cards[type]);
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

test("event cards are standalone, interface-free, and editable from the relationship map", () => {
  assert.equal(data.cards.event.length, 12);
  assert.ok(data.cards.event.every((card) => card.note.trim().length > 0));
  assert.match(appSource, /event: "事件卡"/);
  assert.match(appSource, /CARD_EDGE_CONFIG\[card\.type\] \|\| \[\]/);
  assert.match(appSource, /function renderEventMapCards\(/);
  assert.match(appSource, /data-event-card-id/);
  assert.match(appSource, /selectCardForEditor\(selectedNodeId\)/);
  assert.match(htmlSource, /id="event-map-cards"/);
  assert.match(htmlSource, /<option value="event">事件<\/option>/);
  assert.match(cssSource, /\.event-map-cards\s*\{/);
});

test("right-clicking a card downloads a tightly cropped PNG", () => {
  assert.match(appSource, /addEventListener\("contextmenu"/);
  assert.match(appSource, /event\.target\.closest\("\.library-card"\)/);
  assert.match(appSource, /event\.preventDefault\(\)/);
  assert.match(appSource, /getBoundingClientRect\(\)/);
  assert.match(appSource, /canvas\.toBlob/);
  assert.match(appSource, /"image\/png"/);
  assert.match(appSource, /clonedIcon\.style\.fontSize\s*=\s*getComputedStyle\(originalIcon\)\.fontSize/);
  assert.match(cssSource, /\.card-image-export\s*{[\s\S]*?box-shadow:\s*none\s*!important;/);
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

test("connector halves share the card border as one exact symmetry axis", () => {
  assert.match(cssSource, /\.edge-right\s*\{\s*right:\s*-3px;\s*\}/);
  assert.match(cssSource, /\.edge-left\s*\{\s*left:\s*-3px;\s*\}/);
  assert.match(cssSource, /\.edge-top\s*\{\s*top:\s*-3px;\s*\}/);
  assert.match(cssSource, /\.edge-bottom\s*\{\s*bottom:\s*-3px;\s*\}/);
  assert.match(appSource, /right:\s*"0 0 20 40"/);
  assert.match(appSource, /left:\s*"20 0 20 40"/);
  assert.match(appSource, /bottom:\s*"0 0 40 20"/);
  assert.match(appSource, /top:\s*"0 20 40 20"/);
});

test("the homepage exposes a connector lab for ten editable slots", () => {
  ["octagon", "cross", "small-circle", "heart", "triangle-inverted"].forEach((key) => {
    assert.ok(appSource.includes(`key: "${key}"`), `missing additional shape ${key}`);
  });
  assert.match(appSource, /name: "小圆"/);
  assert.match(appSource, /name: "心形"/);
  assert.match(appSource, /name: "倒等边三角形"/);
  assert.match(htmlSource, /id="open-connector-lab"[\s\S]*几何图形实验室/);
  assert.match(htmlSource, /id="connector-lab"[\s\S]*id="connector-lab-fields"/);
  assert.match(htmlSource, /id="confirm-connector-lab"[\s\S]*确认并应用/);
  assert.match(appSource, /function renderConnectorLab\(/);
  assert.match(appSource, /function readConnectorLabConfig\(/);
  assert.match(appSource, /function saveConnectorSlotConfig\(/);
  assert.match(appSource, /CONNECTOR_COLORS = \{ black: "#000", gray: "#888" \}/);
  assert.match(appSource, /CONNECTOR_WIDTHS = \{ thick: 2\.6, thin: 1\.3 \}/);
  assert.match(cssSource, /\.connector-lab-fields\s*\{/);
  assert.match(cssSource, /\.connector-lab-preview\s*\{/);
});

test("the connector stylesheet URL is versioned to bypass stale browser caches", () => {
  assert.match(htmlSource, /href="\.\/styles\.css\?v=20260820-2"/);
});

test("homepage demo cards can stretch to equal row heights on mobile", () => {
  assert.match(cssSource, /\.startup-card\.library-card\s*\{\s*aspect-ratio:\s*auto;\s*\}/);
});

test("application assets are versioned to publish interaction changes immediately", () => {
  assert.match(htmlSource, /href="\.\/styles\.css\?v=20260820-2"/);
  assert.match(htmlSource, /src="\.\/app\.js\?v=20260820-2"/);
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
  assert.match(cssSource, /translate\(-50%, -50%\) translate\(46px, -46px\)/);
  assert.match(cssSource, /\.startup-card\.library-card:hover[\s\S]*?transform:\s*none;/);
  assert.match(cssSource, /width:\s*min\(540px,\s*calc\(36\.8vw - 2\.24rem\)\)/);
  assert.doesNotMatch(cssSource, /\.startup-board[\s\S]{0,220}rotate\(/);
  assert.match(appSource, /visibleNote/);
  assert.match(appSource, /startup-picker prompt-/);
  assert.match(appSource, /class="startup-prompt"/);
  assert.match(appSource, /card\.note/);
  assert.match(appSource, /function renderStartupPicker\(/);
  assert.match(appSource, /data-startup-card-id/);
  assert.match(appSource, /currentStartupCards/);
  assert.match(appSource, /function syncStartupBoardSize\(/);
  assert.match(appSource, /libraryCard\.getBoundingClientRect\(\)\.width \* 2/);
  assert.match(data.categoryMeta.promotion.question, /怎么让他们知道？/);
  assert.match(htmlSource, /class="rulebook-book"/);
  assert.match(htmlSource, /rulebook-page rulebook-page-left/);
  assert.match(htmlSource, /rulebook-page rulebook-page-right/);
  assert.match(htmlSource, /迷你创业桌游说明书/);
  assert.match(htmlSource, /暗黑版 · 创业试炼场/);
  assert.match(htmlSource, /光明版 · 协作创业/);
  assert.match(htmlSource, /id="edit-rulebook"/);
  assert.match(htmlSource, /id="save-rulebook"/);
  assert.match(htmlSource, /每位创业者收益＝项目利润＋总投资额/);
  assert.match(htmlSource, /项目成员就强制各补几张卡/);
  ["收益 1", "收益 4", "收益 9", "收益 16"].forEach((label) => assert.match(htmlSource, new RegExp(label)));
  assert.match(appSource, /function bindRulebookEditor\(/);
  assert.match(appSource, /RULEBOOK_STORAGE_KEY/);
  assert.match(cssSource, /\.manual-board div[\s\S]*?aspect-ratio:\s*3\s*\/\s*4/);
});

test("the relationship map lists dynamic combination and outcome statistics", () => {
  [
    'id="network-card-count"',
    'id="network-relation-count"',
    'id="network-combination-count"',
    'id="network-failure-count"',
    'id="network-basic-count"',
    'id="network-perfect-count"',
  ].forEach((marker) => assert.ok(htmlSource.includes(marker), `missing ${marker}`));
  assert.match(appSource, /function calculateStartupStatistics\(/);
  assert.match(appSource, /function formatPercentage\(/);
  assert.match(appSource, /创业失败.*statistics\.failure/);
  assert.match(appSource, /基本成功.*statistics\.basic/);
  assert.match(appSource, /完全成功.*statistics\.perfect/);
  assert.doesNotMatch(htmlSource, /张卡已确认|条关系已确认/);
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
