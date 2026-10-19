import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
const source = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const data = JSON.parse(fs.readFileSync(new URL("../data/game-data.json", import.meta.url), "utf8"));
const context = vm.createContext({ document: { addEventListener() {} } });
vm.runInContext(source, context);

test("saved drafts receive the requested changes without losing unrelated edits", () => {
  const draft = structuredClone(data);
  delete draft.meta.dataRevision;
  draft.cards.user.push({ id: "u-octopus", name: "小章鱼" });
  const chef = draft.cards.user.find(c => c.name === "厨师");
  chef.name = "倒霉的厨师";
  chef.note = "用户自己修改的描述";
  draft.relations.push({ source: "u-octopus", target: "n-slack" });
  draft.relations.push({ source: "new-card-ms6wlmfs", target: "new-card-ms7bgc52" });
  context.applyLatestRelationshipUpdate(draft, data);
  assert.equal(chef.name, "厨师");
  assert.equal(chef.note, "用户自己修改的描述");
  assert.ok(!draft.cards.user.some(c => c.id === "u-octopus"));
  assert.equal(draft.relations.length, 118);
  assert.equal(draft.meta.dataRevision, data.meta.dataRevision);
});

test("print dimensions and typography reject invalid stored settings", () => {
  for (const [input, expected] of [
    [null, { widthMm: 420, fontPt: 12 }],
    [{ widthMm: 900, fontPt: 18 }, { widthMm: 900, fontPt: 18 }],
    [{ widthMm: -1, fontPt: 99 }, { widthMm: 200, fontPt: 24 }],
    [{ widthMm: "bad", fontPt: "bad" }, { widthMm: 420, fontPt: 12 }],
  ]) assert.deepEqual(JSON.parse(JSON.stringify(context.normalizeRulebookLayout(input))), expected);
});

test("the ten default connector slots match the supplied configuration", () => {
  const slots = JSON.parse(vm.runInContext("JSON.stringify(DEFAULT_CONNECTOR_SLOT_CONFIG)", context));
  assert.deepEqual(slots.map(s => s.shapeKey), ["line", "square", "circle", "small-circle", "diamond", "triangle", "triangle-inverted", "heart", "ellipse-horizontal", "ellipse-vertical"]);
  assert.deepEqual(slots.map(s => s.width), ["thick", "thick", "thick", "thick", "thin", "thin", "thin", "thin", "thin", "thin"]);
  assert.deepEqual(slots.map(s => s.color), ["black", "black", "black", "black", "black", "black", "black", "gray", "gray", "gray"]);
});

test("the six latest deletions migrate prior drafts while preserving custom card fields", () => {
  const log = JSON.parse(fs.readFileSync(new URL("../data/迷你创业桌游-修改记录 (4).json", import.meta.url), "utf8"));
  const cards = new Map(Object.values(data.cards).flat().map(card => [card.name, card]));
  const deleted = log.changes.map(change => change.location.slice(3).split(" ↔ ").map(name => cards.get(name).id));
  const draft = structuredClone(data);
  draft.meta.dataRevision = "20261018-1";
  deleted.forEach(([source, target]) => draft.relations.push({ source, target }));
  const chef = draft.cards.user.find(card => card.name === "厨师");
  chef.name = "本机自定义名称";
  chef.note = "本机自定义说明";
  context.applyLatestRelationshipUpdate(draft, data);
  assert.equal(chef.name, "本机自定义名称");
  assert.equal(chef.note, "本机自定义说明");
  assert.equal(draft.relations.length, 118);
  assert.equal(draft.meta.relationCount, 118);
  assert.equal(draft.meta.dataRevision, "20261018-2");
  for (const [a, b] of deleted) {
    assert.ok(!draft.relations.some(r => [r.source, r.target].includes(a) && [r.source, r.target].includes(b)));
    assert.ok(!data.relations.some(r => [r.source, r.target].includes(a) && [r.source, r.target].includes(b)));
  }
});
