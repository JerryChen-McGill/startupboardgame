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
  context.applyOctoberDataUpdate(draft, data);
  assert.equal(chef.name, "厨师");
  assert.equal(chef.note, "用户自己修改的描述");
  assert.ok(!draft.cards.user.some(c => c.id === "u-octopus"));
  assert.equal(draft.relations.length, 124);
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
