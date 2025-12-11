const boardEl = document.getElementById("board");
const handEl = document.getElementById("hand");
const statusEl = document.getElementById("status");
const restartBtn = document.getElementById("restart-btn");
const levelSelect = document.getElementById("level-select");
const themesEl = document.getElementById("themes");

const state = {
  levels: [],
  imageMap: {},
  level: null,
  board: [],
  boardSize: { rows: 0, cols: 0 },
  hand: [],
  piecesById: {},
  ruleGrid: [],
  blocked: new Set(),
};

const dragState = {
  source: null, // "hand" | "board"
  pieceId: null,
  fromCell: null,
  element: null,
};

let touchHighlightCell = null;
let touchDragClone = null;

init();

async function init() {
  await loadImageMap();
  await loadLevelList();
  const first = state.levels[0];
  if (first) {
    await loadLevel(first.id);
  }
  restartBtn.addEventListener("click", () => {
    if (state.level) loadLevel(state.level.id);
  });
  levelSelect.addEventListener("change", (e) => {
    loadLevel(e.target.value);
  });
  window.addEventListener("resize", () => updateResponsiveSizes());
}

async function loadLevelList() {
  try {
    const res = await fetch("levels/index.json");
    const data = await res.json();
    state.levels = data.levels || [];
    levelSelect.innerHTML = "";
    state.levels.forEach((lvl) => {
      const opt = document.createElement("option");
      opt.value = lvl.id;
      opt.textContent = lvl.name;
      levelSelect.appendChild(opt);
    });
  } catch (err) {
    console.error(err);
    statusEl.textContent = "加载关卡列表失败";
  }
}

async function loadImageMap() {
  try {
    const res = await fetch("Image/image-map.json");
    const data = await res.json();
    state.imageMap = data || {};
  } catch (err) {
    console.error(err);
    state.imageMap = {};
    statusEl.textContent = "图片映射加载失败";
  }
}

async function loadLevel(levelId) {
  const meta = state.levels.find((l) => l.id === levelId);
  if (!meta) return;
  try {
    const res = await fetch(`levels/${meta.file}`);
    const level = await res.json();
    state.level = level;
    levelSelect.value = level.id;
    prepareLevel(level);
  } catch (err) {
    console.error(err);
    statusEl.textContent = "加载关卡失败";
  }
}

function prepareLevel(level) {
  const size = deriveBoardSize(level);
  state.boardSize = size;
  state.blocked = buildBlockedSet(level, size);
  state.ruleGrid = normalizeRuleGrid(level.rules, size);
  state.board = Array.from({ length: size.rows }, () =>
    Array.from({ length: size.cols }, () => null)
  );

  buildHand(level);
  applyPreset(level);
  updateResponsiveSizes();
  renderThemes();
  renderBoard();
  renderHand();
  setStatus("拖动手牌到棋盘，并让类型与规则网格一致");
}

function applyPreset(level) {
  if (!Array.isArray(level.preset)) return;
  level.preset.forEach((item) => {
    if (
      item.row < 0 ||
      item.row >= state.boardSize.rows ||
      item.col < 0 ||
      item.col >= state.boardSize.cols
    ) {
      return;
    }
    if (isBlocked(item.row, item.col)) return;
    const presetSrc = normalizeSrc(item.src);
    const pid =
      item._pieceId ||
      takeOneBySrc(presetSrc) ||
      takeOneFromType(item.type);
    if (pid) state.board[item.row][item.col] = pid;
  });
}

function buildHand(level) {
  // 从关卡类型收集所有可用棋子并去重
  state.piecesById = buildPiecesFromTypes(level.types || []);
  state.hand = Object.keys(state.piecesById);

  // 预置棋子应当存在于手牌中，先行占用并移除
  const preset = Array.isArray(level.preset) ? level.preset : [];
  if (!preset.length) return;

  const { rows, cols } = state.boardSize;
  preset.forEach((item) => {
    if (
      item.row < 0 ||
      item.row >= rows ||
      item.col < 0 ||
      item.col >= cols ||
      isBlocked(item.row, item.col)
    ) {
      return;
    }
    const presetSrc = normalizeSrc(item.src);
    const pid = takeOneBySrc(presetSrc) || takeOneFromType(item.type);
    if (pid) {
      item._pieceId = pid;
    }
  });
}

function renderBoard() {
  const { rows, cols } = state.boardSize;
  boardEl.innerHTML = "";
  boardEl.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size, 72px))`;
  boardEl.style.gridTemplateRows = `repeat(${rows}, var(--cell-size, 72px))`;

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const cell = document.createElement("div");
      const blocked = isBlocked(r, c);
      cell.className = blocked ? "cell blocked" : "cell";
      cell.dataset.row = r;
      cell.dataset.col = c;
      cell.dataset.occupied = Boolean(state.board[r][c]);
      if (blocked) {
        boardEl.appendChild(cell);
        continue;
      }

      if (state.board[r][c]) {
        const pieceEl = createPiece(state.board[r][c], "board", { row: r, col: c });
        cell.appendChild(pieceEl);
        if (isPreset(r, c)) {
          pieceEl.classList.add("preset");
          const badge = document.createElement("span");
          badge.className = "badge";
          badge.textContent = "锁定";
          cell.appendChild(badge);
        }
      }

      cell.addEventListener("dragover", (e) => onCellDragOver(e, cell));
      cell.addEventListener("dragleave", () => cell.classList.remove("highlight"));
      cell.addEventListener("drop", (e) => onCellDrop(e, cell));

      boardEl.appendChild(cell);
    }
  }
}

function renderHand() {
  handEl.innerHTML = "";
  state.hand.forEach((pid, idx) => {
    const pieceEl = createPiece(pid, "hand", { handIndex: idx });
    handEl.appendChild(pieceEl);
  });

  handEl.ondragover = (e) => {
    if (dragState.source === "board") {
      e.preventDefault();
      handEl.classList.add("highlight");
    }
  };
  handEl.ondragleave = () => handEl.classList.remove("highlight");
  handEl.ondrop = (e) => {
    handEl.classList.remove("highlight");
    if (dragState.source === "board") {
      e.preventDefault();
      removeFromBoard(dragState.fromCell.row, dragState.fromCell.col);
      addToHand(dragState.pieceId);
      renderBoard();
      renderHand();
      checkWin();
      updateThemeStatus();
    }
  };

  updateThemeStatus();
}

function createPiece(pieceId, source, meta) {
  const piece = state.piecesById[pieceId];
  const el = document.createElement("div");
  el.className = "piece";
  el.draggable = !isPreset(meta?.row, meta?.col);
  const img = document.createElement("img");
  img.src = piece.src;
  img.alt = Array.isArray(piece.types) ? piece.types.join("/") : piece.type;
  el.appendChild(img);

  el.addEventListener("dragstart", (e) => {
    if (!el.draggable) {
      e.preventDefault();
      return;
    }
    dragState.source = source;
    dragState.pieceId = pieceId;
    dragState.fromCell = source === "board" ? { row: meta.row, col: meta.col } : null;
    dragState.element = el;
    e.dataTransfer.effectAllowed = "move";
  });

  el.addEventListener("dragend", () => {
    dragState.source = null;
    dragState.pieceId = null;
    dragState.fromCell = null;
    dragState.element = null;
  });

  el.addEventListener(
    "touchstart",
    (e) => onPieceTouchStart(e, pieceId, source, meta, el),
    { passive: false }
  );

  return el;
}

function onCellDragOver(e, cell) {
  if (!dragState.pieceId || isBlocked(Number(cell.dataset.row), Number(cell.dataset.col))) {
    return;
  }
  e.preventDefault();
  cell.classList.add("highlight");
}

function onCellDrop(e, cell) {
  e.preventDefault();
  cell.classList.remove("highlight");
  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  handleDropToCell(row, col);
}

function placeFromHand(row, col, pieceId, element) {
  if (state.board[row][col]) {
    // 如果已有棋子，退回手牌
    addToHand(state.board[row][col]);
  }
  state.board[row][col] = pieceId;
  removeHandElement(element);
  renderBoard();
  renderHand();
  checkWin();
  updateThemeStatus();
}

function updateResponsiveSizes() {
  const { cols, rows } = state.boardSize;
  if (!cols || !rows) return;

  // 隐藏所有分区标题以确保计算准确
  document.querySelectorAll('.section-title').forEach(el => el.style.display = 'none');

  const appEl = document.querySelector('.app');
  const topBar = document.querySelector('.top-bar');
  const themePanel = document.querySelector('.theme-panel');
  
  const winHeight = window.innerHeight;
  const appStyle = getComputedStyle(appEl);
  const appPadV = parseFloat(appStyle.paddingTop) + parseFloat(appStyle.paddingBottom);
  const appInnerWidth = appEl.clientWidth - parseFloat(appStyle.paddingLeft) - parseFloat(appStyle.paddingRight);

  // 固定头部高度
  const topH = topBar.offsetHeight + 4; // margin-bottom
  const themeH = themePanel.offsetHeight;
  
  // 面板间距 (top -> theme -> board -> hand) = 3 gaps? No, 结构是 top -> (board, theme, hand)
  // 其实结构是 .app -> .top-bar, .game -> (.board-panel, .theme-panel, .hand-panel)
  // game gap is 4px. 
  // boardPanel, themePanel, handPanel are flex items in .game
  // Total vertical gaps in .game: (3 items - 1) * 4px = 8px.
  // 还有 .game 自身的 margin/padding? .game flex:1.
  
  const gameGap = 4;
  const totalFixedH = appPadV + topH + themeH + gameGap * 2;
  const availableH = winHeight - totalFixedH;

  // 面板内边距
  const panelPadV = 12; // 6px * 2
  const panelBorder = 2; // 1px * 2
  const panelOverhead = panelPadV + panelBorder;

  // Board Panel 额外开销: .status
  const statusH = 20; // approx
  
  // 查找最佳尺寸
  let low = 20;
  let high = 80;
  let best = 20;
  
  // 手牌计算参数
  const handCount = Math.max(1, state.hand.length);
  const boardGap = 4;

  while (low <= high) {
    const size = Math.floor((low + high) / 2);
    
    // 1. 检查宽度限制
    // Board Width
    const boardW = cols * size + (cols - 1) * boardGap;
    const boardPanelContentW = appInnerWidth - panelOverhead;
    if (boardW > boardPanelContentW) {
      high = size - 1;
      continue;
    }
    
    // 2. 计算高度需求
    // Board Height
    const boardH = rows * size + (rows - 1) * boardGap;
    const boardPanelH = boardH + statusH + panelOverhead;
    
    // Hand Height
    const pieceSize = Math.max(16, size - 8);
    const handGap = 4;
    const handCellSize = pieceSize + 8; // min-width of grid item
    
    // 手牌区每行能放多少个？
    const handPanelContentW = appInnerWidth - panelOverhead;
    const handCols = Math.floor((handPanelContentW + handGap) / (handCellSize + handGap));
    const handRows = Math.ceil(handCount / Math.max(1, handCols));
    
    // 修正手牌高度计算，考虑 grid item 实际占用高度
    // CSS minmax 是 piece-size + 8px.
    // 我们假设它是正方形格子.
    const handItemH = handCellSize; 
    const handGridH = handRows * handItemH + (handRows - 1) * handGap;
    
    // 手牌区稍微留点余量，防止计算太极限被截断
    const handPanelH = handGridH + panelOverhead + 4; 
    
    const totalNeeded = boardPanelH + handPanelH;
    
    if (totalNeeded <= availableH) {
      best = size;
      low = size + 1;
    } else {
      high = size - 1;
    }
  }

  const cellSize = best;
  const pieceSize = Math.max(16, cellSize - 8);
  const handGap = 4;

  document.documentElement.style.setProperty("--cell-size", `${cellSize}px`);
  document.documentElement.style.setProperty("--piece-size", `${pieceSize}px`);
  document.documentElement.style.setProperty("--hand-gap", `${handGap}px`);
}

function moveOnBoard(targetRow, targetCol) {
  const { fromCell, pieceId } = dragState;
  if (!fromCell) return;
  if (fromCell.row === targetRow && fromCell.col === targetCol) return;
  if (isPreset(targetRow, targetCol)) {
    setStatus("预置棋子不可覆盖");
    return;
  }

  const existing = state.board[targetRow][targetCol];
  state.board[targetRow][targetCol] = pieceId;
  if (existing) {
    // 交换位置
    state.board[fromCell.row][fromCell.col] = existing;
  } else {
    state.board[fromCell.row][fromCell.col] = null;
  }
  renderBoard();
  renderHand();
  checkWin();
  updateThemeStatus();
}

function handleDropToCell(row, col) {
  if (!dragState.pieceId || isBlocked(row, col)) {
    setStatus("该格不可放置");
    return;
  }

  if (isPreset(row, col)) {
    setStatus("预置棋子不可覆盖");
    return;
  }

  if (dragState.source === "hand") {
    placeFromHand(row, col, dragState.pieceId, dragState.element);
  } else if (dragState.source === "board") {
    moveOnBoard(row, col);
  }
}

function onPieceTouchStart(event, pieceId, source, meta, element) {
  if (isPreset(meta?.row, meta?.col)) {
    event.preventDefault();
    return;
  }

  dragState.source = source;
  dragState.pieceId = pieceId;
  dragState.fromCell = source === "board" ? { row: meta.row, col: meta.col } : null;
  dragState.element = element;

  const touch = event.touches?.[0];
  if (touch) {
    createTouchDragClone(element, touch);
  }

  clearTouchHighlight();
  document.addEventListener("touchmove", onPieceTouchMove, { passive: false });
  document.addEventListener("touchend", onPieceTouchEnd, { passive: false });
  document.addEventListener("touchcancel", onPieceTouchCancel, { passive: false });
}

function onPieceTouchMove(event) {
  if (!dragState.pieceId) return;
  event.preventDefault();
  const touch = event.touches[0];
  if (!touch) return;
  updateTouchDragPosition(touch);
  const target = document.elementFromPoint(touch.clientX, touch.clientY);
  const cell = target?.closest?.(".cell");
  highlightTouchCell(cell);
}

function onPieceTouchEnd(event) {
  if (!dragState.pieceId) {
    cleanupTouchListeners();
    return;
  }
  event.preventDefault();
  const touch = event.changedTouches?.[0];
  const target = touch ? document.elementFromPoint(touch.clientX, touch.clientY) : null;
  const handZone = target?.closest?.("#hand");
  if (handZone && dragState.source === "board") {
    const { fromCell, pieceId } = dragState;
    if (fromCell) {
      removeFromBoard(fromCell.row, fromCell.col);
      addToHand(pieceId);
      renderBoard();
      renderHand();
      checkWin();
      updateThemeStatus();
    }
  } else {
    const cell = target?.closest?.(".cell") || touchHighlightCell;
    if (cell && !isBlocked(Number(cell.dataset.row), Number(cell.dataset.col))) {
      const row = Number(cell.dataset.row);
      const col = Number(cell.dataset.col);
      handleDropToCell(row, col);
    }
  }
  clearTouchHighlight();
  cleanupTouchListeners();
}

function onPieceTouchCancel() {
  clearTouchHighlight();
  cleanupTouchListeners();
}

function highlightTouchCell(cell) {
  if (touchHighlightCell && touchHighlightCell !== cell) {
    touchHighlightCell.classList.remove("highlight");
  }
  if (cell && !isBlocked(Number(cell.dataset.row), Number(cell.dataset.col))) {
    cell.classList.add("highlight");
    touchHighlightCell = cell;
  } else {
    touchHighlightCell = null;
  }
}

function clearTouchHighlight() {
  if (touchHighlightCell) {
    touchHighlightCell.classList.remove("highlight");
    touchHighlightCell = null;
  }
}

function cleanupTouchListeners() {
  dragState.source = null;
  dragState.pieceId = null;
  dragState.fromCell = null;
  dragState.element = null;
  removeTouchDragClone();
  document.removeEventListener("touchmove", onPieceTouchMove);
  document.removeEventListener("touchend", onPieceTouchEnd);
  document.removeEventListener("touchcancel", onPieceTouchCancel);
}

function createTouchDragClone(element, touch) {
  removeTouchDragClone();
  const rect = element.getBoundingClientRect();
  const clone = element.cloneNode(true);
  clone.classList.add("touch-dragging");
  clone.style.width = `${rect.width}px`;
  clone.style.height = `${rect.height}px`;
  clone.style.left = `${touch.clientX - rect.width / 2}px`;
  clone.style.top = `${touch.clientY - rect.height / 2}px`;
  document.body.appendChild(clone);
  touchDragClone = clone;
}

function updateTouchDragPosition(touch) {
  if (!touchDragClone) return;
  const rect = touchDragClone.getBoundingClientRect();
  touchDragClone.style.left = `${touch.clientX - rect.width / 2}px`;
  touchDragClone.style.top = `${touch.clientY - rect.height / 2}px`;
}

function removeTouchDragClone() {
  if (touchDragClone?.parentNode) {
    touchDragClone.parentNode.removeChild(touchDragClone);
  }
  touchDragClone = null;
}

function renderThemes() {
  if (!themesEl) return;
  themesEl.innerHTML = "";
  const list = state.level?.types || [];
  list.forEach((type) => {
    const item = document.createElement("div");
    item.className = "theme-item";
    item.dataset.type = type;
    item.textContent = type;
    themesEl.appendChild(item);
  });
  updateThemeStatus();
}

function updateThemeStatus() {
  if (!themesEl || !state.level) return;
  const types = state.level.types || [];
  const grid = state.ruleGrid || [];
  const requirements = {};

  grid.forEach((row, r) => {
    if (!Array.isArray(row)) return;
    row.forEach((cell, c) => {
      if (!cell || isBlocked(r, c)) return;
      const expectedList = Array.isArray(cell) ? cell : [cell];
      expectedList.forEach((t) => {
        if (!requirements[t]) requirements[t] = [];
        requirements[t].push({ r, c });
      });
    });
  });

  const themeItems = Array.from(themesEl.children);
  types.forEach((type) => {
    const positions = requirements[type] || [];
    const item = themeItems.find((el) => el.dataset.type === type);
    if (!item) return;
    if (!positions.length) {
      item.classList.remove("done");
      return;
    }
    const complete = positions.every(({ r, c }) => {
      const pid = state.board?.[r]?.[c];
      if (!pid) return false;
      const piece = state.piecesById[pid];
      const actualTypes = piece?.types || (piece?.type ? [piece.type] : []);
      return actualTypes.includes(type);
    });
    item.classList.toggle("done", complete);
  });
}

function removeFromBoard(row, col) {
  state.board[row][col] = null;
}

function addToHand(pieceId) {
  state.hand.push(pieceId);
}

function removeHandElement(element) {
  const idx = Array.from(handEl.children).indexOf(element);
  if (idx >= 0) {
    state.hand.splice(idx, 1);
  }
}

function deriveBoardSize(level) {
  if (Array.isArray(level.layout) && level.layout.length > 0) {
    const rows = level.layout.length;
    const cols = level.layout[0]?.length || 0;
    return { rows, cols };
  }
  if (
    level.board &&
    typeof level.board.rows === "number" &&
    typeof level.board.cols === "number"
  ) {
    return { rows: level.board.rows, cols: level.board.cols };
  }
  return { rows: 0, cols: 0 };
}

function buildBlockedSet(level, size) {
  if (Array.isArray(level.layout)) {
    const blocked = [];
    level.layout.forEach((rowArr, r) => {
      rowArr.forEach((cell, c) => {
        if (!cell) blocked.push(`${r},${c}`);
      });
    });
    return new Set(blocked);
  }
  return new Set((level.blocked || []).map((b) => `${b.row},${b.col}`));
}

function buildPiecesFromTypes(types) {
  const map = {};
  const bySrc = {};
  let idx = 0;

  types.forEach((t) => {
    const list = state.imageMap[t] || [];
    list.forEach((src) => {
      const img = normalizeSrc(src);
      if (!img) return;
      if (!bySrc[img]) {
        const id = `piece::${idx++}`;
        bySrc[img] = { id, src: img, types: new Set() };
      }
      bySrc[img].types.add(t);
    });
  });

  Object.values(bySrc).forEach((item) => {
    const typeArr = Array.from(item.types);
    map[item.id] = {
      id: item.id,
      src: item.src,
      type: typeArr[0],
      types: typeArr,
    };
  });

  return map;
}

function takeOneFromType(type) {
  const idx = state.hand.findIndex((pid) =>
    (state.piecesById[pid]?.types || []).includes(type)
  );
  if (idx >= 0) {
    const [pid] = state.hand.splice(idx, 1);
    return pid;
  }
  return null;
}

function takeOneBySrc(src) {
  if (!src) return null;
  const idx = state.hand.findIndex((pid) => state.piecesById[pid]?.src === src);
  if (idx >= 0) {
    const [pid] = state.hand.splice(idx, 1);
    return pid;
  }
  return null;
}

function normalizeSrc(entry) {
  if (entry === undefined || entry === null) return undefined;
  if (typeof entry === "number") return `Image/${entry}.png`;
  const num = Number(entry);
  if (!Number.isNaN(num) && `${num}` === `${entry}`) return `Image/${num}.png`;
  return entry;
}

function isPreset(row, col) {
  return (state.level.preset || []).some((p) => p.row === row && p.col === col);
}

function isBlocked(row, col) {
  return state.blocked.has(`${row},${col}`);
}

function setStatus(msg, isWin = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("win", isWin);
}

function checkWin() {
  if (!state.level) return;
  if (!boardFilled()) {
    setStatus("继续放置棋子，填满棋盘");
    return false;
  }

  const matched = validateBoardWithRules();
  if (matched) {
    setStatus("恭喜，匹配完成！", true);
    return true;
  }
  setStatus("棋子类型与关卡规则不符");
  return false;
}

function boardFilled() {
  const { rows, cols } = state.boardSize;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (isBlocked(r, c)) continue;
      if (!state.board[r][c]) return false;
    }
  }
  return true;
}

function validateBoardWithRules() {
  const grid = state.ruleGrid || [];
  const { rows, cols } = state.boardSize;
  if (!Array.isArray(grid) || grid.length !== rows) return false;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (isBlocked(r, c)) continue;
      const expected = grid[r]?.[c];
      if (!expected) return false;
      const pid = state.board[r][c];
      if (!pid) return false;
      const piece = state.piecesById[pid];
      const actualTypes = piece?.types || (piece?.type ? [piece.type] : []);
      const expectedList = Array.isArray(expected) ? expected : [expected];
      const matched = expectedList.every((t) => actualTypes.includes(t));
      if (!matched) return false;
    }
  }
  return true;
}

function normalizeRuleGrid(rules, size) {
  if (!Array.isArray(rules)) return [];
  const { rows, cols } = size;
  return Array.from({ length: rows }, (_, r) => {
    const rowRules = Array.isArray(rules[r]) ? rules[r].slice(0, cols) : [];
    while (rowRules.length < cols) {
      rowRules.push(null);
    }
    return rowRules;
  });
}
