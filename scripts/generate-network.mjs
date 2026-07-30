import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(scriptDirectory, "..");
const data = JSON.parse(fs.readFileSync(path.join(rootDirectory, "data", "game-data.json"), "utf8"));

const escapeXml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const cardIndex = new Map();
Object.entries(data.cards).forEach(([type, cards]) => {
  cards.forEach((card) => cardIndex.set(card.id, { ...card, type }));
});

const spread = (start, end, count) =>
  Array.from({ length: count }, (_, index) =>
    count === 1 ? (start + end) / 2 : start + ((end - start) * index) / (count - 1),
  );
const userHorizontal = spread(110, 1290, data.cards.user.length);
const productHorizontal = spread(110, 1290, data.cards.product.length);
const needVertical = spread(116, 864, data.cards.need.length);
const promotionVertical = spread(116, 864, data.cards.promotion.length);
const positions = new Map();

data.cards.user.forEach((card, index) => positions.set(card.id, { x: userHorizontal[index], y: 68 }));
data.cards.need.forEach((card, index) => positions.set(card.id, { x: 72, y: needVertical[index] }));
data.cards.product.forEach((card, index) => positions.set(card.id, { x: productHorizontal[index], y: 912 }));
data.cards.promotion.forEach((card, index) => positions.set(card.id, { x: 1328, y: promotionVertical[index] }));

const curveControlPoint = (source, target, index) => {
  const center = { x: 700, y: 490 };
  const midpoint = { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 };
  const pull = 0.34 + (index % 5) * 0.018;
  const offset = ((index % 3) - 1) * 18;
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.max(Math.hypot(dx, dy), 1);
  return {
    x: midpoint.x + (center.x - midpoint.x) * pull + (-dy / length) * offset,
    y: midpoint.y + (center.y - midpoint.y) * pull + (dx / length) * offset,
  };
};

const relationMarkup = data.relations
  .map((relation, index) => {
    const source = positions.get(relation.source);
    const target = positions.get(relation.target);
    const control = curveControlPoint(source, target, index);
    const sourceCard = cardIndex.get(relation.source);
    const targetCard = cardIndex.get(relation.target);
    const color = data.relationMeta[relation.type].color;
    return `
      <path d="M ${source.x} ${source.y} Q ${control.x.toFixed(1)} ${control.y.toFixed(1)} ${target.x} ${target.y}"
        fill="none" stroke="${color}" stroke-width="${(1.2 + relation.weight * 0.25).toFixed(2)}"
        stroke-linecap="round" opacity="${relation.confirmed ? ".78" : ".28"}"
        stroke-dasharray="${relation.confirmed ? "none" : "7 8"}">
        <title>${escapeXml(sourceCard.name)} × ${escapeXml(targetCard.name)}：${escapeXml(relation.reason)}</title>
      </path>`;
  })
  .join("");

const nodeMarkup = [...positions.entries()]
  .map(([id, position]) => {
    const card = cardIndex.get(id);
    const color = data.categoryMeta[card.type].color;
    return `
      <g transform="translate(${position.x} ${position.y})">
        <rect x="-56" y="-22" width="112" height="44" rx="12" fill="${color}" stroke="#ffffff"
          stroke-opacity=".7" stroke-dasharray="${card.confirmed ? "none" : "7 5"}"/>
        <text x="0" y="2" text-anchor="middle" dominant-baseline="middle"
          fill="#17152f" font-family="Microsoft YaHei, PingFang SC, sans-serif"
          font-size="12" font-weight="800">${escapeXml(card.emoji)} ${escapeXml(card.name)}</text>
      </g>`;
  })
  .join("");

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="980" viewBox="0 0 1400 980" role="img">
  <title>迷你创业桌游：四元素关系网</title>
  <desc>${cardIndex.size} 张已确认卡牌按关系数量排列于矩形四边，中间以 ${data.relations.length} 条已确认关系连接。</desc>
  <rect width="1400" height="980" fill="#111025"/>
  <defs>
    <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
      <path d="M30 0H0V30" fill="none" stroke="#ffffff" stroke-opacity=".035"/>
    </pattern>
  </defs>
  <rect width="1400" height="980" fill="url(#grid)"/>
  <rect x="72" y="68" width="1256" height="844" rx="18" fill="none"
    stroke="#ffffff" stroke-opacity=".17" stroke-width="1.5" stroke-dasharray="6 10"/>
  <g>${relationMarkup}</g>
  <g>${nodeMarkup}</g>
</svg>
`;

const outputDirectory = path.join(rootDirectory, "assets");
fs.mkdirSync(outputDirectory, { recursive: true });
const outputPath = path.join(outputDirectory, "relationship-network.svg");
fs.writeFileSync(outputPath, svg, "utf8");

console.log(`Generated ${path.relative(rootDirectory, outputPath)} with ${data.relations.length} relations.`);
