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

test("card library and approved network counts are stable", () => {
  assert.equal(allCards.length, 40);
  assert.equal(allCards.filter((card) => card.network).length, 20);
  Object.values(data.cards).forEach((cards) => assert.equal(cards.filter((card) => card.network).length, 5));
});

test("approved example relationship data contains 72 unique valid pairs", () => {
  assert.equal(data.relations.length, 72);
  assert.equal(relationIndex.size, 72);
  data.relations.forEach((relation) => {
    assert.ok(cardById.has(relation.source), `missing source ${relation.source}`);
    assert.ok(cardById.has(relation.target), `missing target ${relation.target}`);
    assert.ok(relation.reason.trim().length > 0, "every relation needs a reason");
  });
});

test("current SVG dataset contains four 18-relation groups while the model exposes six pair types", () => {
  const counts = Object.fromEntries(
    Object.keys(data.relationMeta).map((type) => [
      type,
      data.relations.filter((relation) => relation.type === type).length,
    ]),
  );
  assert.equal(Object.keys(data.relationMeta).length, 6);
  assert.deepEqual(counts, {
    "user-need": 18,
    "user-product": 0,
    "user-promotion": 18,
    "need-product": 18,
    "need-promotion": 0,
    "product-promotion": 18,
  });
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
