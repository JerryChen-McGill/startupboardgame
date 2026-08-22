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

test("the latest export supplies 37 startup cards and 12 standalone event cards", () => {
  assert.equal(allCards.length, 49);
  assert.deepEqual(
    Object.fromEntries(Object.entries(data.cards).map(([type, cards]) => [type, cards.length])),
    { user: 10, need: 10, product: 9, promotion: 8, event: 12 },
  );
  assert.equal(data.meta.networkCardCount, 49);
  assert.equal(data.meta.playerRange, "3–7");
  assert.ok(allCards.every((card) => card.confirmed === true));
  assert.ok(allCards.every((card) => card.emoji !== "✨"), "placeholder icons should be replaced");
  assert.ok(["user", "need", "product", "promotion"].every((type) => data.cards[type].length <= 10));
  assert.ok(data.cards.event.every((card) => card.network === false));
});

test("only the 150 confirmed, unique, structurally valid relationships remain", () => {
  assert.equal(data.relations.length, 150);
  assert.equal(data.meta.relationCount, 150);
  assert.equal(relationIndex.size, 150);
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
    assert.notEqual(cardById.get(relation.source).type, "event");
    assert.notEqual(cardById.get(relation.target).type, "event");
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
    "user-need": 43,
    "user-promotion": 38,
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

  assert.deepEqual(outcomeCounts, { failure: 5472, basic: 1412, perfect: 316 });
  assert.equal(Object.values(outcomeCounts).reduce((total, count) => total + count, 0), 7200);
});

test("new user cards are appended after the existing category cards", () => {
  assert.deepEqual(
    data.cards.user.slice(-3).map((card) => card.id),
    ["u-mars-colonist", "u-wedding-host", "u-santa"],
  );
  assert.deepEqual(data.cards.user.slice(-3).map((card) => card.order), [7, 8, 9]);
});

test("every startup card connects to both neighboring categories", () => {
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

  allCards.filter((card) => card.type !== "event").forEach((card) => {
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
