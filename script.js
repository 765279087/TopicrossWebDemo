const boardEl = document.getElementById("board");
const handEl = document.getElementById("hand");
const statusEl = document.getElementById("status");
const restartBtn = document.getElementById("restart-btn");
const levelSelect = document.getElementById("level-select");

const state = {
  levels: [],
  imageMap: {},
  level: null,
  board: [],
  boardSize: { rows: 0, cols: 0 },
  hand: [],
  piecesById: {},
  matchGroupById: {},
  blocked: new Set(),
};

const dragState = {
  source: null, // "hand" | "board"
  pieceId: null,
  fromCell: null,
  element: null,
};

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
  state.piecesById = buildPiecesFromTypes(level.types || []);
  state.matchGroupById = Object.fromEntries(
    (level.rules?.matchGroups || []).map((g) => [g.id, g])
  );
  const size = deriveBoardSize(level);
  state.boardSize = size;
  state.blocked = buildBlockedSet(level, size);
  state.board = Array.from({ length: size.rows }, () =>
    Array.from({ length: size.cols }, () => null)
  );

  applyPreset(level);
  buildHand(level);
  renderBoard();
  renderHand();
  setStatus("拖动手牌到数独区，填满并满足每行每列的匹配组");
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
    const pid = item._pieceId || takeOneFromType(item.type);
    if (pid) state.board[item.row][item.col] = pid;
  });
}

function buildHand(level) {
  const ids = Object.keys(state.piecesById);
  state.hand = [...ids];
  // 预置占用的从手牌移除
  (level.preset || []).forEach((preset) => {
    const pid = takeOneFromType(preset.type);
    if (pid) {
      preset._pieceId = pid;
      state.board[preset.row][preset.col] = pid;
    }
  });
}

function renderBoard() {
  const { rows, cols } = state.boardSize;
  boardEl.innerHTML = "";
  boardEl.style.gridTemplateColumns = `repeat(${cols}, 72px)`;
  boardEl.style.gridTemplateRows = `repeat(${rows}, 72px)`;

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const cell = document.createElement("div");
      const blocked = isBlocked(r, c);
      cell.className = blocked ? "cell blocked" : "cell";
      cell.dataset.row = r;
      cell.dataset.col = c;
      cell.dataset.occupied = Boolean(state.board[r][c]);
      if (blocked) {
        cell.textContent = "×";
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
    }
  };
}

function createPiece(pieceId, source, meta) {
  const piece = state.piecesById[pieceId];
  const el = document.createElement("div");
  el.className = "piece";
  el.draggable = !isPreset(meta?.row, meta?.col);
  const img = document.createElement("img");
  img.src = piece.src;
  img.alt = piece.type;
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
  if (existing) addToHand(existing);

  state.board[targetRow][targetCol] = pieceId;
  state.board[fromCell.row][fromCell.col] = null;
  renderBoard();
  renderHand();
  checkWin();
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
  types.forEach((t) => {
    const list = state.imageMap[t] || [];
    list.forEach((src, idx) => {
      const id = `${t}::${idx}`;
      map[id] = { id, type: t, src };
    });
  });
  return map;
}

function takeOneFromType(type) {
  const idx = state.hand.findIndex((pid) => state.piecesById[pid]?.type === type);
  if (idx >= 0) {
    const [pid] = state.hand.splice(idx, 1);
    return pid;
  }
  return null;
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

  const rowGroup = state.matchGroupById[state.level.rules.rowGroup];
  const colGroup = state.matchGroupById[state.level.rules.colGroup];
  const rowsOk = validateLines("row", rowGroup);
  const colsOk = validateLines("col", colGroup);

  if (rowsOk && colsOk) {
    setStatus("恭喜，匹配完成！", true);
    return true;
  }
  setStatus("匹配未通过，请调整棋子");
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

function validateLines(kind, group) {
  if (!group) return false;
  const { rows, cols } = state.boardSize;
  if (group.type !== "unique-set") return false;
  const required = group.required;

  if (kind === "row") {
    for (let r = 0; r < rows; r += 1) {
      const line = [];
      for (let c = 0; c < cols; c += 1) {
        if (isBlocked(r, c)) continue;
        line.push(state.board[r][c]);
      }
      if (!validateUniqueSet(line, required)) return false;
    }
    return true;
  }
  if (kind === "col") {
    for (let c = 0; c < cols; c += 1) {
      const line = [];
      for (let r = 0; r < rows; r += 1) {
        if (isBlocked(r, c)) continue;
        line.push(state.board[r][c]);
      }
      if (!validateUniqueSet(line, required)) return false;
    }
    return true;
  }
  return false;
}

function validateUniqueSet(line, required) {
  if (line.some((cell) => !cell)) return false;
  const types = line.map((pid) => state.piecesById[pid]?.type).filter(Boolean);
  if (types.length !== line.length) return false;
  if (types.length !== required.length) return false;
  const set = new Set(types);
  if (set.size !== required.length) return false;
  return required.every((t) => set.has(t));
}
