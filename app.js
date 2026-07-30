const SVG_NS = "http://www.w3.org/2000/svg";

let gameData;
let cardById;
let relationByPair;
let cardDegreeById;
let cardConnectorById;
let activeRelationType = "all";
let selectedNodeId = null;
let selectedRelationKey = null;
let editorChangeLog = [];
const EDITOR_STORAGE_KEY = "startup-boardgame-relationship-editor-v3";
const STARTUP_CARD_ORDER = ["user", "promotion", "need", "product"];
const CARD_LIBRARY_ORDER = ["user", "need", "product", "promotion"];
const RELATION_FILTER_ORDER = ["user-need", "need-product", "product-promotion", "user-promotion"];
const CARD_TYPE_LABELS = {
  user: "用户卡",
  promotion: "传播卡",
  need: "需求卡",
  product: "产品卡",
};
const CARD_EDGE_CONFIG = {
  user: [
    { neighborType: "promotion", side: "right", mode: "receive" },
    { neighborType: "need", side: "bottom", mode: "own" },
  ],
  promotion: [
    { neighborType: "user", side: "left", mode: "own" },
    { neighborType: "product", side: "bottom", mode: "receive" },
  ],
  need: [
    { neighborType: "user", side: "top", mode: "receive" },
    { neighborType: "product", side: "right", mode: "own" },
  ],
  product: [
    { neighborType: "promotion", side: "top", mode: "own" },
    { neighborType: "need", side: "left", mode: "receive" },
  ],
};
const CONNECTOR_SHAPES = [
  { key: "line", name: "直线", markup: '<path d="M5 20h30" fill="none" />' },
  { key: "square", name: "正方形", markup: '<rect x="5" y="5" width="30" height="30" />' },
  { key: "circle", name: "圆", markup: '<circle cx="20" cy="20" r="15" />' },
  { key: "diamond", name: "菱形", markup: '<path d="M20 5 35 20 20 35 5 20Z" />' },
  { key: "triangle", name: "等边三角形", markup: '<path d="M20 5 34 31 6 31Z" />' },
  { key: "hexagon", name: "六边形", markup: '<path d="M20 5 33 12.5 33 27.5 20 35 7 27.5 7 12.5Z" />' },
  { key: "pentagon", name: "五边形", markup: '<path d="M20 5 34.3 15.4 28.8 32.2 11.2 32.2 5.7 15.4Z" />' },
  { key: "star", name: "五角星", markup: '<path d="M20 4.5 24.6 14.8 35.7 16 27.4 23.5 29.7 34.5 20 28.9 10.3 34.5 12.6 23.5 4.3 16 15.4 14.8Z" />' },
  { key: "ellipse-horizontal", name: "横椭圆", markup: '<ellipse cx="20" cy="20" rx="15" ry="10" />' },
  { key: "ellipse-vertical", name: "竖椭圆", markup: '<ellipse cx="20" cy="20" rx="10" ry="15" />' },
];

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const response = await fetch("./data/game-data.json");
    if (!response.ok) throw new Error(`数据加载失败：${response.status}`);
    const sourceData = await response.json();
    loadEditorWorkspace(sourceData);
    rebuildIndexes();
    renderSiteMetrics();
    bindStartupDemo();

    renderCardLibrary();
    bindCardFilters();
    renderRelationFilters();
    renderRelationshipNetwork();
    bindNetworkDownload();
    bindRelationshipEditor();
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

function normalizeEditorData(sourceData) {
  const normalized = JSON.parse(JSON.stringify(sourceData));
  Object.values(normalized.cards).forEach((cards) => {
    cards.forEach((card) => {
      card.confirmed = Boolean(card.confirmed);
    });
  });
  normalized.relations.forEach((relation) => {
    relation.confirmed = Boolean(relation.confirmed);
  });
  normalized.meta.networkCardCount = Object.values(normalized.cards).flat().length;
  normalized.meta.relationCount = normalized.relations.length;
  return normalized;
}

function loadEditorWorkspace(sourceData) {
  gameData = normalizeEditorData(sourceData);
  try {
    const saved = JSON.parse(localStorage.getItem(EDITOR_STORAGE_KEY));
    if (saved?.gameData?.cards && Array.isArray(saved.gameData.relations)) {
      gameData = normalizeEditorData(saved.gameData);
      editorChangeLog = Array.isArray(saved.changeLog) ? saved.changeLog : [];
    }
  } catch (error) {
    console.warn("无法读取关系编辑草稿，将使用原始数据。", error);
  }

  const latestNotes = new Map(
    Object.values(sourceData.cards)
      .flat()
      .map((card) => [card.id, card.note]),
  );
  Object.values(gameData.cards)
    .flat()
    .forEach((card) => {
      if (latestNotes.has(card.id)) card.note = latestNotes.get(card.id);
    });
}

function rebuildIndexes() {
  cardById = buildCardIndex(gameData.cards);
  relationByPair = buildRelationIndex(gameData.relations);
  cardDegreeById = new Map([...cardById.keys()].map((id) => [id, 0]));
  gameData.relations.forEach((relation) => {
    cardDegreeById.set(relation.source, (cardDegreeById.get(relation.source) || 0) + 1);
    cardDegreeById.set(relation.target, (cardDegreeById.get(relation.target) || 0) + 1);
  });
  cardConnectorById = new Map();
  STARTUP_CARD_ORDER.forEach((type) => {
    rankedCards(type).forEach((card, index) => {
      cardConnectorById.set(card.id, {
        ...CONNECTOR_SHAPES[index % CONNECTOR_SHAPES.length],
        order: index,
      });
    });
  });
  gameData.meta.networkCardCount = cardById.size;
  gameData.meta.relationCount = gameData.relations.length;
}

function rankedCards(type) {
  return gameData.cards[type]
    .map((card, sourceIndex) => ({ card, sourceIndex }))
    .sort(
      (a, b) =>
        (cardDegreeById?.get(b.card.id) || 0) - (cardDegreeById?.get(a.card.id) || 0) ||
        a.sourceIndex - b.sourceIndex,
    )
    .map(({ card }) => card);
}

function persistEditorWorkspace() {
  try {
    localStorage.setItem(
      EDITOR_STORAGE_KEY,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        gameData,
        changeLog: editorChangeLog,
      }),
    );
    setEditorMessage("草稿已自动保存在当前浏览器。", "success");
  } catch (error) {
    console.warn("无法保存关系编辑草稿。", error);
    setEditorMessage("浏览器无法保存草稿，请立即导出 JSON。", "error");
  }
}

function renderCardLibrary(filter = "all") {
  const library = document.querySelector("#card-library");
  const cards = CARD_LIBRARY_ORDER.flatMap((type) =>
    rankedCards(type).map((card) => ({ ...card, type })),
  ).filter((card) => filter === "all" || card.type === filter);

  library.innerHTML = cards
    .map((card, index) => {
      const visibleNote = /[\p{L}\p{N}]/u.test(card.note || "") ? card.note : "&nbsp;";
      const startsCategory = index === 0 || cards[index - 1].type !== card.type;
      const typeAtBottom = card.type === "need" || card.type === "product";
      const typeLabel = `
        <div class="card-topline${typeAtBottom ? " card-bottomline" : ""}">
          <span>${CARD_TYPE_LABELS[card.type]}</span>
        </div>
      `;
      return `
        <article
          class="library-card${startsCategory ? " category-start" : ""}${typeAtBottom ? " type-label-bottom" : ""}"
          data-type="${card.type}"
          data-card-id="${card.id}"
          style="animation-delay:${index * 20}ms"
        >
          ${renderLibraryEdges(card)}
          ${typeAtBottom ? "" : typeLabel}
          <h3 class="card-name">${card.name}</h3>
          <div class="card-emoji" aria-hidden="true"><span>${card.emoji}</span></div>
          <p class="card-question">${visibleNote}</p>
          ${typeAtBottom ? typeLabel : ""}
        </article>
      `;
    })
    .join("");
}

function renderLibraryEdges(card) {
  return CARD_EDGE_CONFIG[card.type]
    .map(({ neighborType, side, mode }) => {
      if (mode === "own") {
        const shape = cardConnectorById.get(card.id) || CONNECTOR_SHAPES[0];
        return `
          <div
            class="card-edge edge-${side} edge-own"
            title="本卡接口：${shape.name}"
            aria-hidden="true"
          >
            ${renderConnectorShape(shape, side)}
          </div>
        `;
      }

      const matches = gameData.relations
        .filter((relation) => relation.source === card.id || relation.target === card.id)
        .map((relation) => {
          const otherId = relation.source === card.id ? relation.target : relation.source;
          return cardById.get(otherId);
        })
        .filter((otherCard) => otherCard?.type === neighborType)
        .sort(
          (a, b) =>
            (cardConnectorById.get(a.id)?.order ?? 99) -
            (cardConnectorById.get(b.id)?.order ?? 99),
        );
      if (!matches.length) return "";
      const names = matches.map((match) => match.name).join("、");
      return `
        <div
          class="card-edge edge-${side} edge-receive"
          title="可匹配：${names}"
          aria-hidden="true"
        >
          ${matches
            .map((match) => renderConnectorShape(cardConnectorById.get(match.id) || CONNECTOR_SHAPES[0], side))
            .join("")}
        </div>
      `;
    })
    .join("");
}

function renderConnectorShape(shape, side) {
  const shapeTransform =
    side === "top" || side === "bottom" ? ' transform="rotate(90 20 20)"' : "";
  const viewBoxes = {
    right: "0 0 20 40",
    left: "20 0 20 40",
    bottom: "0 0 40 20",
    top: "0 20 40 20",
  };
  return `
    <svg
      class="connector-shape"
      data-shape="${shape.key}"
      viewBox="${viewBoxes[side]}"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="${shape.name}的一半"
    >
      <g${shapeTransform}>${shape.markup}</g>
    </svg>
  `;
}

function renderSiteMetrics() {
  const cardCount = cardById.size;
  const relationCount = gameData.relations.length;
  const categoryCount = Object.keys(gameData.cards).length;
  const relationTypeCount = new Set(gameData.relations.map((relation) => relation.type)).size;
  const metrics = {
    "card-count": cardCount,
    "category-count": categoryCount,
    "relation-type-count": relationTypeCount,
    "relation-count": relationCount,
    "player-range": gameData.meta.playerRange || "3–7",
  };
  document.querySelectorAll("[data-metric]").forEach((element) => {
    const value = metrics[element.dataset.metric];
    if (value !== undefined) element.textContent = value;
  });
  document.querySelectorAll("[data-card-filter-count]").forEach((button) => {
    const type = button.dataset.cardFilterCount;
    const count = type === "all" ? cardCount : gameData.cards[type]?.length || 0;
    const label = type === "all" ? "全部" : gameData.categoryMeta[type]?.label || type;
    button.textContent = `${label} ${count}`;
  });
}

function randomStartupCards() {
  return STARTUP_CARD_ORDER.map((type) => {
    const cards = gameData.cards[type];
    return { ...cards[Math.floor(Math.random() * cards.length)], type };
  });
}

function renderStartupCard(card) {
  const typeAtBottom = card.type === "need" || card.type === "product";
  const typeLabel = `
    <div class="card-topline${typeAtBottom ? " card-bottomline" : ""}">
      <span>${CARD_TYPE_LABELS[card.type]}</span>
    </div>
  `;
  return `
    <article class="library-card startup-card${typeAtBottom ? " type-label-bottom" : ""}" data-type="${card.type}">
      ${renderLibraryEdges(card)}
      ${typeAtBottom ? "" : typeLabel}
      <h3 class="card-name">${card.name}</h3>
      <div class="card-emoji" aria-hidden="true"><span>${card.emoji}</span></div>
      <p class="card-question">${gameData.categoryMeta[card.type].question}</p>
      ${typeAtBottom ? typeLabel : ""}
    </article>
  `;
}

function evaluateStartup(cards) {
  const byType = new Map(cards.map((card) => [card.type, card]));
  const pairs = [
    ["user", "promotion"],
    ["user", "need"],
    ["promotion", "product"],
    ["need", "product"],
  ].map(([sourceType, targetType]) => {
    const source = byType.get(sourceType);
    const target = byType.get(targetType);
    return {
      source,
      target,
      matched: relationByPair.has(pairKey(source.id, target.id)),
    };
  });
  return { pairs, matchCount: pairs.filter((pair) => pair.matched).length };
}

function renderStartupDemo(cards) {
  const board = document.querySelector("#startup-board");
  const matchList = document.querySelector("#startup-match-list");
  const verdict = document.querySelector("#startup-verdict");
  const funding = document.querySelector("#startup-funding");
  const result = evaluateStartup(cards);

  board.innerHTML = cards.map(renderStartupCard).join("");
  matchList.innerHTML = result.pairs
    .map(
      ({ source, target, matched }) => `
        <div class="startup-match ${matched ? "is-match" : "is-miss"}">
          <span class="match-icon" aria-hidden="true">${matched ? "✓" : "×"}</span>
          <span>${gameData.categoryMeta[source.type].label} × ${gameData.categoryMeta[target.type].label}</span>
          <b>${matched ? "匹配" : "不匹配"}</b>
        </div>
      `,
    )
    .join("");

  if (result.matchCount === 4) {
    verdict.textContent = "最佳生意，四条关系全部成立！";
    funding.innerHTML = "<span>融资</span><strong>200 万</strong><em>最佳</em>";
    funding.className = "startup-funding is-perfect";
  } else if (result.matchCount === 3) {
    verdict.textContent = "生意能成，三条关系成立。";
    funding.innerHTML = "<span>融资</span><strong>100 万</strong>";
    funding.className = "startup-funding is-funded";
  } else {
    verdict.textContent = `生意没成，只有 ${result.matchCount} 条关系成立。`;
    funding.innerHTML = "<span>融资</span><strong>0</strong>";
    funding.className = "startup-funding is-failed";
  }
}

function bindStartupDemo() {
  const shuffleButton = document.querySelector("#shuffle-startup");
  const shuffle = () => {
    shuffleButton.classList.remove("is-spinning");
    void shuffleButton.offsetWidth;
    shuffleButton.classList.add("is-spinning");
    renderStartupDemo(randomStartupCards());
  };
  shuffleButton.addEventListener("click", shuffle);
  renderStartupDemo(randomStartupCards());
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
    `<button class="relation-chip${activeRelationType === "all" ? " active" : ""}" type="button" data-relation-filter="all">全部关系</button>`,
    ...RELATION_FILTER_ORDER
      .filter((key) => relationCounts[key] && gameData.relationMeta[key])
      .map(
      (key) =>
        `<button class="relation-chip${activeRelationType === key ? " active" : ""}" type="button" data-relation-filter="${key}" style="--chip-color:${gameData.relationMeta[key].color}">${gameData.relationMeta[key].label} · ${relationCounts[key]}</button>`,
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

function relationshipMapCards(type) {
  return rankedCards(type);
}

function networkPositions() {
  const spread = (start, end, count) =>
    Array.from({ length: count }, (_, index) => (count === 1 ? (start + end) / 2 : start + ((end - start) * index) / (count - 1)));
  const userHorizontal = spread(110, 1290, gameData.cards.user.length);
  const productHorizontal = spread(110, 1290, gameData.cards.product.length);
  const needVertical = spread(116, 864, gameData.cards.need.length);
  const promotionVertical = spread(116, 864, gameData.cards.promotion.length);
  const positions = new Map();

  relationshipMapCards("user").forEach((card, index) => positions.set(card.id, { x: userHorizontal[index], y: 68, side: "top" }));
  relationshipMapCards("need").forEach((card, index) => positions.set(card.id, { x: 72, y: needVertical[index], side: "left" }));
  relationshipMapCards("product").forEach((card, index) => positions.set(card.id, { x: productHorizontal[index], y: 912, side: "bottom" }));
  relationshipMapCards("promotion").forEach((card, index) => positions.set(card.id, { x: 1328, y: promotionVertical[index], side: "right" }));

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
  svg.firstChild.textContent = `${cardById.size} 张用户、传播、需求、产品卡牌之间的多对多关系网络`;

  const border = svgElement("rect", {
    x: 72,
    y: 68,
    width: 1256,
    height: 844,
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
      class: `relation-path${relation.confirmed ? " is-confirmed" : ""}${pairKey(relation.source, relation.target) === selectedRelationKey ? " is-selected" : ""}`,
      "data-relation-type": relation.type,
      stroke: gameData.relationMeta[relation.type].color,
      "stroke-width": 1.5 + relation.weight * 0.2,
      "data-source": relation.source,
      "data-target": relation.target,
      "data-relation-key": pairKey(relation.source, relation.target),
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
      "data-card-type": card.type,
      tabindex: 0,
      role: "button",
      "aria-label": `${card.name}，${card.confirmed ? "已确认" : "未确认"}，点击编辑并高亮相关关系`,
      "aria-pressed": String(id === selectedNodeId),
    });
    group.classList.toggle("is-confirmed", card.confirmed);
    group.classList.toggle("is-selected", id === selectedNodeId);
    const width = position.side === "left" || position.side === "right" ? 132 : 116;
    const height = 44;
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
    const title = svgElement("title");
    title.textContent = `${card.emoji} ${card.name} · ${card.confirmed ? "已确认" : "待确认"}`;
    group.appendChild(title);
    const text = svgElement("text", {
      x: 0,
      y: 1,
      "text-anchor": "middle",
      "dominant-baseline": "middle",
    });
    const shortName = card.name.length > 6 ? `${card.name.slice(0, 6)}…` : card.name;
    text.textContent = `${card.emoji} ${shortName}`;
    group.appendChild(text);
    group.addEventListener("click", () => {
      selectCardForEditor(id);
      toggleNodeHighlight(id);
    });
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectCardForEditor(id);
        toggleNodeHighlight(id);
      }
    });
    nodeLayer.appendChild(group);
  });
  svg.appendChild(nodeLayer);
  updateNetworkCaption();
}

function curveControlPoint(source, target, index) {
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
  const activate = (event) => {
    const wasPressed = path.getAttribute("aria-pressed") === "true";
    selectedRelationKey = pairKey(relation.source, relation.target);
    selectRelationForEditor(selectedRelationKey);
    document.querySelectorAll(".relation-path[aria-pressed='true']").forEach((item) => {
      item.setAttribute("aria-pressed", "false");
      item.classList.remove("is-hovered");
    });
    document.querySelectorAll(".relation-path").forEach((item) => {
      item.classList.toggle("is-selected", item.dataset.relationKey === selectedRelationKey);
    });
    path.setAttribute("aria-pressed", String(!wasPressed));
    if (wasPressed) {
      tooltip.classList.remove("visible");
    } else {
      show(event);
    }
  };
  path.addEventListener("click", activate);
  path.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate(event);
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
      path.setAttribute("opacity", path.classList.contains("is-confirmed") ? "0.8" : "0.34");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-dasharray", path.classList.contains("is-confirmed") ? "none" : "7 8");
    });
    svg.querySelectorAll(".network-node").forEach((node) => {
      const rect = node.querySelector("rect");
      rect.setAttribute("stroke", "rgba(255,255,255,.78)");
      rect.setAttribute("stroke-width", "2");
      rect.setAttribute("stroke-dasharray", node.classList.contains("is-confirmed") ? "none" : "7 5");
    });
    svg.querySelectorAll(".network-node text").forEach((text) => {
      text.setAttribute("fill", "#17152f");
      text.setAttribute("font-family", "Microsoft YaHei, sans-serif");
      text.setAttribute("font-size", "13");
      text.setAttribute("font-weight", "800");
    });
    const background = svgElement("rect", { width: 1400, height: 980, fill: "#111025" });
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

function bindRelationshipEditor() {
  document.querySelector("#new-card").addEventListener("click", showNewCardForm);
  document.querySelector("#new-relation").addEventListener("click", showNewRelationForm);
  document.querySelector("#card-editor-form").addEventListener("submit", saveCardFromEditor);
  document.querySelector("#relation-editor-form").addEventListener("submit", saveRelationFromEditor);
  document.querySelector("#toggle-card-confirmation").addEventListener("click", toggleCardConfirmation);
  document.querySelector("#toggle-relation-confirmation").addEventListener("click", toggleRelationConfirmation);
  document.querySelector("#delete-card").addEventListener("click", deleteCardFromEditor);
  document.querySelector("#delete-relation").addEventListener("click", deleteRelationFromEditor);
  document.querySelector("#relation-source").addEventListener("change", updateRelationTypePreview);
  document.querySelector("#relation-target").addEventListener("change", updateRelationTypePreview);
  document.querySelector("#export-game-json").addEventListener("click", exportEditedGameData);
  document.querySelector("#export-change-log").addEventListener("click", exportEditorChangeLog);
  renderChangeLogPreview();
  updateNetworkCaption();
}

function selectCardForEditor(id) {
  const card = cardById.get(id);
  if (!card) return;
  selectedRelationKey = null;
  document.querySelector("#editor-empty").hidden = true;
  document.querySelector("#relation-editor-form").hidden = true;
  const form = document.querySelector("#card-editor-form");
  form.hidden = false;
  form.dataset.confirmed = String(card.confirmed);
  document.querySelector("#card-original-id").value = card.id;
  document.querySelector("#card-id").value = card.id;
  document.querySelector("#card-type").value = card.type;
  document.querySelector("#card-name-input").value = card.name;
  document.querySelector("#card-emoji-input").value = card.emoji;
  document.querySelector("#card-note-input").value = card.note;
  document.querySelector("#card-accent-name").value = card.accentName;
  document.querySelector("#card-accent").value = card.accent;
  document.querySelector("#card-network").checked = Boolean(card.network);
  const deleteButton = document.querySelector("#delete-card");
  deleteButton.disabled = false;
  deleteButton.dataset.deleteKey = "";
  deleteButton.textContent = "删除";
  updateConfirmationControls("card", card.confirmed);
  setEditorMessage(`正在检查：${card.name}`);
}

function selectRelationForEditor(key) {
  const relation = gameData.relations.find((item) => pairKey(item.source, item.target) === key);
  if (!relation) return;
  selectedRelationKey = key;
  document.querySelector("#editor-empty").hidden = true;
  document.querySelector("#card-editor-form").hidden = true;
  const form = document.querySelector("#relation-editor-form");
  form.hidden = false;
  form.dataset.confirmed = String(relation.confirmed);
  document.querySelector("#relation-original-key").value = key;
  populateRelationCardOptions(relation.source, relation.target);
  document.querySelector("#relation-weight").value = relation.weight;
  document.querySelector("#relation-reason").value = relation.reason;
  const deleteButton = document.querySelector("#delete-relation");
  deleteButton.disabled = false;
  deleteButton.dataset.deleteKey = "";
  deleteButton.textContent = "删除";
  updateRelationTypePreview();
  updateConfirmationControls("relation", relation.confirmed);
  const source = cardById.get(relation.source);
  const target = cardById.get(relation.target);
  setEditorMessage(`正在检查：${source.name} × ${target.name}`);
}

function showNewCardForm() {
  selectedNodeId = null;
  selectedRelationKey = null;
  document.querySelector("#editor-empty").hidden = true;
  document.querySelector("#relation-editor-form").hidden = true;
  const form = document.querySelector("#card-editor-form");
  form.hidden = false;
  form.reset();
  form.dataset.confirmed = "false";
  document.querySelector("#card-original-id").value = "";
  document.querySelector("#card-id").value = `new-card-${Date.now().toString(36)}`;
  document.querySelector("#card-type").value = "user";
  document.querySelector("#card-emoji-input").value = "✨";
  document.querySelector("#card-accent-name").value = "自定义";
  document.querySelector("#card-accent").value = "#888888";
  const deleteButton = document.querySelector("#delete-card");
  deleteButton.disabled = true;
  deleteButton.dataset.deleteKey = "";
  deleteButton.textContent = "删除";
  updateConfirmationControls("card", false);
  setEditorMessage("新卡牌默认处于未确认状态。");
}

function showNewRelationForm() {
  selectedRelationKey = null;
  document.querySelector("#editor-empty").hidden = true;
  document.querySelector("#card-editor-form").hidden = true;
  const form = document.querySelector("#relation-editor-form");
  form.hidden = false;
  form.reset();
  form.dataset.confirmed = "false";
  document.querySelector("#relation-original-key").value = "";
  populateRelationCardOptions(selectedNodeId || "", "");
  document.querySelector("#relation-weight").value = "3";
  const deleteButton = document.querySelector("#delete-relation");
  deleteButton.disabled = true;
  deleteButton.dataset.deleteKey = "";
  deleteButton.textContent = "删除";
  updateRelationTypePreview();
  updateConfirmationControls("relation", false);
  setEditorMessage("新关系默认处于未确认状态。");
}

function populateRelationCardOptions(sourceId = "", targetId = "") {
  const sourceSelect = document.querySelector("#relation-source");
  const targetSelect = document.querySelector("#relation-target");
  const groups = STARTUP_CARD_ORDER.flatMap((type) =>
    gameData.cards[type].map((card) => ({
      id: card.id,
      label: `${gameData.categoryMeta[type].label} · ${card.emoji} ${card.name}`,
    })),
  );
  [sourceSelect, targetSelect].forEach((select) => {
    select.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "请选择卡牌";
    select.appendChild(placeholder);
    groups.forEach((card) => {
      const option = document.createElement("option");
      option.value = card.id;
      option.textContent = card.label;
      select.appendChild(option);
    });
  });
  sourceSelect.value = sourceId;
  targetSelect.value = targetId;
}

function relationTypeForCards(sourceId, targetId) {
  const source = cardById.get(sourceId);
  const target = cardById.get(targetId);
  if (!source || !target || source.id === target.id) return null;
  const types = new Set([source.type, target.type]);
  if (types.has("user") && types.has("promotion")) return "user-promotion";
  if (types.has("user") && types.has("need")) return "user-need";
  if (types.has("promotion") && types.has("product")) return "product-promotion";
  if (types.has("need") && types.has("product")) return "need-product";
  return null;
}

function updateRelationTypePreview() {
  const sourceId = document.querySelector("#relation-source").value;
  const targetId = document.querySelector("#relation-target").value;
  const type = relationTypeForCards(sourceId, targetId);
  const output = document.querySelector("#relation-type-label");
  output.value = type ? gameData.relationMeta[type].label : "不允许的组合";
  output.textContent = output.value;
  output.dataset.valid = String(Boolean(type));
}

function saveCardFromEditor(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const originalId = document.querySelector("#card-original-id").value.trim();
  const id = document.querySelector("#card-id").value.trim();
  const type = document.querySelector("#card-type").value;
  const existingLocation = originalId ? findCardLocation(originalId) : null;

  if (!id || !/^[a-z0-9-]+$/.test(id)) {
    setEditorMessage("卡牌 ID 只能使用小写字母、数字和连字符。", "error");
    return;
  }
  if ((!originalId || id !== originalId) && cardById.has(id)) {
    setEditorMessage(`卡牌 ID“${id}”已经存在。`, "error");
    return;
  }
  if (originalId && !existingLocation) {
    setEditorMessage("原卡牌已不存在，请重新选择。", "error");
    return;
  }

  const previous = existingLocation ? { ...existingLocation.card, type: existingLocation.type } : null;
  const nextCard = {
    ...(existingLocation?.card || {}),
    id,
    name: document.querySelector("#card-name-input").value.trim(),
    emoji: document.querySelector("#card-emoji-input").value.trim(),
    note: document.querySelector("#card-note-input").value.trim(),
    network: document.querySelector("#card-network").checked,
    accentKey: existingLocation?.card.accentKey || `custom-${id}`,
    accentName: document.querySelector("#card-accent-name").value.trim(),
    accent: document.querySelector("#card-accent").value.toUpperCase(),
    confirmed: form.dataset.confirmed === "true",
  };

  if (existingLocation) {
    gameData.cards[existingLocation.type].splice(existingLocation.index, 1);
    gameData.cards[type].push(nextCard);
    if (id !== originalId) {
      gameData.relations.forEach((relation) => {
        if (relation.source === originalId) relation.source = id;
        if (relation.target === originalId) relation.target = id;
      });
      Object.values(gameData.featuredCombos || {}).forEach((combo) => {
        combo.forEach((cardId, index) => {
          if (cardId === originalId) combo[index] = id;
        });
      });
    }
    recordEditorChange("update", "card", id, previous, { ...nextCard, type });
  } else {
    gameData.cards[type].push(nextCard);
    recordEditorChange("create", "card", id, null, { ...nextCard, type });
  }

  rebuildIndexes();
  reconcileRelationsForCard(id);
  refreshAfterEditorMutation();
  selectedNodeId = id;
  selectCardForEditor(id);
  renderRelationshipNetwork();
  setEditorMessage(`卡牌“${nextCard.name}”已保存。`, "success");
}

function saveRelationFromEditor(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const originalKey = document.querySelector("#relation-original-key").value;
  const source = document.querySelector("#relation-source").value;
  const target = document.querySelector("#relation-target").value;
  const type = relationTypeForCards(source, target);
  const newKey = pairKey(source, target);
  const existingIndex = originalKey
    ? gameData.relations.findIndex((relation) => pairKey(relation.source, relation.target) === originalKey)
    : -1;

  if (!type) {
    setEditorMessage("只能创建四类相邻关系，不能连接同类卡或两个对角组合。", "error");
    return;
  }
  if ((!originalKey || newKey !== originalKey) && relationByPair.has(newKey)) {
    setEditorMessage("这两张卡之间已经有关系。", "error");
    return;
  }
  if (originalKey && existingIndex < 0) {
    setEditorMessage("原关系已不存在，请重新选择。", "error");
    return;
  }

  const previous = existingIndex >= 0 ? { ...gameData.relations[existingIndex] } : null;
  const relation = {
    source,
    target,
    type,
    weight: Number(document.querySelector("#relation-weight").value),
    reason: document.querySelector("#relation-reason").value.trim(),
    confirmed: form.dataset.confirmed === "true",
  };

  if (existingIndex >= 0) {
    gameData.relations[existingIndex] = relation;
    recordEditorChange("update", "relation", newKey, previous, relation);
  } else {
    gameData.relations.push(relation);
    recordEditorChange("create", "relation", newKey, null, relation);
  }

  selectedRelationKey = newKey;
  refreshAfterEditorMutation();
  selectRelationForEditor(newKey);
  setEditorMessage("关系已保存。", "success");
}

function toggleCardConfirmation() {
  const form = document.querySelector("#card-editor-form");
  const originalId = document.querySelector("#card-original-id").value;
  if (!originalId) {
    const confirmed = form.dataset.confirmed !== "true";
    form.dataset.confirmed = String(confirmed);
    updateConfirmationControls("card", confirmed);
    setEditorMessage("确认状态将在保存新卡牌时写入。");
    return;
  }
  const location = findCardLocation(originalId);
  if (!location) return;
  const before = { ...location.card, type: location.type };
  location.card.confirmed = !location.card.confirmed;
  recordEditorChange(
    location.card.confirmed ? "confirm" : "unconfirm",
    "card",
    originalId,
    before,
    { ...location.card, type: location.type },
  );
  refreshAfterEditorMutation();
  selectCardForEditor(originalId);
}

function toggleRelationConfirmation() {
  const form = document.querySelector("#relation-editor-form");
  const originalKey = document.querySelector("#relation-original-key").value;
  if (!originalKey) {
    const confirmed = form.dataset.confirmed !== "true";
    form.dataset.confirmed = String(confirmed);
    updateConfirmationControls("relation", confirmed);
    setEditorMessage("确认状态将在保存新关系时写入。");
    return;
  }
  const relation = gameData.relations.find((item) => pairKey(item.source, item.target) === originalKey);
  if (!relation) return;
  const before = { ...relation };
  relation.confirmed = !relation.confirmed;
  recordEditorChange(relation.confirmed ? "confirm" : "unconfirm", "relation", originalKey, before, relation);
  refreshAfterEditorMutation();
  selectRelationForEditor(originalKey);
}

function deleteCardFromEditor() {
  const id = document.querySelector("#card-original-id").value;
  const location = findCardLocation(id);
  if (!location) return;
  const deleteButton = document.querySelector("#delete-card");
  if (deleteButton.dataset.deleteKey !== id) {
    deleteButton.dataset.deleteKey = id;
    deleteButton.textContent = "再次点击确认删除";
    setEditorMessage(`再次点击删除，将移除“${location.card.name}”及全部相关关系。`, "error");
    return;
  }
  const removedRelations = gameData.relations.filter((relation) => relation.source === id || relation.target === id);
  removedRelations.forEach((relation) => {
    recordEditorChange("delete", "relation", pairKey(relation.source, relation.target), relation, null, "随卡牌删除");
  });
  gameData.relations = gameData.relations.filter((relation) => relation.source !== id && relation.target !== id);
  gameData.cards[location.type].splice(location.index, 1);
  Object.entries(gameData.featuredCombos || {}).forEach(([key, combo]) => {
    gameData.featuredCombos[key] = combo.filter((cardId) => cardId !== id);
  });
  recordEditorChange("delete", "card", id, { ...location.card, type: location.type }, null);
  selectedNodeId = null;
  selectedRelationKey = null;
  refreshAfterEditorMutation();
  showEditorEmpty();
  setEditorMessage(`卡牌“${location.card.name}”及 ${removedRelations.length} 条相关关系已删除。`, "success");
}

function deleteRelationFromEditor() {
  const key = document.querySelector("#relation-original-key").value;
  const index = gameData.relations.findIndex((relation) => pairKey(relation.source, relation.target) === key);
  if (index < 0) return;
  const relation = gameData.relations[index];
  const source = cardById.get(relation.source);
  const target = cardById.get(relation.target);
  const deleteButton = document.querySelector("#delete-relation");
  if (deleteButton.dataset.deleteKey !== key) {
    deleteButton.dataset.deleteKey = key;
    deleteButton.textContent = "再次点击确认删除";
    setEditorMessage(`再次点击删除，将移除“${source.name} × ${target.name}”这条关系。`, "error");
    return;
  }
  gameData.relations.splice(index, 1);
  recordEditorChange("delete", "relation", key, relation, null);
  selectedRelationKey = null;
  refreshAfterEditorMutation();
  showEditorEmpty();
  setEditorMessage("关系已删除。", "success");
}

function findCardLocation(id) {
  for (const [type, cards] of Object.entries(gameData.cards)) {
    const index = cards.findIndex((card) => card.id === id);
    if (index >= 0) return { type, index, card: cards[index] };
  }
  return null;
}

function reconcileRelationsForCard(cardId) {
  const reconciled = [];
  gameData.relations.forEach((relation) => {
    if (relation.source !== cardId && relation.target !== cardId) {
      reconciled.push(relation);
      return;
    }
    const type = relationTypeForCards(relation.source, relation.target);
    if (!type) {
      recordEditorChange("delete", "relation", pairKey(relation.source, relation.target), relation, null, "卡牌类别改变后关系不再允许");
      return;
    }
    if (relation.type !== type) {
      const before = { ...relation };
      relation.type = type;
      recordEditorChange("update", "relation", pairKey(relation.source, relation.target), before, relation, "随卡牌类别更新");
    }
    reconciled.push(relation);
  });
  gameData.relations = reconciled;
  rebuildIndexes();
}

function updateConfirmationControls(entity, confirmed) {
  const badge = document.querySelector(`#${entity}-confirmation-badge`);
  const button = document.querySelector(`#toggle-${entity}-confirmation`);
  badge.textContent = confirmed ? "已确认" : "待确认";
  badge.classList.toggle("is-confirmed", confirmed);
  button.textContent = confirmed ? "取消确认" : `确认${entity === "card" ? "卡牌" : "关系"}`;
  document.querySelector(`#${entity}-editor-form`).dataset.confirmed = String(confirmed);
}

function recordEditorChange(action, entityType, entityId, before, after, note = "") {
  editorChangeLog.push({
    location: describeEditorChangeLocation(entityType, entityId, before, after),
    changedTo: describeEditorChangeResult(action, entityType, before, after),
  });
}

function describeEditorChangeLocation(entityType, entityId, before, after) {
  const snapshot = after || before;
  if (entityType === "card") {
    return `卡牌：${snapshot?.name || cardById.get(entityId)?.name || entityId}`;
  }
  if (snapshot?.source && snapshot?.target) {
    const sourceName = cardById.get(snapshot.source)?.name || snapshot.source;
    const targetName = cardById.get(snapshot.target)?.name || snapshot.target;
    return `关系：${sourceName} ↔ ${targetName}`;
  }
  return `关系：${entityId}`;
}

function describeEditorChangeResult(action, entityType, before, after) {
  if (action === "create") return "新增";
  if (action === "delete") return "已删除";
  if (action === "confirm") return "确认状态 → 已确认";
  if (action === "unconfirm") return "确认状态 → 待确认";

  const fieldLabels = entityType === "card"
    ? {
        id: "ID",
        name: "名称",
        type: "类别",
        emoji: "图标",
        note: "说明",
        network: "核心卡池",
        accentName: "颜色名称",
        accent: "颜色",
        confirmed: "确认状态",
      }
    : {
        source: "起点",
        target: "终点",
        type: "关系类型",
        weight: "权重",
        reason: "理由",
        confirmed: "确认状态",
      };

  const changes = Object.entries(fieldLabels)
    .filter(([field]) => before?.[field] !== after?.[field])
    .map(([field, label]) => `${label} → ${formatEditorChangeValue(field, after?.[field])}`);
  return changes.join("；") || "已修改";
}

function formatEditorChangeValue(field, value) {
  if (field === "confirmed") return value ? "已确认" : "待确认";
  if (field === "network") return value ? "纳入" : "不纳入";
  if (field === "source" || field === "target") return cardById.get(value)?.name || value;
  if (value === "") return "空";
  return String(value);
}

function normalizeEditorChange(change) {
  if (typeof change === "string") {
    return { location: change, changedTo: "已修改" };
  }
  if (change.location) {
    return { location: change.location, changedTo: change.changedTo || "已修改" };
  }
  return {
    location: describeEditorChangeLocation(change.entityType, change.entityId, change.before, change.after),
    changedTo: describeEditorChangeResult(change.action, change.entityType, change.before, change.after),
  };
}

function refreshAfterEditorMutation() {
  rebuildIndexes();
  persistEditorWorkspace();
  renderSiteMetrics();
  const activeCardFilter = document.querySelector("[data-card-filter].active")?.dataset.cardFilter || "all";
  renderCardLibrary(activeCardFilter);
  renderRelationFilters();
  renderRelationshipNetwork();
  renderStartupDemo(randomStartupCards());
  renderChangeLogPreview();
}

function showEditorEmpty() {
  document.querySelector("#editor-empty").hidden = false;
  document.querySelector("#card-editor-form").hidden = true;
  document.querySelector("#relation-editor-form").hidden = true;
}

function setEditorMessage(message, state = "") {
  const element = document.querySelector("#editor-message");
  if (!element) return;
  element.textContent = message;
  element.className = `editor-message${state ? ` ${state}` : ""}`;
}

function updateNetworkCaption() {
  const cardCount = cardById?.size || 0;
  const relationCount = gameData?.relations?.length || 0;
  const confirmedCards = cardById ? [...cardById.values()].filter((card) => card.confirmed).length : 0;
  const confirmedRelations = gameData?.relations?.filter((relation) => relation.confirmed).length || 0;
  const values = {
    "#network-card-count": `${cardCount} 张卡`,
    "#network-relation-count": `${relationCount} 条关系`,
    "#network-card-confirmed": `${confirmedCards} 张卡已确认`,
    "#network-relation-confirmed": `${confirmedRelations} 条关系已确认`,
  };
  Object.entries(values).forEach(([selector, value]) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
  });
}

function renderChangeLogPreview() {
  const list = document.querySelector("#change-log-preview");
  if (!list) return;
  list.replaceChildren();
  editorChangeLog
    .slice(-6)
    .reverse()
    .forEach((change) => {
      const normalized = normalizeEditorChange(change);
      const item = document.createElement("li");
      const title = document.createElement("b");
      title.textContent = normalized.location;
      const detail = document.createElement("span");
      detail.textContent = normalized.changedTo;
      item.append(title, detail);
      list.appendChild(item);
    });
  if (!editorChangeLog.length) {
    const empty = document.createElement("li");
    empty.textContent = "还没有修改记录。";
    list.appendChild(empty);
  }
  document.querySelector("#change-log-count").textContent = `${editorChangeLog.length} 条`;
  document.querySelector("#editor-draft-status").textContent = `${editorChangeLog.length} 项修改`;
}

function exportEditedGameData() {
  const exported = JSON.parse(JSON.stringify(gameData));
  exported.meta.exportedAt = new Date().toISOString();
  exported.meta.networkCardCount = Object.values(exported.cards).flat().length;
  exported.meta.relationCount = exported.relations.length;
  downloadJson(exported, "迷你创业桌游-修改后数据.json");
  setEditorMessage("已导出修改后的完整 JSON。", "success");
}

function exportEditorChangeLog() {
  const changes = editorChangeLog.map(normalizeEditorChange);
  downloadJson(
    {
      changeCount: changes.length,
      changes,
    },
    "迷你创业桌游-修改记录.json",
  );
  setEditorMessage("已单独导出修改记录。", "success");
}

function downloadJson(value, filename) {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
