import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(testDirectory, "..");
const data = JSON.parse(fs.readFileSync(path.join(rootDirectory, "data", "game-data.json"), "utf8"));
const allCards = Object.entries(data.cards).flatMap(([type, cards]) =>
  cards.map((card) => ({ ...card, type })),
);
const cardById = new Map(allCards.map((card) => [card.id, card]));
const pairKey = (a, b) => [a, b].sort().join("::");
const relationIndex = new Map(
  data.relations.map((relation) => [pairKey(relation.source, relation.target), relation]),
);

test("the latest export supplies 34 confirmed cards across four categories", () => {
  assert.equal(allCards.length, 34);
  assert.deepEqual(
    Object.fromEntries(Object.entries(data.cards).map(([type, cards]) => [type, cards.length])),
    { user: 7, need: 10, product: 9, promotion: 8 },
  );
  assert.equal(data.meta.networkCardCount, 34);
  assert.equal(data.meta.playerRange, "3–7");
  assert.ok(allCards.every((card) => card.confirmed === true));
  assert.ok(allCards.every((card) => card.emoji !== "✨"), "placeholder icons should be replaced");
  assert.ok(Object.values(data.cards).every((cards) => cards.length <= 10));
});

test("only the 133 confirmed, unique, structurally valid relationships remain", () => {
  assert.equal(data.relations.length, 133);
  assert.equal(data.meta.relationCount, 133);
  assert.equal(relationIndex.size, 133);
  data.relations.forEach((relation) => {
    assert.equal(relation.confirmed, true);
    assert.ok(cardById.has(relation.source), `missing source ${relation.source}`);
    assert.ok(cardById.has(relation.target), `missing target ${relation.target}`);
    assert.ok(relation.reason.trim().length > 0, `${pairKey(relation.source, relation.target)} needs a reason`);

    const actualPair = [cardById.get(relation.source).type, cardById.get(relation.target).type]
      .sort()
      .join("-");
    const expectedPairByType = {
      "user-need": "need-user",
      "user-promotion": "promotion-user",
      "need-product": "need-product",
      "product-promotion": "product-promotion",
    };
    assert.equal(actualPair, expectedPairByType[relation.type]);
  });
});

test("the relationship groups reflect the filtered export", () => {
  const counts = Object.fromEntries(
    Object.keys(data.relationMeta).map((type) => [
      type,
      data.relations.filter((relation) => relation.type === type).length,
    ]),
  );
  assert.deepEqual(counts, {
    "user-need": 34,
    "user-promotion": 30,
    "need-product": 36,
    "product-promotion": 33,
  });
});

test("all four-card combinations split into the three startup outcomes", () => {
  const outcomeCounts = { failure: 0, basic: 0, perfect: 0 };

  for (const user of data.cards.user) {
    for (const promotion of data.cards.promotion) {
      for (const need of data.cards.need) {
        for (const product of data.cards.product) {
          const matchCount = [
            [user, promotion],
            [user, need],
            [promotion, product],
            [need, product],
          ].filter(([source, target]) => relationIndex.has(pairKey(source.id, target.id))).length;

          if (matchCount === 4) outcomeCounts.perfect += 1;
          else if (matchCount === 3) outcomeCounts.basic += 1;
          else outcomeCounts.failure += 1;
        }
      }
    }
  }

  assert.deepEqual(outcomeCounts, { failure: 3625, basic: 1140, perfect: 275 });
  assert.equal(Object.values(outcomeCounts).reduce((total, count) => total + count, 0), 5040);
});

test("cards are ordered by descending relationship count within every category", () => {
  const degree = new Map(allCards.map((card) => [card.id, 0]));
  data.relations.forEach((relation) => {
    degree.set(relation.source, degree.get(relation.source) + 1);
    degree.set(relation.target, degree.get(relation.target) + 1);
  });

  Object.values(data.cards).forEach((cards) => {
    const counts = cards.map((card) => degree.get(card.id));
    assert.deepEqual(counts, [...counts].sort((a, b) => b - a));
  });
});

test("every card connects to both neighboring categories", () => {
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
      assert.ok(neighborTypesByCard.get(card.id).has(neighborType));
    });
  });
});

test("the relationship data contains at least one fully connected four-card project", () => {
  const hasRelation = (a, b) => relationIndex.has(pairKey(a, b));
  const found = data.cards.user.some((user) =>
    data.cards.promotion.some(
      (promotion) =>
        hasRelation(user.id, promotion.id) &&
        data.cards.product.some(
          (product) =>
            hasRelation(promotion.id, product.id) &&
            data.cards.need.some(
              (need) => hasRelation(product.id, need.id) && hasRelation(need.id, user.id),
            ),
        ),
    ),
  );
  assert.equal(found, true);
});
