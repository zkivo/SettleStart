const svg = document.getElementById("board");
const resultsDiv = document.getElementById("results");

const HEX_SIZE = 50;

// Terrain cycle (editor)
const TERRAIN = ["desert", "wood", "brick", "sheep", "wheat", "ore"];
const COLORS = {
  desert: "#d7b98e",
  wood: "#2e7d32",
  brick: "#c62828",
  sheep: "#7cb342",
  wheat: "#f9a825",
  ore: "#546e7a",
};

// Number token cycle (editor)
const NUMBER_CYCLE = [null, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12];

// Dice probabilities (out of 36)
const DICE_P = {
  2: 1 / 36,
  3: 2 / 36,
  4: 3 / 36,
  5: 4 / 36,
  6: 5 / 36,
  8: 5 / 36,
  9: 4 / 36,
  10: 3 / 36,
  11: 2 / 36,
  12: 1 / 36,
};

// --- Pips UI state (default OFF) ---
let showPips = false;

// Convert number token -> pip count (classic 2d6 odds)
function pipCount(n) {
  switch (n) {
    case 2:
    case 12:
      return 1;
    case 3:
    case 11:
      return 2;
    case 4:
    case 10:
      return 3;
    case 5:
    case 9:
      return 4;
    case 6:
    case 8:
      return 5;
    default:
      return 0;
  }
}

function computeBoardPipTotals() {
  const order = ["wood", "brick", "sheep", "wheat", "ore"];
  const totals = {};
  for (const r of order) totals[r] = 0;

  for (const h of hexes) {
    const r = resourceOfTerrain(h.terrain);
    if (!r) continue;
    if (!h.number) continue;
    totals[r] += pipCount(h.number);
  }

  totals._all = order.reduce((s, r) => s + totals[r], 0);
  return totals;
}


// --- Picker UI (terrain/number selection) ---
const pickerBackdrop = document.getElementById("picker-backdrop");
const picker = document.getElementById("picker");
const pickerTitle = document.getElementById("picker-title");
const pickerGrid = document.getElementById("picker-grid");
const pickerClose = document.getElementById("picker-close");

let pickerOnSelect = null;

function openPicker(title, items, onSelect) {
  pickerTitle.textContent = title;
  pickerGrid.innerHTML = "";
  pickerOnSelect = onSelect;

  for (const it of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "picker-btn";

    if (it.swatch) {
      const sw = document.createElement("span");
      sw.className = "picker-swatch";
      sw.style.background = it.swatch;
      btn.appendChild(sw);
    }

    const label = document.createElement("span");
    label.textContent = it.label;
    btn.appendChild(label);

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (pickerOnSelect) pickerOnSelect(it.value);
      closePicker();
    });

    pickerGrid.appendChild(btn);
  }

  pickerBackdrop.style.display = "block";
  picker.style.display = "block";
}

function closePicker() {
  picker.style.display = "none";
  pickerBackdrop.style.display = "none";
  pickerOnSelect = null;
}

if (pickerBackdrop) pickerBackdrop.addEventListener("click", closePicker);
if (pickerClose) pickerClose.addEventListener("click", closePicker);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closePicker();
});

function isRedNumber(n) {
  return n === 6 || n === 8;
}

// Axial coords for standard 19-hex board (radius 2)
const coords = [];
for (let q = -2; q <= 2; q++) {
  for (let r = -2; r <= 2; r++) {
    const s = -q - r;
    if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) <= 2) coords.push({ q, r });
  }
}
coords.sort((a, b) => a.r - b.r || a.q - b.q);

// Model
const hexes = coords.map(() => ({
  terrain: "desert",
  number: null,
}));

// --- Geometry helpers ---
function axialToPixel(q, r) {
  return {
    x: HEX_SIZE * Math.sqrt(3) * (q + r / 2),
    y: HEX_SIZE * (3 / 2) * r,
  };
}

function isDefaultBoard() {
  return hexes.every(h => h.terrain === "desert" && h.number === null);
}


function hexPoints(cx, cy) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    pts.push([cx + HEX_SIZE * Math.cos(angle), cy + HEX_SIZE * Math.sin(angle)]);
  }
  return pts.map((p) => p.join(",")).join(" ");
}

function hexCorners(cx, cy) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    pts.push({ x: cx + HEX_SIZE * Math.cos(angle), y: cy + HEX_SIZE * Math.sin(angle) });
  }
  return pts;
}

function keyPoint(p) {
  // quantize to avoid float mismatch
  const eps = 1e-4;
  const kx = Math.round(p.x / eps) * eps;
  const ky = Math.round(p.y / eps) * eps;
  return `${kx.toFixed(4)},${ky.toFixed(4)}`;
}

function computeBounds() {
  const centers = coords.map((c) => axialToPixel(c.q, c.r));
  const xs = centers.map((p) => p.x);
  const ys = centers.map((p) => p.y);
  const minX = Math.min(...xs) - HEX_SIZE * 1.2;
  const maxX = Math.max(...xs) + HEX_SIZE * 1.2;
  const minY = Math.min(...ys) - HEX_SIZE * 1.2;
  const maxY = Math.max(...ys) + HEX_SIZE * 1.2;
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

const bounds = computeBounds();

function setViewBox(targetSvg) {
  const pad = 30;
  targetSvg.setAttribute(
    "viewBox",
    `${bounds.minX - pad} ${bounds.minY - pad} ${bounds.width + 2 * pad} ${bounds.height + 2 * pad}`
  );
}
setViewBox(svg);

// --- Adjacency (hex neighbors) for red-number constraint ---
const axialToIndex = new Map(coords.map((c, i) => [`${c.q},${c.r}`, i]));
const HEX_DIRS = [
  { dq: 1, dr: 0 },
  { dq: 1, dr: -1 },
  { dq: 0, dr: -1 },
  { dq: -1, dr: 0 },
  { dq: -1, dr: 1 },
  { dq: 0, dr: 1 },
];

function hexNeighbors(i) {
  const c = coords[i];
  const out = [];
  for (const d of HEX_DIRS) {
    const key = `${c.q + d.dq},${c.r + d.dr}`;
    if (axialToIndex.has(key)) out.push(axialToIndex.get(key));
  }
  return out;
}

// --- Vertex graph for settlement spots ---
const vertexAdjHexes = new Map();  // vertexKey -> Set(hexIndex)
const vertexNeighbors = new Map(); // vertexKey -> Set(vertexKey)
const vertexPos = new Map();       // vertexKey -> {x,y}

function addNeighbor(a, b) {
  if (!vertexNeighbors.has(a)) vertexNeighbors.set(a, new Set());
  if (!vertexNeighbors.has(b)) vertexNeighbors.set(b, new Set());
  vertexNeighbors.get(a).add(b);
  vertexNeighbors.get(b).add(a);
}

(function buildVertexGraph() {
  coords.forEach((c, hexIndex) => {
    const center = axialToPixel(c.q, c.r);
    const corners = hexCorners(center.x, center.y);
    const keys = corners.map((p) => {
      const k = keyPoint(p);
      vertexPos.set(k, p);
      if (!vertexAdjHexes.has(k)) vertexAdjHexes.set(k, new Set());
      vertexAdjHexes.get(k).add(hexIndex);
      return k;
    });

    // connect corners as edges
    for (let i = 0; i < 6; i++) {
      addNeighbor(keys[i], keys[(i + 1) % 6]);
    }
  });
})();


// --- cycling helpers ---
function cycleForward(arr, cur) {
  const idx = arr.indexOf(cur);
  return arr[(idx + 1) % arr.length];
}
function cycleBackward(arr, cur) {
  const idx = arr.indexOf(cur);
  return arr[(idx - 1 + arr.length) % arr.length];
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateRandomStandardMap() {
  // Standard terrain distribution (19):
  // wood x4, brick x3, sheep x4, wheat x4, ore x3, desert x1
  const terrains = [
    ...Array(4).fill("wood"),
    ...Array(3).fill("brick"),
    ...Array(4).fill("sheep"),
    ...Array(4).fill("wheat"),
    ...Array(3).fill("ore"),
    "desert",
  ];

  // Standard number tokens (18, excluding desert):
  // 2,12 x1; 3,4,5,6,8,9,10,11 x2
  const numbers = [
    2, 12,
    3, 3,
    4, 4,
    5, 5,
    6, 6,
    8, 8,
    9, 9,
    10, 10,
    11, 11,
  ];

  // Try until red numbers (6/8) are not adjacent
  for (let attempt = 0; attempt < 5000; attempt++) {
    const t = shuffle([...terrains]);
    const n = shuffle([...numbers]);

    // assign terrain first
    for (let i = 0; i < 19; i++) {
      hexes[i].terrain = t[i];
      hexes[i].number = null;
    }

    // assign numbers to non-desert
    let k = 0;
    for (let i = 0; i < 19; i++) {
      if (hexes[i].terrain === "desert") continue;
      hexes[i].number = n[k++];
    }

    // validate: no adjacent 6/8
    let ok = true;
    for (let i = 0; i < 19; i++) {
      if (!isRedNumber(hexes[i].number)) continue;
      for (const nb of hexNeighbors(i)) {
        if (isRedNumber(hexes[nb].number)) {
          ok = false;
          break;
        }
      }
      if (!ok) break;
    }

    if (ok) return true;
  }

  return false; // unlikely, but safe
}

// --- Scoring settlements ---
// Resource preference weights (tunable)
// High: ore + wheat, Medium: brick + wood, Low: sheep (wool)
const RESOURCE_WEIGHTS = {
  ore: 1.0,
  wheat: 1.0,
  brick: 0.7,
  wood: 0.7,
  sheep: 0.25,
};

function resourceWeight(r) {
  return RESOURCE_WEIGHTS[r] ?? 0.0;
}

function prettyResourceName(r) {
  // for display (wool vs sheep)
  if (r === "sheep") return "wool";
  return r;
}

function resourceOfTerrain(t) {
  if (t === "wood") return "wood";
  if (t === "brick") return "brick";
  if (t === "sheep") return "sheep";
  if (t === "wheat") return "wheat";
  if (t === "ore") return "ore";
  return null;
}

function computeScarcityWeights() {
  const counts = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  for (const h of hexes) {
    const r = resourceOfTerrain(h.terrain);
    if (r) counts[r]++;
  }
  const weights = {};
  for (const r of Object.keys(counts)) {
    weights[r] = counts[r] > 0 ? 1 / counts[r] : 0;
  }
  // normalize average to 1 (only for present resources)
  const present = Object.values(weights).filter((v) => v > 0);
  const avg = present.length ? present.reduce((a, b) => a + b, 0) / present.length : 1;
  for (const r of Object.keys(weights)) if (weights[r] > 0) weights[r] /= avg;
  return weights;
}

function vertexInfo(vKey) {
  const hexIdxSet = vertexAdjHexes.get(vKey);
  return { hexIdxSet };
}

function getNumberSet(hexIdxSet) {
  const s = new Set();
  for (const idx of hexIdxSet) {
    const n = hexes[idx].number;
    if (n != null) s.add(n);
  }
  return s;
}


function pairScore(a, b, vInfo) {
  const A = vInfo.get(a);
  const B = vInfo.get(b);

  // Count ALL contributions from both settlements (shared hex counted twice),
  // but only when a resource + number exists.
  let totalPips = 0;

  const counts = { ore: 0, wheat: 0, wood: 0, brick: 0, sheep: 0 };
  const resourcesPresent = new Set();

  const addHex = (idx) => {
    const h = hexes[idx];
    const r = resourceOfTerrain(h.terrain);
    if (!r) return;
    if (!h.number) return;

    resourcesPresent.add(r);

    const p = pipCount(h.number);
    totalPips += p;

    counts[r] = (counts[r] || 0) + 1; // count tiles (with numbers) by resource
  };

  for (const idx of A.hexIdxSet) addHex(idx);
  for (const idx of B.hexIdxSet) addHex(idx);

  const numResources = resourcesPresent.size;

  // Repeated tokens between the two intersections (multiset intersection by dice number)
  const countNums = (hexIdxSet) => {
    const c = new Map();
    for (const idx of hexIdxSet) {
      const n = hexes[idx].number;
      if (n == null) continue;
      c.set(n, (c.get(n) || 0) + 1);
    }
    return c;
  };
  const numsA = getNumberSet(A.hexIdxSet);
  const numsB = getNumberSet(B.hexIdxSet);

  let repeatedNumbers = 0;
  for (const n of numsA) {
    if (numsB.has(n)) repeatedNumbers++;
  }


  // ---- Scoring (multiplicative) ----
  // Your idea, with a small repetition penalty:
  // totalPips * numResources * 1.1^(#wheat + #ore) * 1.0^(#wood + #brick) * 0.9^(#sheep) * 0.95^(repeatedTokens)
  let score =
    Math.max(0, totalPips) *
    Math.max(0, numResources) *
    Math.pow(1.1, (counts.wheat || 0) + (counts.ore || 0)) *
    Math.pow(1.0, (counts.wood || 0) + (counts.brick || 0)) *
    Math.pow(0.9, (counts.sheep || 0)) *
    Math.pow(0.95, repeatedNumbers);

  // // Strong penalty for < 4 resources (keep your constraint)
  // if (numResources < 4) score *= 0.0001; // pushes these to the bottom

  return {
    score,
    unionSize: numResources, // used as "Resources covered"
  };
}

function computePairDetails(a, b, vInfo) {
  const A = vInfo.get(a);
  const B = vInfo.get(b);

  // Repeated tokens = repeated NUMBER TOKENS between the two settlement intersections.
  // We count how many dice numbers appear in BOTH intersections (multiset intersection via min counts).
  const countNums = (hexIdxSet) => {
    const counts = new Map();
    for (const idx of hexIdxSet) {
      const n = hexes[idx].number;
      if (n == null) continue;
      counts.set(n, (counts.get(n) || 0) + 1);
    }
    return counts;
  };

  const numsA = getNumberSet(A.hexIdxSet);
  const numsB = getNumberSet(B.hexIdxSet);

  const repeatedList = [];
  for (const n of numsA) {
    if (numsB.has(n)) repeatedList.push(String(n));
  }

  const repeatedNumbers = repeatedList.length;



  const unionHex = new Set([...A.hexIdxSet, ...B.hexIdxSet]);

  // Count ALL contributions from both settlements.
  // If a hex touches BOTH intersections, we count it twice (because both settlements would produce from it).
  let totalPips = 0;

  const order = ["wood", "brick", "sheep", "wheat", "ore"];
  const perRes = {};
  for (const r of order) perRes[r] = { prob: 0, pips: 0 };

  const addHex = (idx) => {
    const h = hexes[idx];
    const r = resourceOfTerrain(h.terrain);
    if (!r) return;
    if (!h.number) return;

    const pips = pipCount(h.number);
    totalPips += pips;

    perRes[r].prob += (DICE_P[h.number] ?? 0);
    perRes[r].pips += pips;
  };

  for (const idx of A.hexIdxSet) addHex(idx);
  for (const idx of B.hexIdxSet) addHex(idx);

  return {
    repeatedNumbers,
    repeatedList,
    totalPips,
    perRes,
    unionHexCount: unionHex.size,
  };
}


// --- SVG drawing (main and mini) ---
function settlementMarker(targetSvg, x, y, label) {
  const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  c.setAttribute("cx", x);
  c.setAttribute("cy", y);
  c.setAttribute("r", 12);
  c.setAttribute("fill", "rgba(0,0,0,0.70)");
  c.setAttribute("stroke", "rgba(255,255,255,0.75)");
  c.setAttribute("stroke-width", "2");
  c.style.pointerEvents = "none";
  targetSvg.appendChild(c);
  // No label text: clean marker only
}


function drawDiceButton(targetSvg) {
  const size = 52;
  const pad = 12;

  // literal bottom-right of the board view
  const x = bounds.minX + bounds.width - size - pad;
  const y = bounds.minY + bounds.height - size - pad;

  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.classList.add("dice-btn");

  // Dice face
  const face = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  face.setAttribute("x", x);
  face.setAttribute("y", y);
  face.setAttribute("width", size);
  face.setAttribute("height", size);
  face.setAttribute("rx", 10);
  face.setAttribute("fill", "#ffffff");
  face.setAttribute("stroke", "#111");
  face.setAttribute("stroke-width", "1.8");

  g.appendChild(face);

  // Dice pips (face = 5)
  const pips = [
    [x + 16, y + 16],
    [x + 36, y + 16],
    [x + 26, y + 26],
    [x + 16, y + 36],
    [x + 36, y + 36],
  ];

  for (const [px, py] of pips) {
    const pip = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    pip.setAttribute("cx", px);
    pip.setAttribute("cy", py);
    pip.setAttribute("r", 3.5);
    pip.setAttribute("fill", "#111");
    g.appendChild(pip);
  }

  // Label
  const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
  label.setAttribute("x", x + size / 2);
  label.setAttribute("y", y + size + 16);
  label.setAttribute("text-anchor", "middle");
  label.setAttribute("font-size", "12");
  label.setAttribute("fill", "#111");
  label.style.userSelect = "none";
  label.style.pointerEvents = "none";
  label.textContent = "Random";

  g.appendChild(label);

  // Click = randomize with confirmation
  g.addEventListener("click", (e) => {
    e.stopPropagation();

    // Only warn if the user has already edited the board
    if (!isDefaultBoard()) {
      const ok = window.confirm(
        "This action will erase the current board. Proceed?"
      );
      if (!ok) return;
    }

    const success = generateRandomStandardMap();
    if (!success) {
      alert("Failed to generate a valid map. Try again.");
      return;
    }

    resultsDiv.innerHTML = "";
    draw(svg, null);
  });

  targetSvg.appendChild(g);
}

function drawVertexPipSums(targetSvg) {
  // Sum pips for each vertex from adjacent hex numbers, then render a small label.
  for (const [vKey, hexIdxSet] of vertexAdjHexes.entries()) {
    let sum = 0;
    for (const idx of hexIdxSet) sum += pipCount(hexes[idx].number);
    if (sum <= 0) continue;

    const p = vertexPos.get(vKey);
    if (!p) continue;

    const bg = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    bg.setAttribute("cx", p.x);
    bg.setAttribute("cy", p.y);
    bg.setAttribute("r", 10.5);
    bg.setAttribute("fill", "rgba(0,0,0,0.55)");
    bg.style.pointerEvents = "none";
    targetSvg.appendChild(bg);

    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.setAttribute("x", p.x);
    t.setAttribute("y", p.y + 4.5);
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("font-size", "12");
    t.setAttribute("font-weight", "800");
    t.setAttribute("fill", "#fff");
    t.textContent = String(sum);
    t.style.pointerEvents = "none";
    t.style.userSelect = "none";
    targetSvg.appendChild(t);
  }
}


function draw(targetSvg, highlights /* {aKey,bKey} or null */, interactive = (targetSvg === svg)) {
  targetSvg.innerHTML = "";

  coords.forEach((c, i) => {
    const { x, y } = axialToPixel(c.q, c.r);
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");

    // Hex polygon
    const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    poly.setAttribute("points", hexPoints(x, y));
    poly.setAttribute("fill", COLORS[hexes[i].terrain] ?? "#ddd");
    poly.setAttribute("stroke", "#333");
    poly.setAttribute("stroke-width", "2");
    poly.classList.add("hex");

    if (interactive) {
      poly.addEventListener("click", (e) => {
        e.stopPropagation();

        const items = TERRAIN.map(t => ({
          label: t,
          value: t,
          swatch: COLORS[t] ?? "#ddd",
        }));

        openPicker("Select resource", items, (val) => {
          hexes[i].terrain = val;
          draw(svg, null, true);
        });
      });
    }

    g.appendChild(poly);

    // Token circle (number)
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", x);
    circle.setAttribute("cy", y);
    circle.setAttribute("r", 17);
    circle.setAttribute("fill", "#f5f5f5");
    circle.setAttribute("stroke", "#111");
    circle.setAttribute("stroke-width", "1.5");

    if (interactive) {
      circle.addEventListener("click", (e) => {
        e.stopPropagation();

        const items = NUMBER_CYCLE.map(n => ({
          label: (n == null ? "none" : String(n)),
          value: n,
          swatch: null,
        }));

        openPicker("Select number", items, (val) => {
          hexes[i].number = val;
          draw(svg, null, true);
        });
      });
    }

    g.appendChild(circle);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", x);
    text.setAttribute("y", y + 6);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("font-size", "16");
    text.setAttribute("font-weight", "800");
    text.setAttribute("fill", isRedNumber(hexes[i].number) ? "#c62828" : "#111");
    text.style.pointerEvents = "none";
    text.style.userSelect = "none";
    text.textContent = hexes[i].number ?? "";
    g.appendChild(text);

    // Pips under the token (main board only)
    if (interactive && targetSvg === svg && showPips) {
      const cnt = pipCount(hexes[i].number);
      if (cnt > 0) {
        const spacing = 6;        // distance between dots
        const r = 2.0;            // dot radius
        const startX = x - ((cnt - 1) * spacing) / 2;
        const yy = y + 22;        // vertical position under the token

        for (let k = 0; k < cnt; k++) {
          const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          dot.setAttribute("cx", startX + k * spacing);
          dot.setAttribute("cy", yy);
          dot.setAttribute("r", r);
          dot.setAttribute("fill", "rgba(0,0,0,0.75)");
          dot.style.pointerEvents = "none";
          g.appendChild(dot);
        }
      }
    }

    targetSvg.appendChild(g);
  });

  // Vertex pip sums (intersection totals) - main board only
  if (interactive && targetSvg === svg && showPips) {
    drawVertexPipSums(targetSvg);
  }

  // settlement highlights (for mini-maps)
  if (highlights?.aKey) {
    const p = vertexPos.get(highlights.aKey);
    if (p) settlementMarker(targetSvg, p.x, p.y, "1");
  }
  if (highlights?.bKey) {
    const p = vertexPos.get(highlights.bKey);
    if (p) settlementMarker(targetSvg, p.x, p.y, "2");
  }

  // only draw dice button on main board
  if (interactive && targetSvg === svg) drawDiceButton(targetSvg);
}

// initial draw
draw(svg, null, true);

/* --- Pips toggle + tooltip wiring (global) --- */
const pipsToggle = document.getElementById("toggle-pips");
const pipsInfoBtn = document.getElementById("pips-info");
const pipsTooltip = document.getElementById("pips-tooltip");

// Initialize showPips from the checkbox (default off unless HTML sets checked)
if (pipsToggle) {
  showPips = !!pipsToggle.checked;

  pipsToggle.addEventListener("change", () => {
    showPips = !!pipsToggle.checked;
    draw(svg, null, true);
  });
}

// Tooltip: hover shows; click toggles (useful on touchpads)
if (pipsInfoBtn && pipsTooltip) {
  const show = () => (pipsTooltip.style.display = "block");
  const hide = () => (pipsTooltip.style.display = "none");

  pipsInfoBtn.addEventListener("mouseenter", show);
  pipsInfoBtn.addEventListener("mouseleave", hide);
  pipsInfoBtn.addEventListener("focus", show);
  pipsInfoBtn.addEventListener("blur", hide);

  pipsInfoBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    pipsTooltip.style.display = (pipsTooltip.style.display === "block") ? "none" : "block";
  });

  document.addEventListener("click", () => hide());
}


function renderMiniMap(aKey, bKey) {
  const mini = document.createElementNS("http://www.w3.org/2000/svg", "svg");

  mini.setAttribute("preserveAspectRatio", "xMidYMid meet");
  setViewBox(mini);

  // Big preview, but responsive in the card
  // Responsive sizing is handled by CSS (.result-map)
  mini.classList.add("result-map");

  // Same sea background
  mini.style.background = getComputedStyle(svg).backgroundColor || "#cfefff";

  // IMPORTANT: results must not be clickable at all
  mini.style.pointerEvents = "none";

  // Draw static
  draw(mini, { aKey, bKey }, false);

  return mini;
}


document.getElementById("calculate").addEventListener("click", () => {
  // precompute vertex scores
  const vInfo = new Map();
  for (const vKey of vertexAdjHexes.keys()) {
    vInfo.set(vKey, vertexInfo(vKey));
  }

  const boardTotals = computeBoardPipTotals();

  const vertices = [...vInfo.keys()];

  // pairs obeying distance rule: not adjacent vertices
  const pairs = [];
  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      const a = vertices[i];
      const b = vertices[j];

      const neigh = vertexNeighbors.get(a);
      if (neigh && neigh.has(b)) continue;

      const ps = pairScore(a, b, vInfo);
      pairs.push({ a, b, ...ps });
    }
  }

  pairs.sort((x, y) => y.score - x.score);
  const top = pairs.slice(0, 18);

  resultsDiv.innerHTML = "";

  const intro = document.createElement("div");
  intro.innerHTML = `
    <div class="results-intro">
      <h2>Suggested openings</h2>

      <p>
        Below are the <b>suggested openings</b>. They are ranked using a score computed with the following formula:
      </p>

      <div class="formula">
        <span class="formula-var">score</span>
        =
        <span class="formula-var">totalPips</span>
        ×
        <span class="formula-var">numResources</span>
        ×
        1.1<sup>(#wheat + #ore)</sup>
        ×
        1.0<sup>(#wood + #brick)</sup>
        ×
        0.9<sup>(#sheep)</sup>
        ×
        0.95<sup>(repeatedNumbers)</sup>
      </div>

      <p>
        This score prioritizes openings with a high <b>total number of pips</b> and a larger
        <b>number of distinct resources covered</b>, while assigning more weight to wheat and ore,
        followed by wood and brick, and lastly sheep.
        Additionally, repeated dice numbers across the two settlements are lightly penalized to reduce production variance.
      </p>

      <p>
        The above formula was designed after reading the following strategy guides and discussions: <a href="https://www.instructables.com/Catan-strategy-guide/">instructables</a>, <a href="https://medium.com/@noahmiller400/17-advanced-tactics-to-win-more-settlers-of-catan-2d9280b7fa4b">Noah Miller</a>, <a href="https://christopherberry.ca/what-to-expect-when-youre-expecting-to-play-catan/">Christopher Berry</a>, <a href="https://boardgamegeek.com/thread/1744303/counting-pips-for-resources">boardgamegeek</a>.
      </p>

      <p>
        Please note that there are many different strategies that can be applied in this game. Moreover, this analysis does not consider
        other players, alternative board sizes, or additional tile types. As a result, capturing the full complexity of opening placements
        in a single formula is inherently challenging. These suggested openings should therefore be taken as <b>mere inspiration rather than absolute truth</b>.
      </p>
    </div>
  `;
  resultsDiv.appendChild(intro);


  const grid = document.createElement("div");
  grid.className = "results-grid";
  resultsDiv.appendChild(grid);



  top.forEach((r, idx) => {
    const card = document.createElement("div");
    card.className = "result-card";

    const header = document.createElement("div");
    header.className = "card-top";
    header.innerHTML = `<div style="font-weight:800">#${idx + 1}</div>`;
    card.appendChild(header);

    const meta = document.createElement("div");
    meta.className = "card-subrow";

    const details = computePairDetails(r.a, r.b, vInfo);

    const left = document.createElement("div");
    left.innerHTML = `Resources covered: <b>${r.unionSize}</b> · Repeated Numbers: <b>${details.repeatedNumbers}</b> · Total pips: <b>${details.totalPips}</b>`;

    const info = document.createElement("div");
    info.className = "stat-info";
    info.innerHTML = `
      <button type="button" class="stat-info-btn" aria-label="About these stats">i</button>
      <div class="stat-tooltip">
        <b>Resources covered</b> is the number of different type of resources touched by the two settlements.<br>
        <b>Repeated numbers</b> counts how many repeated token numbers appear in both settlements.<br>
        <b>Total pips</b> is the sum of all the pips from both the settlements.<br>
        <b>Coverage</b> shows how much the settlements cover of each type of resource.
      </div>
    `;


    meta.appendChild(left);
    meta.appendChild(info);
    card.appendChild(meta);

    const mini = renderMiniMap(r.a, r.b);
    mini.style.marginTop = "10px";
    card.appendChild(mini);


    const breakdown = document.createElement("div");
    breakdown.className = "res-breakdown";

    const pretty = {
      wood: { name: "wood", color: "#2e7d32" },
      brick: { name: "brick", color: "#c62828" },
      sheep: { name: "sheep", color: "#7cb342" },
      wheat: { name: "wheat", color: "#f9a825" },
      ore: { name: "ore", color: "#546e7a" },
    };

    // Build resource rows sorted by descending COVERAGE:
    // coverage(resource) = opening_pips(resource) / board_total_pips(resource)
    const keys = ["wood", "brick", "sheep", "wheat", "ore"]
      .map((k) => {
        const openP = details.perRes[k]?.pips ?? 0;
        const totP = boardTotals[k] ?? 0;
        const cov = totP > 0 ? openP / totP : 0;
        return { k, openP, totP, cov };
      })
      .filter((x) => x.openP > 0 && x.totP > 0)
      .sort((a, b) => b.cov - a.cov);

    for (const item of keys) {
      const key = item.k;

      const row = document.createElement("div");
      row.className = "res-row";

      const icon = document.createElement("span");
      icon.className = "res-icon";
      icon.style.setProperty("--c", pretty[key].color);

      const name = document.createElement("span");
      name.className = "res-name";
      name.textContent = pretty[key].name;

      const metrics = document.createElement("span");
      metrics.className = "res-metrics";
      const pct = (item.cov * 100);
      metrics.textContent = `${item.openP} / ${item.totP} (${pct.toFixed(1)}%)`;

      row.appendChild(icon);
      row.appendChild(name);
      row.appendChild(metrics);
      breakdown.appendChild(row);
    }

    // Total coverage across all resources (opening total pips / board total pips)
    const totalRow = document.createElement("div");
    totalRow.className = "res-row";
    totalRow.style.marginTop = "6px";
    totalRow.style.paddingTop = "6px";
    totalRow.style.borderTop = "1px solid rgba(0,0,0,0.10)";

    const totalIcon = document.createElement("span");
    totalIcon.className = "res-icon";
    totalIcon.style.setProperty("--c", "rgba(17,17,17,0.35)");

    const totalName = document.createElement("span");
    totalName.className = "res-name";
    totalName.textContent = "total";

    const totalMetrics = document.createElement("span");
    totalMetrics.className = "res-metrics";
    const totalCov = (boardTotals && boardTotals._all > 0) ? (details.totalPips / boardTotals._all) : 0;
    totalMetrics.textContent = `${details.totalPips} / ${boardTotals._all} (${(totalCov * 100).toFixed(1)}%)`;

    totalRow.appendChild(totalIcon);
    totalRow.appendChild(totalName);
    totalRow.appendChild(totalMetrics);
    breakdown.appendChild(totalRow);

    if (breakdown.childNodes.length > 0) card.appendChild(breakdown);

    grid.appendChild(card);
  });
});

document.getElementById("reset").addEventListener("click", () => {
  // Only warn if the user has already edited the board
  if (!isDefaultBoard()) {
    const ok = window.confirm(
      "Are you sure you want to reset the board?"
    );
    if (!ok) return;
  }

  for (const h of hexes) {
    h.terrain = "desert";
    h.number = null;
  }
  resultsDiv.innerHTML = "";
  draw(svg, null, true);
});
