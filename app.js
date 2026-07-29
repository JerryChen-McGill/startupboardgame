const SVG_NS = "http://www.w3.org/2000/svg";

let gameData;
let cardById;
let relationByPair;
let activeRelationType = "all";
let selectedNodeId = null;
const STARTUP_CARD_ORDER = ["user", "promotion", "need", "product"];
const STARTUP_PAIR_TYPES = [
  ["user", "promotion"],
  ["user", "need"],
  ["promotion", "product"],
  ["need", "product"],
];
const CARD_EDGE_CONFIG = {
  user: [
    { neighborType: "promotion", side: "right" },
    { neighborType: "need", side: "bottom" },
  ],
  promotion: [
    { neighborType: "user", side: "left" },
    { neighborType: "product", side: "bottom" },
  ],
  need: [
    { neighborType: "user", side: "top" },
    { neighborType: "product", side: "right" },
  ],
  product: [
    { neighborType: "promotion", side: "top" },
    { neighborType: "need", side: "left" },
  ],
};

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const response = await fetch("./data/game-data.json");
    if (!response.ok) throw new Error(`数据加载失败：${response.status}`);
    gameData = await response.json();
    cardById = buildCardIndex(gameData.cards);
    relationByPair = buildRelationIndex(gameData.relations);

    renderCardLibrary();
    bindCardFilters();
    renderRelationFilters();
    renderRelationshipNetwork();
    bindNetworkDownload();
    bindStartupLab();
    renderStartup(gameData.featuredCombos.success);
  } catch (error) {
    console.error(error);
    document.querySelector("#card-library").innerHTML =
      '<p class="load-error">卡牌数据暂时无法加载，请刷新页面重试。</p>';
  }
});

function buildCardIndex(categories) {
  const index = new Map();
  Object.entries(categories).forEach(([type, cards]) => {
    cards.forEach((card) => index.set(card.id, { ...card, type }));
  });
  return index;
}

function pairKey(a, b) {
  return [a, b].sort().join("::");
}

function buildRelationIndex(relations) {
  return new Map(relations.map((relation) => [pairKey(relation.source, relation.target), relation]));
}

function renderCardLibrary(filter = "all") {
  const library = document.querySelector("#card-library");
  const cards = Object.entries(gameData.cards)
    .flatMap(([type, entries]) => entries.map((card) => ({ ...card, type })))
    .filter((card) => filter === "all" || card.type === filter)
    .sort((a, b) => STARTUP_CARD_ORDER.indexOf(a.type) - STARTUP_CARD_ORDER.indexOf(b.type));

  library.innerHTML = cards
    .map((card, index) => {
      const meta = gameData.categoryMeta[card.type];
      return `
        <article
          class="library-card"
          data-type="${card.type}"
          style="--category-bg:${meta.color};--card-halo:${card.accent};animation-delay:${index * 20}ms"
        >
          ${renderLibraryEdges(card)}
          <div class="card-topline">
            <span>${meta.label}</span>
            <span>${card.accentName} · ${meta.en}</span>
          </div>
          <div class="card-emoji" aria-hidden="true"><i></i><span>${card.emoji}</span></div>
          <h3 class="card-name">${card.name}</h3>
          <p class="card-question">${card.note}</p>
        </article>
      `;
    })
    .join("");
}

function renderLibraryEdges(card) {
  return CARD_EDGE_CONFIG[card.type]
    .map(({ neighborType, side }) => {
      const matches = gameData.relations
        .filter((relation) => relation.source === card.id || relation.target === card.id)
        .map((relation) => {
          const otherId = relation.source === card.id ? relation.target : relation.source;
          return cardById.get(otherId);
        })
        .filter((otherCard) => otherCard?.type === neighborType);
      if (!matches.length) return "";
      const names = matches.map((match) => match.name).join("、");
      return `
        <div class="card-edge edge-${side}" title="可匹配：${names}" aria-hidden="true">
          ${matches.map((match) => `<span style="background:${match.accent}"></span>`).join("")}
        </div>
      `;
    })
    .join("");
}

function bindCardFilters() {
  document.querySelectorAll("[data-card-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-card-filter]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      renderCardLibrary(button.dataset.cardFilter);
    });
  });
}

function renderRelationFilters() {
  const container = document.querySelector("#relation-filters");
  const relationCounts = gameData.relations.reduce((counts, relation) => {
    counts[relation.type] = (counts[relation.type] || 0) + 1;
    return counts;
  }, {});
  const buttons = [
    `<button class="relation-chip active" type="button" data-relation-filter="all">全部关系</button>`,
    ...Object.entries(gameData.relationMeta)
      .filter(([key]) => relationCounts[key])
      .map(
      ([key, meta]) =>
        `<button class="relation-chip" type="button" data-relation-filter="${key}" style="--chip-color:${meta.color}">${meta.label} · ${relationCounts[key]}</button>`,
    ),
  ];
  container.innerHTML = buttons.join("");

  container.querySelectorAll("[data-relation-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      activeRelationType = button.dataset.relationFilter;
      container.querySelectorAll(".relation-chip").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      updateRelationVisibility();
    });
  });
}

function networkCards(type) {
  return gameData.cards[type].filter((card) => card.network);
}

function networkPositions() {
  const horizontal = [210, 405, 600, 795, 990];
  const vertical = [190, 300, 410, 520, 630];
  const positions = new Map();

  networkCards("user").forEach((card, index) => positions.set(card.id, { x: horizontal[index], y: 72, side: "top" }));
  networkCards("need").forEach((card, index) => positions.set(card.id, { x: 102, y: vertical[index], side: "left" }));
  networkCards("product").forEach((card, index) => positions.set(card.id, { x: horizontal[index], y: 748, side: "bottom" }));
  networkCards("promotion").forEach((card, index) => positions.set(card.id, { x: 1098, y: vertical[index], side: "right" }));

  return positions;
}

function svgElement(tag, attributes = {}) {
  const element = document.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function renderRelationshipNetwork() {
  const svg = document.querySelector("#relationship-network");
  const positions = networkPositions();
  svg.replaceChildren(svgElement("title", { id: "network-title" }));
  svg.firstChild.textContent = "用户、传播、需求、产品卡牌之间的多对多关系网络";

  const border = svgElement("rect", {
    x: 104,
    y: 73,
    width: 994,
    height: 675,
    rx: 18,
    fill: "none",
    stroke: "rgba(255,255,255,.17)",
    "stroke-width": 1.5,
    "stroke-dasharray": "6 10",
  });
  svg.appendChild(border);

  const relationLayer = svgElement("g", { class: "relation-layer" });
  gameData.relations.forEach((relation, index) => {
    const source = positions.get(relation.source);
    const target = positions.get(relation.target);
    if (!source || !target) return;

    const control = curveControlPoint(source, target, index);
    const path = svgElement("path", {
      d: `M ${source.x} ${source.y} Q ${control.x} ${control.y} ${target.x} ${target.y}`,
      class: "relation-path",
      "data-relation-type": relation.type,
      stroke: gameData.relationMeta[relation.type].color,
      "stroke-width": 1.2 + relation.weight * 0.25,
      "data-source": relation.source,
      "data-target": relation.target,
      "data-reason": relation.reason,
      tabindex: 0,
      role: "button",
      "aria-label": `${cardById.get(relation.source).name} 与 ${cardById.get(relation.target).name}：${relation.reason}`,
    });
    bindRelationTooltip(path, relation);
    relationLayer.appendChild(path);
  });
  svg.appendChild(relationLayer);

  const nodeLayer = svgElement("g", { class: "node-layer" });
  positions.forEach((position, id) => {
    const card = cardById.get(id);
    const group = svgElement("g", {
      class: "network-node",
      transform: `translate(${position.x} ${position.y})`,
      "data-node-id": id,
      tabindex: 0,
      role: "button",
      "aria-label": `${card.name}，点击高亮相关示例关系`,
      "aria-pressed": "false",
    });
    const width = position.side === "left" || position.side === "right" ? 156 : 166;
    const height = 54;
    group.appendChild(
      svgElement("rect", {
        x: -width / 2,
        y: -height / 2,
        width,
        height,
        rx: 15,
        fill: gameData.categoryMeta[card.type].color,
      }),
    );
    const text = svgElement("text", {
      x: 0,
      y: 1,
      "text-anchor": "middle",
      "dominant-baseline": "middle",
    });
    text.textContent = `${card.emoji} ${card.name}`;
    group.appendChild(text);
    group.addEventListener("click", () => toggleNodeHighlight(id));
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleNodeHighlight(id);
      }
    });
    nodeLayer.appendChild(group);
  });
  svg.appendChild(nodeLayer);
}

function curveControlPoint(source, target, index) {
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
}

function bindRelationTooltip(path, relation) {
  const tooltip = document.querySelector("#network-tooltip");
  const source = cardById.get(relation.source);
  const target = cardById.get(relation.target);

  const show = (event) => {
    path.classList.add("is-hovered");
    const wrapperRect = document.querySelector(".network-canvas-wrap").getBoundingClientRect();
    const clientX = event.clientX || wrapperRect.left + wrapperRect.width / 2;
    const clientY = event.clientY || wrapperRect.top + wrapperRect.height / 2;
    tooltip.innerHTML = `<b>${source.emoji} ${source.name} × ${target.emoji} ${target.name}</b>${relation.reason}`;
    tooltip.style.left = `${clientX - wrapperRect.left}px`;
    tooltip.style.top = `${clientY - wrapperRect.top}px`;
    tooltip.classList.add("visible");
  };

  const hide = () => {
    path.classList.remove("is-hovered");
    if (path.getAttribute("aria-pressed") === "true") return;
    tooltip.classList.remove("visible");
  };

  path.addEventListener("pointerenter", show);
  path.addEventListener("pointermove", show);
  path.addEventListener("pointerleave", hide);
  path.addEventListener("focus", show);
  path.addEventListener("blur", hide);
  path.setAttribute("aria-pressed", "false");
  path.addEventListener("click", (event) => {
    const wasPressed = path.getAttribute("aria-pressed") === "true";
    document.querySelectorAll(".relation-path[aria-pressed='true']").forEach((item) => {
      item.setAttribute("aria-pressed", "false");
      item.classList.remove("is-hovered");
    });
    path.setAttribute("aria-pressed", String(!wasPressed));
    if (wasPressed) {
      tooltip.classList.remove("visible");
    } else {
      show(event);
    }
  });
}

function updateRelationVisibility() {
  document.querySelectorAll(".relation-path").forEach((path) => {
    const visible = activeRelationType === "all" || path.dataset.relationType === activeRelationType;
    path.style.display = visible ? "" : "none";
  });
  if (selectedNodeId) applyNodeHighlight();
}

function toggleNodeHighlight(id) {
  selectedNodeId = selectedNodeId === id ? null : id;
  document.querySelectorAll(".network-node").forEach((node) => {
    const selected = node.dataset.nodeId === selectedNodeId;
    node.classList.toggle("is-selected", selected);
    node.setAttribute("aria-pressed", String(selected));
  });
  applyNodeHighlight();
}

function applyNodeHighlight() {
  document.querySelectorAll(".relation-path").forEach((path) => {
    const connected = !selectedNodeId || path.dataset.source === selectedNodeId || path.dataset.target === selectedNodeId;
    path.classList.toggle("is-node-active", Boolean(selectedNodeId && connected));
    path.classList.toggle("is-muted", Boolean(selectedNodeId && !connected));
  });
}

function bindNetworkDownload() {
  document.querySelector("#download-network").addEventListener("click", () => {
    const svg = document.querySelector("#relationship-network").cloneNode(true);
    svg.setAttribute("xmlns", SVG_NS);
    svg.querySelectorAll(".relation-path").forEach((path) => {
      path.setAttribute("fill", "none");
      path.setAttribute("opacity", "0.34");
      path.setAttribute("stroke-linecap", "round");
    });
    svg.querySelectorAll(".network-node text").forEach((text) => {
      text.setAttribute("fill", "#17152f");
      text.setAttribute("font-family", "Microsoft YaHei, sans-serif");
      text.setAttribute("font-size", "16");
      text.setAttribute("font-weight", "800");
    });
    const background = svgElement("rect", { width: 1200, height: 820, fill: "#111025" });
    svg.insertBefore(background, svg.firstChild.nextSibling);

    const content = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([content], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "迷你创业桌游-四元素关系网.svg";
    anchor.click();
    URL.revokeObjectURL(url);
  });
}

function bindStartupLab() {
  document.querySelector("#shuffle-startup").addEventListener("click", () => {
    const picks = STARTUP_CARD_ORDER.map((type) => {
      const cards = networkCards(type);
      return cards[Math.floor(Math.random() * cards.length)].id;
    });
    renderStartup(picks);
  });
}

function renderStartup(cardIds) {
  const selected = cardIds
    .map((id) => cardById.get(id))
    .sort((a, b) => STARTUP_CARD_ORDER.indexOf(a.type) - STARTUP_CARD_ORDER.indexOf(b.type));
  const orderedCardIds = selected.map((card) => card.id);
  const selectedByType = new Map(selected.map((card) => [card.type, card]));
  const pairs = STARTUP_PAIR_TYPES.map(([typeA, typeB]) => {
    const a = selectedByType.get(typeA);
    const b = selectedByType.get(typeB);
    return { a, b, relation: relationByPair.get(pairKey(a.id, b.id)) };
  });
  const degree = new Map(orderedCardIds.map((id) => [id, 0]));

  pairs.forEach(({ a, b, relation }) => {
    if (!relation) return;
    degree.set(a.id, degree.get(a.id) + 1);
    degree.set(b.id, degree.get(b.id) + 1);
  });

  const edgeCount = pairs.filter((pair) => pair.relation).length;
  const hasIsland = [...degree.values()].some((count) => count === 0);
  const isConnected = projectIsConnected(orderedCardIds, pairs);
  const status = evaluateStatus(edgeCount, isConnected, hasIsland);
  const panel = document.querySelector("#startup-result");

  panel.innerHTML = `
    <div class="startup-panel">
      <div class="startup-panel-header">
        <span class="startup-status ${status.className}">${status.label}</span>
        <span class="startup-score">${edgeCount}/4 条相邻关系 · 融资 ${status.funding}</span>
      </div>
      <div class="startup-cards">
        ${selected
          .map((card) => {
            const meta = gameData.categoryMeta[card.type];
            return `
              <article
                class="startup-mini-card ${card.type}"
                style="--mini-accent:${meta.color};--mini-halo:${card.accent}"
              >
                ${renderStartupEdges(card, selectedByType)}
                <small>${meta.label}</small>
                <div class="startup-emoji" aria-hidden="true"><i></i><span>${card.emoji}</span></div>
                <b>${card.name}</b>
              </article>
            `;
          })
          .join("")}
      </div>
      <p class="startup-story">
        为 <strong>${selected[0].name}</strong> 解决“<strong>${selected[2].name}</strong>”，
        发明 <strong>${selected[3].name}</strong>，再用 <strong>${selected[1].name}</strong> 让大家知道。
      </p>
      <div class="startup-links">
        ${pairs
          .map(
            ({ a, b, relation }) => `
              <div class="startup-link ${relation ? "" : "missing"}" title="${relation?.reason || "当前原型中没有已定义关系"}">
                <b>${a.name} × ${b.name}</b>
                <span>${relation ? "✓" : "×"}</span>
              </div>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderStartupEdges(card, selectedByType) {
  return CARD_EDGE_CONFIG[card.type]
    .map(({ neighborType, side }) => {
      const neighbor = selectedByType.get(neighborType);
      const relation = relationByPair.get(pairKey(card.id, neighbor.id));
      if (!relation) return "";
      return `
        <div
          class="project-edge edge-${side}"
          style="--edge-color:${neighbor.accent}"
          title="${relation.reason}"
          aria-hidden="true"
        ></div>
      `;
    })
    .join("");
}

function projectIsConnected(cardIds, pairs) {
  if (!cardIds.length) return false;
  const adjacency = new Map(cardIds.map((id) => [id, new Set()]));
  pairs.forEach(({ a, b, relation }) => {
    if (!relation) return;
    adjacency.get(a.id).add(b.id);
    adjacency.get(b.id).add(a.id);
  });
  const visited = new Set();
  const queue = [cardIds[0]];
  while (queue.length) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    adjacency.get(id).forEach((neighbor) => {
      if (!visited.has(neighbor)) queue.push(neighbor);
    });
  }
  return visited.size === cardIds.length;
}

function evaluateStatus(edgeCount, isConnected, hasIsland) {
  if (edgeCount === 4) {
    return { label: "强强合作 · 四边连通", className: "great", funding: "200 万 / 人" };
  }
  if (edgeCount === 3 && isConnected && !hasIsland) {
    return { label: "创业成立 · T 字连通", className: "partial", funding: "100 万 / 人" };
  }
  return { label: "创业失败 · 存在孤岛", className: "fail", funding: "0" };
}
