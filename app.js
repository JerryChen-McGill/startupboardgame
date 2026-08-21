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
let currentStartupCards = [];
const EDITOR_STORAGE_KEY = "startup-boardgame-relationship-editor-v3";
const CONNECTOR_LAB_STORAGE_KEY = "startup-boardgame-connector-lab-v1";
const RULEBOOK_STORAGE_KEY = "startup-boardgame-rulebook-v1";
const STARTUP_CARD_ORDER = ["user", "promotion", "need", "product"];
const CARD_LIBRARY_ORDER = ["user", "need", "product", "promotion", "event"];
const RELATION_FILTER_ORDER = ["user-need", "need-product", "product-promotion", "user-promotion"];
const CARD_TYPE_LABELS = {
  user: "用户卡",
  promotion: "传播卡",
  need: "需求卡",
  product: "产品卡",
  event: "事件卡",
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
  { key: "octagon", name: "八边形", markup: '<path d="M12 4h16l8 8v16l-8 8H12l-8-8V12Z" />' },
  { key: "cross", name: "十字形", markup: '<path d="M15 4h10v11h11v10H25v11H15V25H4V15h11Z" />' },
  { key: "small-circle", name: "小圆", markup: '<circle cx="20" cy="20" r="8" />' },
  { key: "heart", name: "心形", markup: '<path d="M20 34 7 21C1 15 5 6 12 6c4 0 6 2 8 5 2-3 4-5 8-5 7 0 11 9 5 15Z" />' },
  { key: "triangle-inverted", name: "倒等边三角形", markup: '<path d="M6 9h28L20 35Z" />' },
];
const DEFAULT_CONNECTOR_SLOT_CONFIG = [
  { shapeKey: "line", color: "black", width: "thick" },
  { shapeKey: "square", color: "black", width: "thick" },
  { shapeKey: "circle", color: "black", width: "thick" },
  { shapeKey: "diamond", color: "black", width: "thin" },
  { shapeKey: "triangle", color: "black", width: "thin" },
  { shapeKey: "hexagon", color: "gray", width: "thin" },
  { shapeKey: "pentagon", color: "gray", width: "thin" },
  { shapeKey: "star", color: "gray", width: "thin" },
  { shapeKey: "ellipse-horizontal", color: "gray", width: "thin" },
  { shapeKey: "ellipse-vertical", color: "gray", width: "thin" },
];
const CONNECTOR_COLORS = { black: "#000", gray: "#888" };
const CONNECTOR_WIDTHS = { thick: 2.6, thin: 1.3 };
let connectorSlotConfig = DEFAULT_CONNECTOR_SLOT_CONFIG.map((slot) => ({ ...slot }));

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const response = await fetch("./data/game-data.json?v=20260803-1");
    if (!response.ok) throw new Error(`数据加载失败：${response.status}`);
    const sourceData = await response.json();
    loadEditorWorkspace(sourceData);
    loadConnectorSlotConfig();
    rebuildIndexes();
    renderSiteMetrics();
    renderCardLibrary();
    bindStartupDemo();
    bindConnectorLab();
    bindStartupBoardSizing();
    bindCardFilters();
    bindCardImageDownload();
    renderRelationFilters();
    renderRelationshipNetwork();
    bindNetworkDownload();
    bindRelationshipEditor();
    bindRulebookEditor();
    // Ensure the small quality grid sits visually after section 03 and before section 04
    try {
      const ensureQualityPlacement = () => {
        const qualityWrap = document.querySelector('.manual-quality-wrap');
        const section04 = document.querySelector('.manual-section-quality');
        if (qualityWrap && section04 && section04.parentNode) {
          section04.parentNode.insertBefore(qualityWrap, section04);
        }
      };
      // Try once immediately and again after a short delay to handle late DOM updates
      ensureQualityPlacement();
      setTimeout(ensureQualityPlacement, 200);
    } catch (e) {
      // no-op
    }
  } catch (error) {
    console.error(error);
    document.querySelector("#card-library").innerHTML =
      '<p class="load-error">卡牌数据暂时无法加载，请刷新页面重试。</p>';
  }
});

function bindRulebookEditor() {
  const pages = [...document.querySelectorAll("[data-rulebook-page]")];
  const editButton = document.querySelector("#edit-rulebook");
  const saveButton = document.querySelector("#save-rulebook");
  const downloadButton = document.querySelector("#download-rulebook");
  const resetButton = document.querySelector("#reset-rulebook");
  const status = document.querySelector("#rulebook-status");
  if (!pages.length || !editButton || !saveButton || !resetButton || !status) return;

  const defaults = pages.map((page) => page.innerHTML);

  const exportRulebookAsImage = (mode = "split") => {
    const book = document.querySelector(".rulebook-book");
    if (!book) return;

    const pages = Array.from(book.querySelectorAll(".rulebook-page")).map((page) => page.cloneNode(true));
    const printWindow = window.open("", "_blank", "width=1400,height=1000");

    if (!printWindow) {
      status.textContent = "下载失败：请允许浏览器弹出新窗口";
      return;
    }

    const pageMarkup = pages
      .map(
        (page) => `
          <article class="rulebook-page-export">
            ${page.innerHTML}
          </article>
        `,
      )
      .join("");

    // choose print CSS based on mode
    const extraPrintCss = mode === "single" ? `
            @page { size: A4 landscape; margin: 10mm; }
            .rulebook-export { display: flex; gap: 0; }
            .rulebook-page-export { width: 50%; box-sizing: border-box; min-height: 0; }
            .rulebook-page-export + .rulebook-page-export { border-left: 1px solid #d9d3c8; }
          ` : `
            @page { size: A4 portrait; margin: 10mm; }
            .rulebook-export { display: block; }
            .rulebook-page-export { width: 100%; box-sizing: border-box; page-break-inside: avoid; page-break-after: always; }
          `;

    printWindow.document.write(`<!doctype html>
      <html lang="zh-CN">
        <head>
          <meta charset="utf-8" />
          <title>迷你创业桌游说明书</title>
          <style>
            ${extraPrintCss}
            html, body {
              margin: 0;
              background: #efeae2;
              color: #282621;
              font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
            }
            body {
              padding: 16px;
            }
            .rulebook-export {
              background: #e7e3da;
              border: 1px solid #cfc9bd;
              box-shadow: 0 24px 55px rgba(23, 21, 47, 0.12);
            }
            .rulebook-page-export {
              position: relative;
              min-height: 1180px;
              padding: clamp(2rem, 4vw, 4.4rem) clamp(1.65rem, 3.8vw, 4.2rem) 2.2rem;
              background: linear-gradient(rgba(255,255,255,0.22), rgba(255,255,255,0.22)), #f8f5ed;
              color: #282621;
              box-sizing: border-box;
              break-inside: avoid;
            }
            .rulebook-page-export + .rulebook-page-export {
              border-left: 1px solid #d9d3c8;
            }
            .manual-title { margin-bottom: 2rem; padding-bottom: 1.35rem; border-bottom: 2px solid #282621; }
            .manual-title p, .manual-title strong { display: block; margin: 0; font-size: 0.72rem; font-weight: 850; letter-spacing: 0.12em; }
            .manual-title p { margin-bottom: 0.5rem; }
            .manual-title h2 { margin: 0 0 0.45rem; font-family: var(--font-display, "Arial Black", sans-serif); font-size: clamp(2.2rem, 4.1vw, 4.6rem); letter-spacing: -0.055em; line-height: 1; }
            .manual-title strong { color: #5a554c; letter-spacing: 0.04em; }
            .manual-facts { display: grid; grid-template-columns: repeat(3, 1fr); margin-bottom: 2rem; padding: 0.8rem 0; border-top: 1px solid #aaa398; border-bottom: 1px solid #aaa398; }
            .manual-facts p { margin: 0; padding: 0 0.8rem; border-right: 1px solid #c7c0b4; font-size: 0.72rem; line-height: 1.45; }
            .manual-facts p:last-child { padding-right: 0; border-right: 0; }
            .manual-facts b { display: block; margin-bottom: 0.1rem; font-size: 0.65rem; letter-spacing: 0.1em; }
            .manual-section { margin-bottom: 1.55rem; }
            .manual-section h3 { display: flex; align-items: baseline; gap: 0.65rem; margin: 0 0 0.55rem; font-size: 1.02rem; letter-spacing: 0.02em; }
            .manual-section h3 span { color: #777065; font-size: 0.62rem; letter-spacing: 0.12em; }
            .manual-section p, .manual-section li { margin: 0 0 0.62rem; color: #514d45; font-family: "Noto Serif SC", "Songti SC", SimSun, serif; font-size: 0.82rem; line-height: 1.78; }
            .manual-steps { margin: 0; padding: 0; counter-reset: manual-step; list-style: none; }
            .manual-steps li { position: relative; margin-bottom: 0.62rem; padding-left: 2rem; color: #514d45; font-family: "Noto Serif SC", "Songti SC", SimSun, serif; font-size: 0.8rem; line-height: 1.68; counter-increment: manual-step; }
            .manual-steps li::before { position: absolute; top: 0.05rem; left: 0; width: 1.35rem; height: 1.35rem; content: counter(manual-step); border: 1px solid #716b61; border-radius: 50%; font-family: "Noto Sans SC", sans-serif; font-size: 0.62rem; font-weight: 900; line-height: 1.25rem; text-align: center; }
            .manual-steps b { color: #282621; font-family: "Noto Sans SC", sans-serif; }
            .manual-score { margin: 0.8rem 0; border-top: 1px solid #8f887d; }
            .manual-score div { display: grid; grid-template-columns: 65px 1fr auto; gap: 0.75rem; align-items: center; padding: 0.58rem 0; border-bottom: 1px solid #c7c0b4; font-size: 0.72rem; }
            .manual-score b { font-size: 0.8rem; }
            .manual-score span { color: #5e594f; }
            .manual-score strong { text-align: right; }
            .manual-page-number { position: absolute; right: clamp(1.65rem, 3.8vw, 4.2rem); bottom: 1.35rem; left: clamp(1.65rem, 3.8vw, 4.2rem); display: flex; align-items: center; justify-content: space-between; padding-top: 0.55rem; border-top: 1px solid #b9b2a7; color: #777065; font-size: 0.62rem; letter-spacing: 0.08em; }
            .manual-page-number b { color: #282621; font-size: 0.72rem; }
            .manual-quality-wrap { display: flex; justify-content: center; margin: 0.25rem 0 0.4rem; }
            .manual-quality-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.12rem; width: min(100%, 128px); }
            .manual-quality-cell { display: flex; align-items: center; justify-content: center; aspect-ratio: 3 / 4; border: 1px solid #615c53; background: rgba(40, 38, 33, 0.025); }
            .manual-quality-cell span { font-size: 0.58rem; font-weight: 700; letter-spacing: 0.08em; }
            .manual-quality-note { margin-top: 0.6rem; font-size: 0.75rem; line-height: 1.7; }
            @media print {
              body { padding: 0; }
              .rulebook-page-export { box-shadow: none; }
            }
          </style>
        </head>
        <body>
          <div class="rulebook-export">${pageMarkup}</div>
        </body>
      </html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 250);
  };

  const downloadSingle = document.querySelector('#download-rulebook-single');
  const downloadTwo = document.querySelector('#download-rulebook-two');
  if (downloadSingle) downloadSingle.addEventListener('click', () => exportRulebookAsImage('single'));
  if (downloadTwo) downloadTwo.addEventListener('click', () => exportRulebookAsImage('split'));

  try {
    const saved = JSON.parse(localStorage.getItem(RULEBOOK_STORAGE_KEY));
    if (Array.isArray(saved?.pages) && saved.pages.length === pages.length) {
      saved.pages.forEach((content, index) => {
        if (typeof content === "string") pages[index].innerHTML = content;
      });
      status.textContent = "已载入本机保存的说明书";
    }
  } catch (error) {
    console.warn("无法读取说明书草稿，将使用默认内容。", error);
  }

  const setEditing = (editing) => {
    pages.forEach((page) => {
      page.contentEditable = String(editing);
    });
    editButton.hidden = editing;
    saveButton.hidden = !editing;
    status.textContent = editing ? "编辑中：可直接修改两页文字" : "可编辑并保存到本机";
    if (editing) pages[0].focus();
  };

  editButton.addEventListener("click", () => setEditing(true));

  saveButton.addEventListener("click", () => {
    try {
      localStorage.setItem(
        RULEBOOK_STORAGE_KEY,
        JSON.stringify({ savedAt: new Date().toISOString(), pages: pages.map((page) => page.innerHTML) }),
      );
      setEditing(false);
      status.textContent = "已保存到本机浏览器";
    } catch (error) {
      console.warn("无法保存说明书草稿。", error);
      status.textContent = "保存失败：请检查浏览器存储空间";
    }
  });

  resetButton.addEventListener("click", () => {
    pages.forEach((page, index) => {
      page.innerHTML = defaults[index];
    });
    localStorage.removeItem(RULEBOOK_STORAGE_KEY);
    setEditing(false);
    status.textContent = "已恢复默认说明书";
  });

  window.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s" && !saveButton.hidden) {
      event.preventDefault();
      saveButton.click();
    }
  });
}

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
  normalized.cards.event ||= [];
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
  let loadedSavedWorkspace = false;
  let savedCardTypes = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(EDITOR_STORAGE_KEY));
    if (saved?.gameData?.cards && Array.isArray(saved.gameData.relations)) {
      loadedSavedWorkspace = true;
      savedCardTypes = new Set(Object.keys(saved.gameData.cards));
      gameData = normalizeEditorData(saved.gameData);
      editorChangeLog = Array.isArray(saved.changeLog) ? saved.changeLog : [];
    }
  } catch (error) {
    console.warn("无法读取关系编辑草稿，将使用原始数据。", error);
  }

  gameData.categoryMeta = {
    ...sourceData.categoryMeta,
    ...gameData.categoryMeta,
  };
  Object.entries(sourceData.cards).forEach(([type, sourceCards]) => {
    if (loadedSavedWorkspace && !savedCardTypes.has(type)) {
      gameData.cards[type] = JSON.parse(JSON.stringify(sourceCards));
    }
  });
}

function loadConnectorSlotConfig() {
  connectorSlotConfig = DEFAULT_CONNECTOR_SLOT_CONFIG.map((slot) => ({ ...slot }));
  try {
    const saved = JSON.parse(localStorage.getItem(CONNECTOR_LAB_STORAGE_KEY));
    if (!Array.isArray(saved)) return;
    saved.slice(0, 10).forEach((slot, index) => {
      const shapeKey = slot?.shapeKey === "double-circle" ? "small-circle" : slot?.shapeKey;
      if (
        CONNECTOR_SHAPES.some((shape) => shape.key === shapeKey) &&
        Object.hasOwn(CONNECTOR_COLORS, slot?.color) &&
        Object.hasOwn(CONNECTOR_WIDTHS, slot?.width)
      ) {
        connectorSlotConfig[index] = {
          shapeKey,
          color: slot.color,
          width: slot.width,
        };
      }
    });
  } catch (error) {
    console.warn("无法读取几何图形实验室设置，将使用默认组合。", error);
  }
}

function saveConnectorSlotConfig() {
  localStorage.setItem(CONNECTOR_LAB_STORAGE_KEY, JSON.stringify(connectorSlotConfig));
}

function connectorShapeForSlot(index) {
  const slot = connectorSlotConfig[index % connectorSlotConfig.length] || DEFAULT_CONNECTOR_SLOT_CONFIG[0];
  const shape = CONNECTOR_SHAPES.find((item) => item.key === slot.shapeKey) || CONNECTOR_SHAPES[0];
  return {
    ...shape,
    color: slot.color,
    strokeColor: CONNECTOR_COLORS[slot.color] || CONNECTOR_COLORS.black,
    width: slot.width,
    strokeWidth: CONNECTOR_WIDTHS[slot.width] || CONNECTOR_WIDTHS.thick,
    slot: index + 1,
  };
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
        ...connectorShapeForSlot(index),
        order: index,
      });
    });
  });
  gameData.meta.networkCardCount = cardById.size;
  gameData.meta.relationCount = gameData.relations.length;
}

function rankedCards(type) {
  return (gameData.cards[type] || [])
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
          class="library-card${startsCategory ? " category-start" : ""}${typeAtBottom ? " type-label-bottom" : ""}${card.type === "event" ? " event-card" : ""}"
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
  return (CARD_EDGE_CONFIG[card.type] || [])
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
      style="stroke:${shape.strokeColor || "#111"};stroke-width:${shape.strokeWidth || 2.6}"
      viewBox="${viewBoxes[side]}"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="${shape.name}的一半"
    >
      <g${shapeTransform}>${shape.markup}</g>
    </svg>
  `;
}

function renderConnectorPreview(shape) {
  return `
    <svg class="connector-lab-preview" data-shape="${shape.key}"
      style="stroke:${shape.strokeColor};stroke-width:${shape.strokeWidth}"
      viewBox="0 0 40 40" aria-hidden="true">
      ${shape.markup}
    </svg>
  `;
}

function renderSiteMetrics() {
  const cardCount = cardById.size;
  const coreCardCount = STARTUP_CARD_ORDER.reduce(
    (total, type) => total + (gameData.cards[type]?.length || 0),
    0,
  );
  const eventCardCount = gameData.cards.event?.length || 0;
  const relationCount = gameData.relations.length;
  const categoryCount = STARTUP_CARD_ORDER.length;
  const relationTypeCount = new Set(gameData.relations.map((relation) => relation.type)).size;
  const metrics = {
    "card-count": cardCount,
    "core-card-count": coreCardCount,
    "event-card-count": eventCardCount,
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
  const promptSide = card.type === "user" || card.type === "need" ? "left" : "right";
  const visibleNote = /[\p{L}\p{N}]/u.test(card.note || "") ? card.note : "&nbsp;";
  const typeLabel = `
    <div class="card-topline${typeAtBottom ? " card-bottomline" : ""}">
      <span>${CARD_TYPE_LABELS[card.type]}</span>
    </div>
  `;
  return `
    <article class="library-card startup-card${typeAtBottom ? " type-label-bottom" : ""}" data-type="${card.type}">
      ${renderLibraryEdges(card)}
      ${renderStartupPicker(card, promptSide)}
      ${typeAtBottom ? "" : typeLabel}
      <h3 class="card-name">${card.name}</h3>
      <div class="card-emoji" aria-hidden="true"><span>${card.emoji}</span></div>
      <p class="card-question">${visibleNote}</p>
      ${typeAtBottom ? typeLabel : ""}
    </article>
  `;
}

function renderStartupPicker(card, promptSide) {
  const menuId = `startup-picker-${card.type}`;
  const options = rankedCards(card.type)
    .map(
      (option) => `
        <button
          class="startup-picker-option"
          type="button"
          role="option"
          aria-selected="${option.id === card.id}"
          data-startup-card-id="${option.id}"
          data-startup-card-type="${card.type}"
        >
          <span aria-hidden="true">${option.emoji}</span>
          <b>${option.name}</b>
        </button>
      `,
    )
    .join("");
  return `
    <div
      class="startup-picker prompt-${promptSide}"
      style="--prompt-accent:${gameData.categoryMeta[card.type].color}"
    >
      <button
        class="startup-prompt"
        type="button"
        data-startup-picker="${card.type}"
        aria-expanded="false"
        aria-controls="${menuId}"
      >
        <span class="startup-prompt-dot" aria-hidden="true"></span>
        <span class="startup-prompt-label">${gameData.categoryMeta[card.type].question}</span>
        <span class="startup-prompt-icon" aria-hidden="true"></span>
      </button>
      <div class="startup-picker-menu" id="${menuId}" role="listbox" hidden>
        ${options}
      </div>
    </div>
  `;
}

function syncStartupBoardSize() {
  const libraryCard = document.querySelector("#card-library .library-card");
  const board = document.querySelector("#startup-board");
  if (!libraryCard || !board) return;
  board.style.width = `${libraryCard.getBoundingClientRect().width * 2}px`;
}

function bindStartupBoardSizing() {
  let resizeFrame;
  syncStartupBoardSize();
  window.addEventListener("resize", () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(syncStartupBoardSize);
  });
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

function calculateStartupStatistics() {
  const counts = {
    total: 0,
    failure: 0,
    basic: 0,
    perfect: 0,
  };
  const [users, promotions, needs, products] = STARTUP_CARD_ORDER.map(
    (type) => gameData.cards[type] || [],
  );

  users.forEach((user) => {
    promotions.forEach((promotion) => {
      needs.forEach((need) => {
        products.forEach((product) => {
          const matchCount = [
            [user, promotion],
            [user, need],
            [promotion, product],
            [need, product],
          ].filter(([source, target]) => relationByPair.has(pairKey(source.id, target.id))).length;

          counts.total += 1;
          if (matchCount === 4) counts.perfect += 1;
          else if (matchCount === 3) counts.basic += 1;
          else counts.failure += 1;
        });
      });
    });
  });

  return counts;
}

function formatPercentage(count, total) {
  return `${(total ? (count / total) * 100 : 0).toFixed(2)}%`;
}

function renderStartupDemo(cards) {
  const board = document.querySelector("#startup-board");
  const verdict = document.querySelector("#startup-verdict");
  const result = evaluateStartup(cards);
  currentStartupCards = cards;

  board.innerHTML =
    cards.map(renderStartupCard).join("") +
    result.pairs
      .map(
        ({ source, target, matched }, index) => `
          <span
            class="board-match board-match-${index + 1} ${matched ? "is-match" : "is-miss"}"
            role="img"
            aria-label="${gameData.categoryMeta[source.type].label}与${gameData.categoryMeta[target.type].label}${matched ? "匹配" : "不匹配"}"
            title="${gameData.categoryMeta[source.type].label} × ${gameData.categoryMeta[target.type].label}：${matched ? "匹配" : "不匹配"}"
          >${matched ? "✓" : "×"}</span>
        `,
      )
      .join("");

  if (result.matchCount === 4) {
    verdict.innerHTML = "最佳生意：四条关系全部成立，融资 <b>200 万</b>。";
    verdict.className = "is-perfect";
  } else if (result.matchCount === 3) {
    verdict.innerHTML = "生意能成：U 字形连通，融资 <b>100 万</b>。";
    verdict.className = "is-funded";
  } else {
    verdict.innerHTML = `未完全连通，创业失败：${result.matchCount} 条关系成立，融资 <b>0</b>。`;
    verdict.className = "is-failed";
  }
}

function bindStartupDemo() {
  const board = document.querySelector("#startup-board");
  const shuffleButton = document.querySelector("#shuffle-startup");
  const closePickers = (exceptType = "") => {
    board.querySelectorAll("[data-startup-picker]").forEach((button) => {
      if (button.dataset.startupPicker === exceptType) return;
      button.setAttribute("aria-expanded", "false");
      document.querySelector(`#startup-picker-${button.dataset.startupPicker}`)?.setAttribute("hidden", "");
    });
  };
  const shuffle = () => {
    shuffleButton.classList.remove("is-spinning");
    void shuffleButton.offsetWidth;
    shuffleButton.classList.add("is-spinning");
    renderStartupDemo(randomStartupCards());
  };

  board.addEventListener("click", (event) => {
    const option = event.target.closest("[data-startup-card-id]");
    if (option) {
      const selectedCard = cardById.get(option.dataset.startupCardId);
      if (!selectedCard) return;
      const nextCards = currentStartupCards.map((card) =>
        card.type === option.dataset.startupCardType ? { ...selectedCard } : card,
      );
      renderStartupDemo(nextCards);
      return;
    }

    const pickerButton = event.target.closest("[data-startup-picker]");
    if (!pickerButton) return;
    const type = pickerButton.dataset.startupPicker;
    const menu = document.querySelector(`#startup-picker-${type}`);
    const willOpen = pickerButton.getAttribute("aria-expanded") !== "true";
    closePickers(type);
    pickerButton.setAttribute("aria-expanded", String(willOpen));
    menu.toggleAttribute("hidden", !willOpen);
  });

  board.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePickers();
  });
  document.addEventListener("click", (event) => {
    if (!board.contains(event.target)) closePickers();
  });
  shuffleButton.addEventListener("click", shuffle);
  renderStartupDemo(randomStartupCards());
}

function renderConnectorLab() {
  const fields = document.querySelector("#connector-lab-fields");
  if (!fields) return;
  fields.innerHTML = connectorSlotConfig
    .map((slot, index) => {
      const shape = connectorShapeForSlot(index);
      const shapeOptions = CONNECTOR_SHAPES.map(
        (option) => `<option value="${option.key}"${option.key === slot.shapeKey ? " selected" : ""}>${option.name}</option>`,
      ).join("");
      return `
        <fieldset class="connector-lab-field" data-connector-slot="${index}">
          <legend>接口 ${index + 1}</legend>
          <div class="connector-lab-field-main">
            <div class="connector-lab-preview-wrap">${renderConnectorPreview(shape)}</div>
            <label>形状
              <select data-connector-property="shapeKey">${shapeOptions}</select>
            </label>
            <label>颜色
              <select data-connector-property="color">
                <option value="black"${slot.color === "black" ? " selected" : ""}>黑色</option>
                <option value="gray"${slot.color === "gray" ? " selected" : ""}>灰色</option>
              </select>
            </label>
            <label>粗细
              <select data-connector-property="width">
                <option value="thick"${slot.width === "thick" ? " selected" : ""}>粗线（2.6）</option>
                <option value="thin"${slot.width === "thin" ? " selected" : ""}>细线（1.3）</option>
              </select>
            </label>
          </div>
        </fieldset>
      `;
    })
    .join("");
}

function readConnectorLabConfig() {
  return Array.from(document.querySelectorAll("[data-connector-slot]")).map((field) => {
    const getValue = (property) => field.querySelector(`[data-connector-property="${property}"]`)?.value;
    return {
      shapeKey: getValue("shapeKey"),
      color: getValue("color"),
      width: getValue("width"),
    };
  });
}

function refreshConnectorLabPreview(field) {
  const index = Number(field.dataset.connectorSlot);
  const values = {
    ...connectorSlotConfig[index],
    ...Object.fromEntries(
      Array.from(field.querySelectorAll("[data-connector-property]")).map((control) => [
        control.dataset.connectorProperty,
        control.value,
      ]),
    ),
  };
  const shape = CONNECTOR_SHAPES.find((item) => item.key === values.shapeKey) || CONNECTOR_SHAPES[0];
  const preview = field.querySelector(".connector-lab-preview-wrap");
  preview.innerHTML = renderConnectorPreview({
    ...shape,
    strokeColor: CONNECTOR_COLORS[values.color] || CONNECTOR_COLORS.black,
    strokeWidth: CONNECTOR_WIDTHS[values.width] || CONNECTOR_WIDTHS.thick,
  });
}

function bindConnectorLab() {
  const openButton = document.querySelector("#open-connector-lab");
  const lab = document.querySelector("#connector-lab");
  const fields = document.querySelector("#connector-lab-fields");
  const confirmButton = document.querySelector("#confirm-connector-lab");
  const cancelButton = document.querySelector("#cancel-connector-lab");
  const secondaryCancelButton = document.querySelector("#cancel-connector-lab-secondary");
  if (!openButton || !lab || !fields || !confirmButton || !cancelButton || !secondaryCancelButton) return;

  renderConnectorLab();
  openButton.addEventListener("click", () => {
    renderConnectorLab();
    lab.hidden = false;
    lab.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  cancelButton.addEventListener("click", () => {
    lab.hidden = true;
  });
  secondaryCancelButton.addEventListener("click", () => {
    lab.hidden = true;
  });
  fields.addEventListener("change", (event) => {
    const field = event.target.closest("[data-connector-slot]");
    if (field) refreshConnectorLabPreview(field);
  });
  confirmButton.addEventListener("click", () => {
    connectorSlotConfig = readConnectorLabConfig();
    saveConnectorSlotConfig();
    rebuildIndexes();
    const activeFilter = document.querySelector("[data-card-filter].active")?.dataset.cardFilter || "all";
    renderCardLibrary(activeFilter);
    renderStartupDemo(currentStartupCards.length ? currentStartupCards : randomStartupCards());
    lab.hidden = true;
  });
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

function bindCardImageDownload() {
  document.addEventListener("contextmenu", (event) => {
    const cardElement = event.target.closest(".library-card");
    if (!cardElement) return;

    event.preventDefault();
    downloadCardImage(cardElement).catch((error) => {
      console.error("卡牌图片下载失败。", error);
      window.alert("卡牌图片生成失败，请刷新页面后重试。");
    });
  });
}

async function downloadCardImage(cardElement) {
  const bounds = cardElement.getBoundingClientRect();
  const width = Math.round(bounds.width);
  const height = Math.round(bounds.height);
  if (!width || !height) throw new Error("卡牌当前不可见，无法生成图片。");

  const clone = cardElement.cloneNode(true);
  clone.classList.add("card-image-export");
  clone.classList.remove("category-start");
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.animation = "none";

  const originalIcon = cardElement.querySelector(".card-emoji span");
  const clonedIcon = clone.querySelector(".card-emoji span");
  if (originalIcon && clonedIcon) {
    clonedIcon.style.fontSize = getComputedStyle(originalIcon).fontSize;
  }

  const cssText = Array.from(document.styleSheets)
    .flatMap((sheet) => {
      try {
        return Array.from(sheet.cssRules, (rule) => rule.cssText);
      } catch (error) {
        console.warn("导出卡牌时跳过了无法读取的样式表。", error);
        return [];
      }
    })
    .join("\n");

  const serializedCard = new XMLSerializer().serializeToString(clone);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml" class="card-image-canvas" style="width:${width}px;height:${height}px">
          <style>${cssText}</style>
          ${serializedCard}
        </div>
      </foreignObject>
    </svg>
  `;

  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = await loadImage(svgUrl);
  const scale = Math.max(2, Math.min(4, window.devicePixelRatio || 2));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  context.scale(scale, scale);
  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error("PNG 生成失败。")), "image/png");
  });
  const card = cardById?.get(cardElement.dataset.cardId);
  const rawName = card?.name || cardElement.querySelector(".card-name")?.textContent || "卡牌";
  const filename = `${rawName.trim().replace(/[\\/:*?"<>|]+/g, "-")}.png`;
  downloadBlob(blob, filename);
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法渲染卡牌图片。"));
    image.src = source;
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  const coreCardCount = STARTUP_CARD_ORDER.reduce(
    (total, type) => total + (gameData.cards[type]?.length || 0),
    0,
  );
  svg.firstChild.textContent = `${coreCardCount} 张用户、传播、需求、产品卡牌之间的多对多关系网络`;

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
  renderEventMapCards();
  updateNetworkCaption();
}

function renderEventMapCards() {
  const container = document.querySelector("#event-map-cards");
  if (!container) return;
  const cards = gameData.cards.event || [];
  container.innerHTML = cards
    .map(
      (card) => `
        <button
          class="event-map-card${selectedNodeId === card.id ? " is-selected" : ""}"
          type="button"
          data-event-card-id="${card.id}"
          aria-pressed="${selectedNodeId === card.id}"
        >
          <span class="event-map-icon" aria-hidden="true">${card.emoji}</span>
          <span><b>${card.name}</b><small>${card.note}</small></span>
        </button>
      `,
    )
    .join("");
  container.querySelectorAll("[data-event-card-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedNodeId = button.dataset.eventCardId;
      selectCardForEditor(selectedNodeId);
      applyNodeHighlight();
      renderEventMapCards();
    });
  });
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
  syncStartupBoardSize();
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
  const statistics = calculateStartupStatistics();
  const formatNumber = (value) => value.toLocaleString("zh-CN");
  const values = {
    "#network-card-count": `${cardCount} 张卡`,
    "#network-relation-count": `${relationCount} 对关系`,
    "#network-combination-count": `${formatNumber(statistics.total)} 种组合可能`,
    "#network-failure-count": `创业失败 ${formatNumber(statistics.failure)} 种 · ${formatPercentage(statistics.failure, statistics.total)}`,
    "#network-basic-count": `基本成功 ${formatNumber(statistics.basic)} 种 · ${formatPercentage(statistics.basic, statistics.total)}`,
    "#network-perfect-count": `完全成功 ${formatNumber(statistics.perfect)} 种 · ${formatPercentage(statistics.perfect, statistics.total)}`,
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
