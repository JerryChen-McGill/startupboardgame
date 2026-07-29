import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(testDirectory, "..");
const data = JSON.parse(fs.readFileSync(path.join(rootDirectory, "data", "game-data.json"), "utf8"));
const allCards = Object.entries(data.cards).flatMap(([type, cards]) => cards.map((card) => ({ ...card, type })));
const cardById = new Map(allCards.map((card) => [card.id, card]));

const pairKey = (a, b) => [a, b].sort().join("::");
const relationIndex = new Map(data.relations.map((relation) => [pairKey(relation.source, relation.target), relation]));
const allowedTypePairs = [
  ["user", "promotion"],
  ["user", "need"],
  ["promotion", "product"],
  ["need", "product"],
];

function isConnected(cardIds) {
  const adjacency = new Map(cardIds.map((id) => [id, new Set()]));
  data.relations.forEach((relation) => {
    if (!adjacency.has(relation.source) || !adjacency.has(relation.target)) return;
    adjacency.get(relation.source).add(relation.target);
    adjacency.get(relation.target).add(relation.source);
  });
  const visited = new Set();
  const queue = [cardIds[0]];
  while (queue.length) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    adjacency.get(id).forEach((neighbor) => queue.push(neighbor));
  }
  return visited.size === cardIds.length;
}

test("the exported change log is reflected in the 39-card base data", () => {
  assert.equal(allCards.length, 39);
  assert.deepEqual(
    Object.fromEntries(Object.entries(data.cards).map(([type, cards]) => [type, cards.length])),
    { user: 10, need: 9, product: 10, promotion: 10 },
  );
  ["u-dragon", "u-ghost", "n-hair"].forEach((id) => assert.equal(cardById.has(id), false));
  assert.equal(cardById.get("new-card-ms60m3pb")?.name, "忙碌的厨师");
  assert.equal(cardById.get("new-card-ms60pajb")?.name, "老头");
  assert.equal(cardById.get("u-tree")?.name, "树精灵");
  assert.equal(cardById.get("u-snail")?.name, "蜗牛");
  assert.equal(cardById.get("u-stone")?.name, "无名石头");
  assert.equal(cardById.get("n-eight")?.name, "天黑就会焦虑");
  assert.equal(cardById.get("n-daze")?.name, "一发起呆就停不下来");
  assert.equal(cardById.get("n-exam")?.name, "记忆太短了只有七秒");
  assert.equal(cardById.get("n-lost")?.name, "东西丢了老是找不着");
  assert.equal(cardById.get("m-firefly")?.name, "萤火乱飞");

  Object.values(data.cards).forEach((cards) => {
    assert.equal(new Set(cards.map((card) => card.accentKey)).size, cards.length);
    cards.forEach((card) => assert.match(card.accent, /^#[0-9A-F]{6}$/i));
    cards.forEach((card) => assert.equal(typeof card.confirmed, "boolean"));
  });
});

test("all 120 relationships are unique, structurally valid, and explain their mechanism", () => {
  assert.equal(data.relations.length, 120);
  assert.equal(relationIndex.size, 120);
  data.relations.forEach((relation) => {
    assert.ok(cardById.has(relation.source), `missing source ${relation.source}`);
    assert.ok(cardById.has(relation.target), `missing target ${relation.target}`);
    assert.ok(relation.reason.trim().length >= 16, `${pairKey(relation.source, relation.target)} needs a concrete reason`);
    assert.doesNotMatch(relation.reason, /^[\s。.!！?？]+$/, "punctuation-only reasons are not allowed");
    assert.equal(typeof relation.confirmed, "boolean");

    const actualPair = [cardById.get(relation.source).type, cardById.get(relation.target).type].sort().join("-");
    const expectedPairByType = {
      "user-need": "need-user",
      "user-promotion": "promotion-user",
      "need-product": "need-product",
      "product-promotion": "product-promotion",
    };
    assert.equal(actualPair, expectedPairByType[relation.type], `wrong type for ${relation.source} × ${relation.target}`);
  });
});

test("the data model exposes only four balanced adjacent relationship groups", () => {
  const counts = Object.fromEntries(
    Object.keys(data.relationMeta).map((type) => [
      type,
      data.relations.filter((relation) => relation.type === type).length,
    ]),
  );
  assert.equal(Object.keys(data.relationMeta).length, 4);
  assert.deepEqual(counts, {
    "user-need": 30,
    "user-promotion": 30,
    "need-product": 30,
    "product-promotion": 30,
  });
  assert.equal(data.relationMeta["user-product"], undefined);
  assert.equal(data.relationMeta["need-promotion"], undefined);
});

test("every card has a logical path to both neighboring categories", () => {
  const requiredNeighborTypes = {
    user: ["need", "promotion"],
    need: ["user", "product"],
    product: ["need", "promotion"],
    promotion: ["user", "product"],
  };
  const neighborTypesByCard = new Map(allCards.map((card) => [card.id, new Set()]));

  data.relations.forEach((relation) => {
    const source = cardById.get(relation.source);
    const target = cardById.get(relation.target);
    neighborTypesByCard.get(source.id).add(target.type);
    neighborTypesByCard.get(target.id).add(source.type);
  });

  allCards.forEach((card) => {
    requiredNeighborTypes[card.type].forEach((neighborType) => {
      assert.ok(
        neighborTypesByCard.get(card.id).has(neighborType),
        `${card.id} has no ${neighborType} relationship`,
      );
    });
  });
});

test("only the two relationships approved in the change log start confirmed", () => {
  const confirmedKeys = data.relations
    .filter((relation) => relation.confirmed)
    .map((relation) => pairKey(relation.source, relation.target))
    .sort();
  assert.deepEqual(confirmedKeys, ["n-eight::u-firefly", "n-slack::u-octopus"]);
});

test("featured complete project is connected and featured adjustment project is not", () => {
  assert.equal(isConnected(data.featuredCombos.success), true);
  assert.equal(isConnected(data.featuredCombos.failure), false);
});

test("all featured cards exist and selected example relations are retrievable without direction", () => {
  [...data.featuredCombos.success, ...data.featuredCombos.failure].forEach((id) => assert.ok(cardById.has(id)));
  assert.ok(relationIndex.get(pairKey("u-tree", "n-daze")));
  assert.ok(relationIndex.get(pairKey("n-daze", "p-bean")));
  assert.ok(relationIndex.get(pairKey("p-bean", "m-crow")));
  assert.ok(relationIndex.get(pairKey("m-crow", "u-tree")));
});

test("funding examples count only the four adjacent card pairs", () => {
  const countAdjacentRelations = (cardIds) => {
    const selected = new Map(cardIds.map((id) => [cardById.get(id).type, id]));
    return allowedTypePairs.filter(([typeA, typeB]) =>
      relationIndex.has(pairKey(selected.get(typeA), selected.get(typeB))),
    ).length;
  };

  assert.equal(countAdjacentRelations(data.featuredCombos.success), 4);
  assert.ok(countAdjacentRelations(data.featuredCombos.failure) <= 2);
});
