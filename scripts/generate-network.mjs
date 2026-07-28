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

const horizontal = [210, 405, 600, 795, 990];
const vertical = [190, 300, 410, 520, 630];
const positions = new Map();
const networkCards = (type) => data.cards[type].filter((card) => card.network);

networkCards("user").forEach((card, index) => positions.set(card.id, { x: horizontal[index], y: 72 }));
networkCards("need").forEach((card, index) => positions.set(card.id, { x: 102, y: vertical[index] }));
networkCards("product").forEach((card, index) => positions.set(card.id, { x: horizontal[index], y: 748 }));
networkCards("promotion").forEach((card, index) => positions.set(card.id, { x: 1098, y: vertical[index] }));

const curveControlPoint = (source, target, index) => {
  const center = { x: 600, y: 410 };
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
        stroke-linecap="round" opacity=".3">
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
        <rect x="-83" y="-27" width="166" height="54" rx="15" fill="${color}" stroke="#ffffff" stroke-opacity=".18"/>
        <text x="0" y="2" text-anchor="middle" dominant-baseline="middle"
          fill="#17152f" font-family="Microsoft YaHei, PingFang SC, sans-serif"
          font-size="16" font-weight="800">${escapeXml(card.emoji)} ${escapeXml(card.name)}</text>
      </g>`;
  })
  .join("");

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="820" viewBox="0 0 1200 820" role="img">
  <title>迷你创业桌游：四元素关系网</title>
  <desc>20 张卡分布于矩形四边，四角留白，中间以 72 条有逻辑的多对多关系连接。</desc>
  <rect width="1200" height="820" fill="#111025"/>
  <defs>
    <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
      <path d="M30 0H0V30" fill="none" stroke="#ffffff" stroke-opacity=".035"/>
    </pattern>
  </defs>
  <rect width="1200" height="820" fill="url(#grid)"/>
  <rect x="104" y="73" width="994" height="675" rx="18" fill="none"
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
