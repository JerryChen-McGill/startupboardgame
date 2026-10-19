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
  assert.equal(draft.relations.length, 129);
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
  assert.equal(draft.relations.length, 129);
  assert.equal(draft.meta.relationCount, 129);
  assert.equal(draft.meta.dataRevision, data.meta.dataRevision);
  for (const [a, b] of deleted) {
    assert.ok(!draft.relations.some(r => [r.source, r.target].includes(a) && [r.source, r.target].includes(b)));
    assert.ok(!data.relations.some(r => [r.source, r.target].includes(a) && [r.source, r.target].includes(b)));
  }
});

test("approved additions update older drafts once, preserve other edits, and exclude Mars aquarium", () => {
  const log = JSON.parse(fs.readFileSync(new URL("../data/迷你创业桌游-配对补充与说明调整.json", import.meta.url), "utf8"));
  const cards = new Map(Object.values(data.cards).flat().map(card => [card.name, card]));
  const key = (a, b) => [a, b].sort().join("::");
  const additions = log.changes.filter(change => change.changedTo === "已新增");
  const keys = new Set(additions.map(change => {
    const [a, b] = change.location.slice(3).split(" ↔ ");
    return key(cards.get(a).id, cards.get(b).id);
  }));
  assert.equal(keys.size, 11);
  assert.equal(log.changes.filter(change => change.location.startsWith("卡牌：")).length, 14);
  for (const revision of [undefined, "20261018-1", "20261018-2"]) {
    const draft = structuredClone(data);
    draft.meta.dataRevision = revision;
    draft.relations = draft.relations.filter(r => !keys.has(key(r.source, r.target)));
    assert.equal(draft.relations.length, 118);
    // An already-added pair should be updated in place instead of duplicated.
    const existing = structuredClone(data.relations.find(r => keys.has(key(r.source, r.target))));
    existing.reason = "尚未填写";
    draft.relations.push(existing);
    log.changes.filter(change => change.location.startsWith("卡牌：")).forEach(change => {
      const id = cards.get(change.location.slice(3)).id;
      Object.values(draft.cards).flat().find(card => card.id === id).note = change.previous;
    });
    draft.cards.user.find(card => card.id === "u-mars-colonist").note = "保留我的火星描述";
    context.applyApprovedPairingUpdate(draft, data);
    assert.equal(draft.relations.length, 129);
    assert.equal(draft.meta.relationCount, 129);
    assert.equal(new Set(draft.relations.map(r => key(r.source, r.target))).size, 129);
    assert.equal(draft.meta.dataRevision, data.meta.dataRevision);
    for (const r of data.relations.filter(r => keys.has(key(r.source, r.target)))) {
      assert.deepEqual(structuredClone(draft.relations.find(candidate => key(candidate.source, candidate.target) === key(r.source, r.target))), r);
    }
    for (const change of log.changes.filter(change => change.location.startsWith("卡牌："))) {
      const card = cards.get(change.location.slice(3));
      assert.equal(Object.values(draft.cards).flat().find(c => c.id === card.id).note, card.note);
    }
    assert.equal(draft.cards.user.find(card => card.id === "u-mars-colonist").note, "保留我的火星描述");
    const after = JSON.stringify(draft);
    context.applyApprovedPairingUpdate(draft, data);
    assert.equal(JSON.stringify(draft), after);
  }
  assert.ok(!data.relations.some(r => key(r.source, r.target) === key(cards.get("火星移民").id, cards.get("海族馆广告").id)));
});
