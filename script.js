const CELL_SIZE = 14;
const GRID_SIZE = 40;

let collectibles = [];
const NUM_COLLECTIBLES = 500;

let username = localStorage.getItem("conpacUsername") || "";

let grid = [];
let running = false;
let generation = 0;
let lifeInterval = null;
let activePointerInterval = null;
let lifeSpeed = 300;

let playerX = Math.floor(GRID_SIZE / 2);
let playerY = Math.floor(GRID_SIZE / 2);
let playerAlive = true;
let playerDir = "right";
let mouthOpen = true;

const gliderCoords = [
  [0, 1],
  [1, 2],
  [2, 0],
  [2, 1],
  [2, 2],
];

// Middle-weight spaceship (MWSS)
const mwssCoords = [
  [1, 0],
  [2, 0],
  [3, 0],
  [4, 0],

  [0, 1],
  [4, 1],

  [4, 2],

  [0, 3],
  [3, 3],
];

// Lightweight spaceship (LWSS)
const lwssCoords = [
  [1, 0],
  [4, 0],

  [0, 1],

  [0, 2],
  [4, 2],

  [0, 3],
  [1, 3],
  [2, 3],
  [3, 3],
];

let score = 0;

let ghosts = [];
const NUM_GHOSTS = 6;
const GHOST_MIN_DISTANCE = 8; // tiles away from player

const canvas = document.getElementById("life-canvas");
const ctx = canvas.getContext("2d");

let lastMoveTime = 0;
const MOVE_COOLDOWN = 150; // ms

function safeMovePlayer(dx, dy, dir) {
  const now = Date.now();
  if (now - lastMoveTime < MOVE_COOLDOWN) return;
  lastMoveTime = now;

  movePlayer(dx, dy, dir);
}

function bindPointerButton(id, onDown) {
  const el = document.getElementById(id);
  if (!el) return;

  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    stopPointerMovement();
    onDown(); // immediate move

    activePointerInterval = setInterval(onDown, 50);
  });
}

function stopPointerMovement() {
  if (activePointerInterval) {
    clearInterval(activePointerInterval);
    activePointerInterval = null;
  }

  if (document.pointerLockElement) {
    document.exitPointerLock();
  }
}

document.addEventListener("pointerup", stopPointerMovement);
document.addEventListener("pointercancel", stopPointerMovement);
document.addEventListener("touchend", stopPointerMovement);
document.addEventListener("mouseup", stopPointerMovement);

bindPointerButton("up-btn", () => {
  if (!running) startLife();
  safeMovePlayer(0, -1, "up");
});
bindPointerButton("down-btn", () => {
  if (!running) startLife();
  safeMovePlayer(0, 1, "down");
});
bindPointerButton("left-btn", () => {
  if (!running) startLife();
  safeMovePlayer(-1, 0, "left");
});
bindPointerButton("right-btn", () => {
  if (!running) startLife();
  safeMovePlayer(1, 0, "right");
});

function initGrid() {
  score = 0;
  generation = 0;
  collectibles = [];
  // Reset player
  playerX = Math.floor(GRID_SIZE / 2);
  playerY = Math.floor(GRID_SIZE / 2);
  playerAlive = true;

  // Clear the grid
  grid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
  generation = 0;

  // Helper: checks if a cell is within 2 spaces of player
  function tooCloseToPlayer(x, y) {
    return Math.abs(x - playerX) <= 2 && Math.abs(y - playerY) <= 2;
  }

  // Place 350 random live cells avoiding player
  let placed = 0;
  while (placed < 300) {
    const x = Math.floor(Math.random() * GRID_SIZE);
    const y = Math.floor(Math.random() * GRID_SIZE);
    if (!grid[y][x] && !tooCloseToPlayer(x, y)) {
      grid[y][x] = 1;
      placed++;
    }
  }
  placeCollectibles();
  initGhosts();
  drawGrid();
}

function initGhosts() {
  ghosts = [];
  let placed = 0;

  const colors = [
    "#ff0000",
    "#00ff00",
    "#0000ff",
    "#ff00ff",
    "#00ffff",
    "#ffaa00",
  ];

  while (placed < NUM_GHOSTS) {
    const x = Math.floor(Math.random() * GRID_SIZE);
    const y = Math.floor(Math.random() * GRID_SIZE);

    const dist = Math.hypot(x - playerX, y - playerY);

    if (!grid[y][x] && dist >= GHOST_MIN_DISTANCE) {
      ghosts.push({
        x,
        y,
        color: colors[placed % colors.length],
      });
      placed++;
    }
  }
}

function placeGlider() {
  // Define the four corners
  const corners = [
    { x: 0, y: 0, flipX: false, flipY: false }, // top-left
    { x: GRID_SIZE - 3, y: 0, flipX: true, flipY: false }, // top-right
    { x: 0, y: GRID_SIZE - 3, flipX: false, flipY: true }, // bottom-left
    { x: GRID_SIZE - 3, y: GRID_SIZE - 3, flipX: true, flipY: true }, // bottom-right
  ];

  // Pick a random corner
  const corner = corners[Math.floor(Math.random() * corners.length)];
  const gx = corner.x;
  const gy = corner.y;

  // Adjust coordinates based on flip
  const coords = gliderCoords.map(([dx, dy]) => {
    let x = corner.flipX ? 2 - dx : dx;
    let y = corner.flipY ? 2 - dy : dy;
    return [x, y];
  });

  // Check if space is empty
  const canPlace = coords.every(([dx, dy]) => {
    const x = gx + dx;
    const y = gy + dy;
    return (
      x >= 0 &&
      x < GRID_SIZE &&
      y >= 0 &&
      y < GRID_SIZE &&
      !grid[y][x] &&
      !(x === playerX && y === playerY)
    );
  });

  if (!canPlace) return false; // abort if blocked

  // Place the glider
  for (const [dx, dy] of coords) {
    grid[gy + dy][gx + dx] = 1;
  }

  showMessage("⚡ A glider has entered the arena! Watch it soar!", 3000);
  return true;
}

function placeMWSS() {
  const corners = [
    { x: 0, y: 0, flipX: false, flipY: false },
    { x: GRID_SIZE - 5, y: 0, flipX: true, flipY: false },
    { x: 0, y: GRID_SIZE - 4, flipX: false, flipY: true },
    { x: GRID_SIZE - 5, y: GRID_SIZE - 4, flipX: true, flipY: true },
  ];

  const corner = corners[Math.floor(Math.random() * corners.length)];
  const baseX = corner.x;
  const baseY = corner.y;

  const coords = mwssCoords.map(([dx, dy]) => {
    const x = corner.flipX ? 4 - dx : dx;
    const y = corner.flipY ? 3 - dy : dy;
    return [x, y];
  });

  const canPlace = coords.every(([dx, dy]) => {
    const x = baseX + dx;
    const y = baseY + dy;
    return (
      x >= 0 &&
      x < GRID_SIZE &&
      y >= 0 &&
      y < GRID_SIZE &&
      !grid[y][x] &&
      !(x === playerX && y === playerY)
    );
  });

  if (!canPlace) return false;

  for (const [dx, dy] of coords) {
    grid[baseY + dy][baseX + dx] = 1;
  }

  showMessage(
    "🚀 MWSS detected! A meduim sized ship is cruising through space!",
    3000
  );
  return true;
}

function placeLWSS() {
  const corners = [
    { x: 0, y: 0, flipX: false, flipY: false },
    { x: GRID_SIZE - 5, y: 0, flipX: true, flipY: false },
    { x: 0, y: GRID_SIZE - 4, flipX: false, flipY: true },
    { x: GRID_SIZE - 5, y: GRID_SIZE - 4, flipX: true, flipY: true },
  ];

  const corner = corners[Math.floor(Math.random() * corners.length)];
  const baseX = corner.x;
  const baseY = corner.y;

  const coords = lwssCoords.map(([dx, dy]) => {
    const x = corner.flipX ? 4 - dx : dx;
    const y = corner.flipY ? 3 - dy : dy;
    return [x, y];
  });

  const canPlace = coords.every(([dx, dy]) => {
    const x = baseX + dx;
    const y = baseY + dy;
    return (
      x >= 0 &&
      x < GRID_SIZE &&
      y >= 0 &&
      y < GRID_SIZE &&
      !grid[y][x] &&
      !(x === playerX && y === playerY)
    );
  });

  if (!canPlace) return false;

  for (const [dx, dy] of coords) {
    grid[baseY + dy][baseX + dx] = 1;
  }

  showMessage("🛸 LWSS incoming! Fast-moving debris detected!", 3000);
  return true;
}

function placeCollectibles(num = NUM_COLLECTIBLES) {
  let placed = 0;

  while (placed < num) {
    const x = Math.floor(Math.random() * GRID_SIZE);
    const y = Math.floor(Math.random() * GRID_SIZE);

    if (
      !grid[y][x] &&
      !(x === playerX && y === playerY) &&
      !collectibles.some((c) => !c.collected && c.x === x && c.y === y)
    ) {
      collectibles.push({ x, y, collected: false });
      placed++;
    }
  }
}

function drawGhost(g) {
  const x = g.x * CELL_SIZE;
  const y = g.y * CELL_SIZE;
  const size = CELL_SIZE;
  const r = size / 2;

  ctx.save();
  ctx.fillStyle = g.color;
  ctx.beginPath();

  // === START AT BOTTOM LEFT ===
  ctx.moveTo(x, y + size);

  // === WAVY BOTTOM ===
  const waves = 4;
  const waveWidth = size / waves;

  for (let i = 0; i < waves; i++) {
    ctx.quadraticCurveTo(
      x + waveWidth * i + waveWidth / 2,
      y + size - size * 0.25,
      x + waveWidth * (i + 1),
      y + size
    );
  }

  // === RIGHT SIDE UP ===
  ctx.lineTo(x + size, y + r);

  // === ROUNDED HEAD ===
  ctx.arc(x + r, y + r, r, 0, Math.PI, true);

  // === LEFT SIDE DOWN ===
  ctx.lineTo(x, y + size);

  ctx.closePath();
  ctx.fill();

  // === EYES ===
  const eyeRadius = size * 0.12;
  const pupilRadius = eyeRadius * 0.6;

  const leftEyeX = x + size * 0.35;
  const rightEyeX = x + size * 0.65;
  const eyeY = y + size * 0.45;

  const dx = Math.sign(playerX - g.x);
  const dy = Math.sign(playerY - g.y);

  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.arc(leftEyeX, eyeY, eyeRadius, 0, Math.PI * 2);
  ctx.arc(rightEyeX, eyeY, eyeRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#003572ff";
  ctx.beginPath();
  ctx.arc(
    leftEyeX + dx * eyeRadius * 0.4,
    eyeY + dy * eyeRadius * 0.4,
    pupilRadius,
    0,
    Math.PI * 2
  );
  ctx.arc(
    rightEyeX + dx * eyeRadius * 0.4,
    eyeY + dy * eyeRadius * 0.4,
    pupilRadius,
    0,
    Math.PI * 2
  );
  ctx.fill();

  ctx.restore();
}

function drawPacman() {
  const cx = playerX * CELL_SIZE + CELL_SIZE / 2;
  const cy = playerY * CELL_SIZE + CELL_SIZE / 2;
  const r = CELL_SIZE / 2;

  let angleOffset = 0;
  switch (playerDir) {
    case "right":
      angleOffset = 0;
      break;
    case "down":
      angleOffset = Math.PI / 2;
      break;
    case "left":
      angleOffset = Math.PI;
      break;
    case "up":
      angleOffset = -Math.PI / 2;
      break;
  }

  const mouthAngle = mouthOpen ? Math.PI / 3 : Math.PI / 10;

  ctx.fillStyle = "#f2ff3bff";
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(
    cx,
    cy,
    r,
    angleOffset + mouthAngle,
    angleOffset + Math.PI * 2 - mouthAngle
  );
  ctx.closePath();
  ctx.fill();
}

function drawGrid() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (grid[y][x]) {
        // Draw cell
        ctx.fillStyle = "black";
        ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);

        // Draw walls only where neighbor is empty
        ctx.strokeStyle = "#172aa1ff"; // wall color
        ctx.lineWidth = 3;

        // top
        if (y === 0 || !grid[y - 1][x]) {
          ctx.beginPath();
          ctx.moveTo(x * CELL_SIZE, y * CELL_SIZE);
          ctx.lineTo((x + 1) * CELL_SIZE, y * CELL_SIZE);
          ctx.stroke();
        }
        // bottom
        if (y === GRID_SIZE - 1 || !grid[y + 1][x]) {
          ctx.beginPath();
          ctx.moveTo(x * CELL_SIZE, (y + 1) * CELL_SIZE);
          ctx.lineTo((x + 1) * CELL_SIZE, (y + 1) * CELL_SIZE);
          ctx.stroke();
        }
        // left
        if (x === 0 || !grid[y][x - 1]) {
          ctx.beginPath();
          ctx.moveTo(x * CELL_SIZE, y * CELL_SIZE);
          ctx.lineTo(x * CELL_SIZE, (y + 1) * CELL_SIZE);
          ctx.stroke();
        }
        // right
        if (x === GRID_SIZE - 1 || !grid[y][x + 1]) {
          ctx.beginPath();
          ctx.moveTo((x + 1) * CELL_SIZE, y * CELL_SIZE);
          ctx.lineTo((x + 1) * CELL_SIZE, (y + 1) * CELL_SIZE);
          ctx.stroke();
        }
      }
    }
  }

  // Draw collectibles
  for (const c of collectibles) {
    if (!c.collected) {
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#ff8c00ff"; // gold
      ctx.beginPath();
      ctx.arc(
        c.x * CELL_SIZE + CELL_SIZE / 2,
        c.y * CELL_SIZE + CELL_SIZE / 2,
        CELL_SIZE / 5,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }

  for (const g of ghosts) {
    drawGhost(g);
  }

  // Draw the player
  if (playerAlive) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#f2ff3bff";
    if (playerAlive) {
      drawPacman();
    }
  }
}

function moveGhosts() {
  for (const g of ghosts) {
    if (!playerAlive) return;

    let bestMove = { dx: 0, dy: 0 };
    let minDist = Infinity;

    // Try all 4 directions
    const directions = [
      { dx: 0, dy: -1 }, // up
      { dx: 0, dy: 1 }, // down
      { dx: -1, dy: 0 }, // left
      { dx: 1, dy: 0 }, // right
    ];

    for (const dir of directions) {
      const newX = g.x + dir.dx;
      const newY = g.y + dir.dy;

      // Check bounds and walls
      if (newX < 0 || newX >= GRID_SIZE || newY < 0 || newY >= GRID_SIZE)
        continue;
      if (grid[newY][newX]) continue; // can't go through live cells (walls)

      // Manhattan distance to player
      const dist = Math.abs(playerX - newX) + Math.abs(playerY - newY);
      if (dist < minDist) {
        minDist = dist;
        bestMove = dir;
      }
    }

    // 40% chance to ignore optimal move and move randomly
    if (Math.random() < 0.4) {
      const possibleMoves = directions.filter((dir) => {
        const nx = g.x + dir.dx;
        const ny = g.y + dir.dy;
        return (
          nx >= 0 &&
          nx < GRID_SIZE &&
          ny >= 0 &&
          ny < GRID_SIZE &&
          !grid[ny][nx]
        );
      });
      if (possibleMoves.length > 0) {
        bestMove =
          possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
      }
    }

    g.x += bestMove.dx;
    g.y += bestMove.dy;

    // Check collision with player
    if (g.x === playerX && g.y === playerY) {
      playerAlive = false;
      endGame("Caught by a ghost! 👻");
    }
  }
}

function stepLife() {
  mouthOpen = !mouthOpen;
  moveGhosts();
  updateScoreDisplay();
  const next = grid.map((row) => [...row]);

  // Speed up game after 500 total score
  if (getTotalScore() > 500 && lifeSpeed === 300) {
    lifeSpeed = 190; // faster
    clearInterval(lifeInterval);
    lifeInterval = setInterval(stepLife, lifeSpeed);
    showMessage("🔥 Game speed increased!", 2000);
  }

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const n = countNeighbors(x, y);
      if (grid[y][x]) {
        next[y][x] = n === 2 || n === 3 ? 1 : 0;
      } else {
        next[y][x] = n === 3 ? 1 : 0;
      }
    }
  }

  grid = next;
  generation++;

  // Remove collectibles that get covered by live cells
  for (const c of collectibles) {
    if (!c.collected && grid[c.y][c.x]) {
      c.collected = true; // silently remove it, no score
    }
  }

  // ⚠️ New: check if player is now on a live cell
  if (playerAlive && grid[playerY][playerX]) {
    playerAlive = false;
    endGame("The walls grew onto you! Watch your surroundings more next time.");
  }

  // Place glider every 100 generations
  if (generation % 100 === 0) {
    placeGlider();
  }

  if (generation % 125 === 0) {
    placeMWSS();
  }

  if (generation % 175 === 0) {
    placeLWSS();
  }

  drawGrid();

  if (grid.flat().every((c) => c === 0)) {
    endGame("You have experienced the slow death of the universe.");
  }
}

let gameOver = false;
let activeTimeouts = [];
let canPlayGame = false;

function getTotalScore() {
  return score + generation;
}

canPlayGame = sessionStorage.getItem("conpacCanPlay") === "true";

const messageContainer = document.getElementById("message-container");

function handleFirstKeypress(e) {
  const activeEl = document.activeElement;
  const openModal = document.querySelector(".modal.show");

  if (
    (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA") &&
    openModal
  ) {
    return;
  }

  if (/^[a-zA-Z]$/.test(e.key) || e.key === "Enter" || e.key === "Backspace") {
    document.removeEventListener("keydown", handleFirstKeypress);
  }
}

async function enableWebLN() {
  if (typeof WebLN === "undefined") {
    console.info("WebLN not available; QR payment will be used.");
    return false;
  }

  try {
    const webln = await WebLN.requestProvider();
    await webln.enable();
    console.log("WebLN enabled successfully!");
    return true;
  } catch (error) {
    console.warn("WebLN enable failed; falling back to QR:", error);
    return false;
  }
}

function setSafeTimeout(fn, delay) {
  const id = setTimeout(fn, delay);
  activeTimeouts.push(id);
}

function canPlayFreeGameToday() {
  const today = new Date().toISOString().split("T")[0];
  const lastPlayDate = localStorage.getItem("conpacLastPlayDate");

  return lastPlayDate !== today;
}

function markFreeGamePlayed() {
  const today = new Date().toISOString().split("T")[0];
  localStorage.setItem("conpacLastPlayDate", today);
}

function showMessage(text, duration = 2000) {
  if (!messageContainer) return;

  messageContainer.textContent = text;
  messageContainer.classList.add("show");

  setTimeout(() => {
    messageContainer.classList.remove("show");
  }, duration);
}

function showError(text, duration = 3000) {
  activeTimeouts.forEach(clearTimeout);
  activeTimeouts = [];
  messageContainer.textContent = text;
  messageContainer.classList.add("show", "error");
  setSafeTimeout(() => {
    messageContainer.classList.remove("show", "error");
  }, duration);
}

function updateScoreDisplay() {
  const scoreEl = document.getElementById("score-display");
  const genEl = document.getElementById("gen-display");
  const bitEl = document.getElementById("bit-display");
  if (!scoreEl) return;
  scoreEl.innerHTML = `Total: <strong>${getTotalScore()}</strong>`;
  genEl.innerHTML = `Generations: <strong>${generation}</strong>`;
  bitEl.innerHTML = `Bitcoin: <strong>${score}</strong>`;
}

async function startNewGame() {
  score = 0;
  generation = 0;
  collectibles = [];
  gameOver = false;
  running = false;
  clearInterval(lifeInterval);

  activeTimeouts.forEach(clearTimeout);
  activeTimeouts = [];

  let paymentRequired = !canPlayFreeGameToday();

  if (!paymentRequired) {
    markFreeGamePlayed();
  }

  if (paymentRequired) {
    showMessage("Payment required to continue playing...");
    inputLocked = true;

    const paid = await handlePayment();
    if (!paid) {
      showMessage("Payment not completed.");
      canPlayGame = false;
      return;
    }
  }

  canPlayGame = true;
  sessionStorage.setItem("conpacCanPlay", "true");

  initGrid();

  closeModal("game-over-modal");
}

async function generateInvoiceForBlink(amountSats) {
  try {
    const usernameSafe = username || "Anonymous";
    const resp = await fetch("/api/create-invoice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        amount: amountSats,
        memo: `Conpac Game Payment - ${usernameSafe}`,
      }),
    });

    const text = await resp.text();
    console.log("Raw response:", text);
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.error("Response is not JSON");
      throw new Error("Failed to generate invoice: non-JSON response");
    }

    if (!resp.ok || !data.paymentRequest) {
      console.error("Invoice data missing paymentRequest:", data);
      throw new Error("Failed to generate invoice");
    }

    return data.paymentRequest;
  } catch (err) {
    console.error("Invoice generation error:", err);
    throw err;
  }
}

async function payInvoice(paymentRequest) {
  if (typeof WebLN === "undefined") throw new Error("WebLN not available");

  try {
    const webln = await WebLN.requestProvider();
    await webln.enable();
    await webln.sendPayment(paymentRequest);
  } catch (err) {
    throw new Error(`Payment failed ${err.message}`);
  }
}

async function payWithQR(amountSats) {
  const tipBtn = document.getElementById("tip-btn");
  tipBtn.disabled = true;
  const usernameSafe = username || "Anonymous";
  const memo = `Conpac Game Payment - ${usernameSafe}`;

  try {
    const resp = await fetch("/api/create-invoice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ amount: amountSats, memo }),
    });

    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      console.error("Failed to parse JSON from server:", text, err);
      showError("Payment failed: invalid server response.");
      tipBtn.disabled = false;
      return false;
    }

    if (!resp.ok || !data.paymentRequest || !data.paymentHash) {
      console.error("Invalid invoice data from server:", data);
      showError("Could not generate invoice. Please try again.");
      tipBtn.disabled = false;
      return false;
    }

    const invoice = data.paymentRequest;
    const paymentHash = data.paymentHash;

    showModal("payment-qr-modal");

    const canvas = document.getElementById("qr-code");
    const ctx = canvas.getContext("2d");
    canvas.width = 200;
    canvas.height = 200;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    await QRCode.toCanvas(canvas, invoice, { width: 200 });

    const invoiceText = document.getElementById("invoice-text");
    invoiceText.value = invoice;

    document.getElementById("copy-invoice-btn").onclick = async () => {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(invoiceText.value);
        } else {
          invoiceText.select();
          document.execCommand("copy");
        }
        document.getElementById("qr-status").textContent = "Invoice copied 📋";
      } catch (err) {
        invoiceText.select();
        document.execCommand("copy");
        document.getElementById("qr-status").textContent = "Invoice copied 📋";
      }
    };

    document.getElementById("close-qr-btn").onclick = () => {
      closeModal("payment-qr-modal");
      closeModal("game-over-modal");
      showMessage("Payment still pending. You can continue browsing.");
    };

    const statusEl = document.getElementById("qr-status");
    statusEl.textContent = "Waiting for payment...";

    const paid = await waitForPayment(paymentHash, statusEl);
    if (paid) {
      showMessage("Payment received! Thank you!");
      closeModal("payment-qr-modal");
      tipBtn.disabled = false;
      return true;
    } else {
      showError("Payment not received. Invoice expired.");
      closeModal("payment-qr-modal");
      tipBtn.disabled = false;
      return false;
    }
  } catch (err) {
    console.error("QR payment failed:", err);
    showError("Payment failed. Please try again.");
    tipBtn.disabled = false;
    return false;
  }
}

function waitForPayment(paymentHash, statusEl, timeout = 5 * 60 * 1000) {
  return new Promise((resolve) => {
    const start = Date.now();

    const interval = setInterval(async () => {
      if (Date.now() - start > timeout) {
        clearInterval(interval);
        resolve(false);
        return;
      }

      try {
        const resp = await fetch(
          `/api/check-invoice?paymentHash=${paymentHash}`,
          {
            cache: "no-store",
          }
        );

        if (!resp.ok) throw new Error(`Invoice check failed: ${resp.status}`);

        let data;
        const contentType = resp.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          try {
            data = await resp.json();
          } catch (jsonErr) {
            const text = await resp.text();
            console.error("Failed to parse JSON in waitForPayment:", text);
            return;
          }
        } else {
          const text = await resp.text();
          console.error("Non-JSON response in waitForPayment:", text);
          return;
        }

        if (data.paid) {
          clearInterval(interval);
          statusEl.textContent = "Payment received!";
          resolve(true);
        }
      } catch (err) {
        console.error("waitForPayment error:", err);
      }
    }, 1000);
  });
}

async function handlePayment() {
  const tipBtn = document.getElementById("tip-btn");
  tipBtn.style.display = "inline-block";
  tipBtn.disabled = true;

  try {
    if (typeof WebLN !== "undefined") {
      try {
        const invoice = await generateInvoiceForBlink(100);
        await payInvoice(invoice);
        showMessage("Payment received! Game unlocked ⚡");
        tipBtn.disabled = false;
        return true;
      } catch (weblnErr) {
        console.warn("WebLN failed, falling back to QR:", weblnErr);
      }
    }
    const usernameSafe = username || "Anonymous";
    const memo = `Conpac Game Payment - ${usernameSafe}`;
    const qrSuccess = await payWithQR(100, memo);
    tipBtn.disabled = false;
    return qrSuccess;
  } catch (err) {
    console.error("Payment failed:", err);
    showError("Payment failed. Please try again.");
    tipBtn.disabled = false;
    return false;
  }
}

let inputLocked = false;

function showModal(modalId) {
  document.getElementById(modalId).classList.add("show");
}
function closeModal(modalId) {
  document.getElementById(modalId).classList.remove("show");
}

function showGameOver(reason = "") {
  const title = document.getElementById("game-over-title");
  const message = document.getElementById("game-over-message");
  const answerDiv = document.getElementById("game-over-answer");

  canPlayGame = false;
  sessionStorage.removeItem("conpacCanPlay");

  title.textContent = "☠️ Extinction Event ☠️";
  message.textContent =
    reason || "You have experienced the slow death of the universe.";
  answerDiv.innerHTML = "";

  showModal("game-over-modal");
}

async function loadStats() {
  let stats = { played: 0, best_score: 0, last_score: 0 };
  const localStats = JSON.parse(localStorage.getItem("conpacStats") || "{}");

  const userId = localStorage.getItem("conpacUserId");
  if (userId) {
    try {
      const resp = await fetch(
        `https://conpac-backend.jasonbohio.workers.dev/api/user/${userId}`
      );
      if (resp.ok) {
        const backendStats = await resp.json();
        stats.played = backendStats.played ?? localStats.played ?? 0;
        stats.best_score =
          backendStats.best_score ?? localStats.best_score ?? 0;
        stats.last_score =
          backendStats.last_score ?? localStats.last_score ?? 0;
      } else {
        stats = localStats;
      }
    } catch (err) {
      stats = localStats;
    }
  } else {
    stats = localStats;
  }

  document.getElementById("played").textContent = stats.played;
  document.getElementById("best-score").textContent = stats.best_score;
  document.getElementById("last-score").textContent = stats.last_score;
}

async function updateStats() {
  const statsKey = "conpacStats";
  const finalScore = getTotalScore();

  const stats = JSON.parse(localStorage.getItem(statsKey)) || {
    played: 0,
    best_score: 0,
    last_score: 0,
  };

  stats.played++;
  stats.last_score = finalScore;
  stats.best_score = Math.max(stats.best_score, finalScore);

  localStorage.setItem(statsKey, JSON.stringify(stats));

  // Update DOM immediately
  document.getElementById("played").textContent = stats.played;
  document.getElementById("best-score").textContent = stats.best_score;
  document.getElementById("last-score").textContent = stats.last_score;
}

function pauseLife() {
  running = false;
  clearInterval(lifeInterval);
}

async function endGame(reason = false) {
  pauseLife();
  gameOver = true;
  await updateStats();
  showGameOver(`${reason} Score: ${getTotalScore()}`);
  const nostr = JSON.parse(localStorage.getItem("conpacNostr") || "null");
  try {
    const res = await fetch(
      "https://conpac-backend.jasonbohio.workers.dev/api/submit-score",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pubkey: nostr?.pubkey,
          username: localStorage.getItem("conpacUsername"),
          high_score: getTotalScore(),
          picture: nostr?.picture || null,
          lud16: nostr?.lud16 || null,
          lud06: nostr?.lud06 || null,
        }),
      }
    );

    if (!res.ok) {
      console.error("Failed to submit score:", res.status, await res.text());
    } else {
      console.log("Score submitted successfully!");
    }
  } catch (err) {
    console.error("Error submitting score:", err);
  }
}

function movePlayer(dx, dy, dir) {
  if (!canPlayGame || !playerAlive) return;

  playerDir = dir;

  const newX = playerX + dx;
  const newY = playerY + dy;

  if (newX >= 0 && newX < GRID_SIZE) playerX = newX;
  if (newY >= 0 && newY < GRID_SIZE) playerY = newY;

  // Check collision with life
  if (grid[playerY][playerX]) {
    playerAlive = false;
    endGame("You were eaten by the walls! Watch out next time.");
  }

  let replenishing = false;

  // Check collectibles
  for (const c of collectibles) {
    if (!c.collected && c.x === playerX && c.y === playerY) {
      c.collected = true;
      score += 5;

      const remaining = collectibles.filter((c) => !c.collected).length;

      if (remaining === 10 && !replenishing) {
        replenishing = true;
        placeCollectibles(200);
        replenishing = false;
      }
      break;
    }
  }

  drawGrid();
}

async function renderLeaderboard() {
  const el = document.getElementById("leaderboard");
  const nostr = JSON.parse(localStorage.getItem("conpacNostr") || "null");
  const currentUser = localStorage.getItem("conpacUsername");

  el.innerHTML = "<h3>🔥 Leaderboard 🔥</h3>";
  el.innerHTML += "<p>Loading leaderboard… ⏳</p>";

  try {
    const resp = await fetch(
      "https://conpac-backend.jasonbohio.workers.dev/api/leaderboard"
    );

    if (!resp.ok) throw new Error("Leaderboard fetch failed");

    let data = await resp.json();

    // Clear loading message
    el.innerHTML = "<h3>🔥 Leaderboard 🔥</h3>";

    if (!data || data.length === 0) {
      el.innerHTML += "<p>No players yet. Play some games to appear here!</p>";
      return;
    }

    // Sort players by high_score descending
    data.sort((a, b) => b.high_score - a.high_score);

    // Add table header
    el.innerHTML += `
      <div class="leaderboard-header">
        <div class="leaderboard-number"></div>
        <div class="leaderboard-stats-header"></div>
      </div>
    `;

    data.forEach((u, i) => {
      const row = document.createElement("div");
      row.className = "leaderboard-row";

      if (u.username === currentUser) {
        row.classList.add("current-player");
      }

      let avatarUrl = u.picture || "/default-avatar.png";

      if (nostr && u.username === currentUser && nostr.picture) {
        avatarUrl = nostr.picture;
      }

      // 👇 ADD THESE HERE
      const zapCount = u.zap_count ?? 0;
      const satsReceived = u.sats_received ?? 0;
      const zapLabel = zapCount === 1 ? "zap" : "zaps";

      row.innerHTML = `
    <div class="leaderboard-rank">${i + 1}</div>

    <div class="leaderboard-player">
      <img
        class="leaderboard-avatar"
        src="${avatarUrl}"
        alt="${u.username}"
        loading="lazy"
        onerror="this.src='/default-avatar.png'"
      />
      <span class="leaderboard-name">${u.username}</span>
    </div>

    <div class="leaderboard-stats">
      High Score - ${u.high_score}
      </br>
      <button
        class="zap-btn"
        id="zap-btn"
        data-pubkey="${u.pubkey}"
        data-lud16="${u.lud16 || ""}"
        data-lud06="${u.lud06 || ""}"
      >
        ⚡ Zap
      </button>
      ${zapCount} ${zapLabel} ${satsReceived} sats
    </div>
  `;

      el.appendChild(row);
    });
  } catch (err) {
    console.error("Failed to render leaderboard:", err);
    el.innerHTML = "<p>Error loading leaderboard. Try again later.</p>";
  }
}

async function fetchInvoiceFromLNURL(lnurl, amountSats, memo = "") {
  const params = await fetchLnurlParams(lnurl);
  console.log("LNURL params:", params);

  if (!params || !params.callback)
    throw new Error("LNURL params missing callback URL");

  const msats = Number(amountSats) * 1000; // sats → msats

  if (isNaN(msats) || msats <= 0) throw new Error("Invalid amount");

  if (msats < params.minSendable || msats > params.maxSendable) {
    throw new Error(
      `Amount must be between ${params.minSendable / 1000} and ${
        params.maxSendable / 1000
      } sats`
    );
  }

  // Helper: build payload safely
  const buildPayload = (includeComment) => {
    const payload = {
      callback: params.callback,
      amount: msats,
    };
    if (
      includeComment &&
      params.commentAllowed > 0 &&
      memo?.trim().length > 0
    ) {
      payload.comment = memo.trim().slice(0, params.commentAllowed);
    }
    return payload;
  };

  // Step 1: try with comment
  let payload = buildPayload(true);
  console.log("Trying LNURL invoice with comment:", payload);

  try {
    return await fetchInvoiceFromBackend(payload);
  } catch (err) {
    // Step 2: retry without comment
    if (payload.comment) {
      console.warn(
        "LNURL invoice with comment failed, retrying without comment:",
        err.message
      );
      payload = buildPayload(false);
      console.log("Trying LNURL invoice without comment:", payload);
      return await fetchInvoiceFromBackend(payload);
    }
    throw err;
  }
}

// Backend call helper
async function fetchInvoiceFromBackend(payload) {
  const resp = await fetch("/api/lnurl-invoice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  let data;
  try {
    data = await resp.json();
  } catch {
    throw new Error("Invalid response from LNURL backend");
  }

  if (!resp.ok || !data.pr) {
    throw new Error(data.error || "LNURL invoice generation failed");
  }

  return data.pr;
}

// Backend call helper
async function fetchInvoiceFromBackend(payload) {
  const resp = await fetch(
    "https://conpac-backend.jasonbohio.workers.dev/api/lnurl-invoice",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  let data;
  try {
    data = await resp.json();
  } catch {
    throw new Error("Invalid response from LNURL backend");
  }

  if (!resp.ok || !data.pr) {
    throw new Error(data.error || "LNURL invoice generation failed");
  }

  return data.pr;
}

async function getLnurlPayUrl(lnurl, amount, memo) {
  const res = await fetchLnurlParams(lnurl);

  const msats = amount * 1000;
  const url = new URL(res.callback);

  url.searchParams.set("amount", msats);
  if (memo && res.commentAllowed > 0) {
    url.searchParams.set("comment", memo.slice(0, res.commentAllowed));
  }

  return url.toString();
}

async function fetchLnurlParams(lnurl) {
  let url;

  if (lnurl.includes("@")) {
    // lud16: name@domain
    const [name, domain] = lnurl.split("@");
    url = `https://${domain}/.well-known/lnurlp/${name}`;
  } else {
    // lud06: bech32 LNURL
    try {
      const decoded = bech32.decode(lnurl, 1023); // max length 1023
      const bytes = bech32.fromWords(decoded.words);

      // Safe conversion of bytes → string
      url = Array.from(bytes)
        .map((b) => String.fromCharCode(b))
        .join("");

      // Ensure URL starts with https://
      if (!/^https?:\/\//.test(url)) {
        url = "https://" + url;
      }
    } catch (err) {
      throw new Error("Invalid lud06 LNURL");
    }
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch LNURL params");

  const json = await res.json();
  if (json.status === "ERROR") {
    throw new Error(json.reason || "LNURL error");
  }

  return json;
}

function encodeLnurl(url) {
  const words = bech32.toWords(new TextEncoder().encode(url));
  return bech32.encode("lnurl", words, 1023); // standard LNURL prefix
}

async function showLnurlQR(lightningAddress) {
  const canvas = document.getElementById("lnurl-qr");

  if (!lightningAddress) {
    showError("This player cannot receive zaps ⚡");
    return;
  }

  // Show the modal
  showModal("lnurl-modal");

  try {
    // QR is just the lightning address itself
    await QRCode.toCanvas(canvas, lightningAddress, { width: 256 });
  } catch (err) {
    console.error("Failed to render QR code:", err);
    showError("⚡ Could not render QR code");
  }
}

function closeLnurlModal() {
  const canvas = document.getElementById("lnurl-qr");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  closeModal("lnurl-modal");
}

document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".zap-btn");
  if (!btn) return;

  const pubkey = btn.dataset.pubkey;
  const lud16 = btn.dataset.lud16;
  const lud06 = btn.dataset.lud06;

  if (!pubkey) return;

  const lnurl = lud16 || lud06;
  if (!lnurl) {
    showMessage("This player cannot receive zaps ⚡");
    return;
  }

  const amount = parseInt(prompt("Enter zap amount in sats:", "21"), 10);

  if (!amount || amount <= 0) {
    showError("Zap cancelled or invalid amount ⚡");
    return;
  }

  const hardcodedMemo =
    "You got zapped because your profile is on the leaderboard of Conways Game of Pacman!";

  btn.disabled = true;

  try {
    // Try WebLN first
    if (!window.webln) throw new Error("NO_WEBLN");

    await window.webln.enable();

    const invoice = await fetchInvoiceFromLNURL(lnurl, amount, hardcodedMemo);

    await window.webln.sendPayment(invoice);

    await recordZap(pubkey, amount);
    showMessage(`⚡ Zap of ${amount} sats sent!`);
  } catch (err) {
    console.warn("LNURL invoice failed, falling back to QR:", err);

    // Fallback: just show LNURL QR
    if (!lud16) {
      showError("Cannot show fallback QR: no LNURL available ⚡");
      btn.disabled = false;
      return;
    }

    const canvas = document.getElementById("lnurl-qr");
    showModal("lnurl-modal");

    try {
      await QRCode.toCanvas(canvas, lud16, { width: 256 });

      // Set LNURL in input for copying
      const lnurlInput = document.getElementById("lnurl-text");
      lnurlInput.value = lud16;

      // Add copy button functionality
      const copyBtn = document.getElementById("copy-lnurl-btn");
      copyBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(lud16);
          showMessage("LNURL copied to clipboard ⚡");
        } catch (copyErr) {
          console.error("Copy failed:", copyErr);
          showError("Failed to copy LNURL ⚡");
        }
      };

      showMessage(
        "⚡ WebLN not available. You can scan the QR or copy the LNURL with your Lightning wallet. Note: zaps will only be recorded when using WebLN."
      );
    } catch (qrErr) {
      console.error("Failed to generate LNURL QR:", qrErr);
      showError("Unable to generate QR zap ⚡");
    }
  } finally {
    btn.disabled = false;
  }
});

async function recordZap(pubkey, amount) {
  await fetch("https://conpac-backend.jasonbohio.workers.dev/api/record-zap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pubkey, amount }),
  });
}

document.addEventListener("keydown", (e) => {
  if (!canPlayGame || !playerAlive) return;

  switch (e.key) {
    case "ArrowUp":
      if (!running) startLife();
      movePlayer(0, -1, "up");
      break;
    case "ArrowDown":
      if (!running) startLife();
      movePlayer(0, 1, "down");
      break;
    case "ArrowLeft":
      if (!running) startLife();
      movePlayer(-1, 0, "left");
      break;
    case "ArrowRight":
      if (!running) startLife();
      movePlayer(1, 0, "right");
      break;
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  loadStats();
  document
    .getElementById("help-btn")
    .addEventListener("click", () => showModal("help-modal"));
  document.getElementById("stats-btn").addEventListener("click", async () => {
    showModal("stats-modal");
    await loadStats();
    await renderLeaderboard();
  });
  document
    .getElementById("username-btn")
    .addEventListener("click", () => showModal("username-modal"));
  startNewGame();
});

document.getElementById("tip-btn").addEventListener("click", async () => {
  const tipBtn = document.getElementById("tip-btn");
  tipBtn.disabled = true;

  try {
    const invoiceTip = await generateInvoiceForBlink(10000);
    await payInvoice(invoiceTip);
    showMessage("Thank you for the 10,000 sats tip 💛");
  } catch (err) {
    console.error("Tip payment failed:", err);
    showError("Tip failed. Please try again.");
    tipBtn.disabled = false;
  }
});

canvas.addEventListener("click", (e) => {
  if (running) return;

  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) / CELL_SIZE);
  const y = Math.floor((e.clientY - rect.top) / CELL_SIZE);

  grid[y][x] = grid[y][x] ? 0 : 1;
  drawGrid();
});

const startBtn = document.getElementById("start-btn");
const pauseBtn = document.getElementById("pause-btn");
const resetBtn = document.getElementById("reset-btn");

startBtn.addEventListener("click", () => {
  if (!canPlayGame || running) return;
  startLife();
});

pauseBtn.addEventListener("click", () => {
  if (!running) return;
  pauseLife();
});

resetBtn.addEventListener("click", () => {
  initGrid();
  showMessage("Grid reset");
});

function countNeighbors(x, y) {
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
        count += grid[ny][nx];
      }
    }
  }
  return count;
}

function startLife() {
  if (!canPlayGame || running) return;

  running = true;
  lifeInterval = setInterval(stepLife, lifeSpeed);
  startBtn.disabled = true;
  pauseBtn.disabled = false;
}

function pauseLife() {
  running = false;
  clearInterval(lifeInterval);
  startBtn.disabled = false;
  pauseBtn.disabled = true;
}

async function loginWithNostr() {
  if (!window.nostr) {
    alert("No Nostr extension found");
    return;
  }

  const pubkey = await window.nostr.getPublicKey();
  await loadNostrProfile(pubkey);
}

document.getElementById("nostr-login-btn").onclick = loginWithNostr;

function npubToHex(npub) {
  return NostrTools.nip19.decode(npub).data;
}

document.getElementById("npub-submit").onclick = async () => {
  const npub = document.getElementById("npub-input").value.trim();
  const pubkey = npubToHex(npub);
  await loadNostrProfile(pubkey, npub);
};

async function loadNostrProfile(pubkey, npub = null) {
  const relays = [
    "wss://relay.damus.io",
    "wss://relay.snort.social",
    "wss://nostr.wine",
  ];

  const profile = await fetchProfileFromRelays(pubkey, relays);

  // Use getNostrUsername to compute username
  const username = getNostrUsername(profile, pubkey, npub);

  const storedProfile = {
    pubkey,
    npub,
    username,
    picture: profile.picture || null,
    lud16: profile.lud16 || null,
    lud06: profile.lud06 || null,
  };

  localStorage.setItem("conpacNostr", JSON.stringify(storedProfile));

  applyNostrProfile(storedProfile);
}

function fetchProfileFromRelays(pubkey, relays) {
  return new Promise((resolve) => {
    let resolved = false;

    relays.forEach((url) => {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        ws.send(
          JSON.stringify([
            "REQ",
            "profile",
            { kinds: [0], authors: [pubkey], limit: 1 },
          ])
        );
      };

      ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        if (data[0] === "EVENT" && !resolved) {
          resolved = true;
          ws.close();
          resolve(JSON.parse(data[2].content));
        }
      };

      setTimeout(() => ws.close(), 2000);
    });

    setTimeout(() => resolve({}), 2500);
  });
}

function applyNostrProfile(profile) {
  const profileBox = document.getElementById("nostr-profile");
  const avatar = document.getElementById("nostr-avatar");
  const nameEl = document.getElementById("nostr-username");

  if (profile.picture) {
    avatar.src = profile.picture;
    avatar.style.display = "block";
  }

  nameEl.textContent = profile.username;
  profileBox.style.display = "flex";

  localStorage.setItem("conpacUsername", profile.username);

  showMessage(`Welcome, ${profile.username} ⚡`);

  closeModal("username-modal");
}

function getNostrUsername(profile, pubkey, npub = null) {
  if (profile.display_name && profile.display_name.trim()) {
    return profile.display_name.trim();
  }

  if (profile.name && profile.name.trim()) {
    return profile.name.trim();
  }

  if (profile.nip05 && profile.nip05.includes("@")) {
    return profile.nip05.split("@")[0];
  }

  // Fallback: short npub
  const n = npub || NostrTools.nip19.npubEncode(pubkey);
  return n.slice(0, 8) + "…" + n.slice(-4);
}

document.addEventListener("DOMContentLoaded", () => {
  const nostr = JSON.parse(localStorage.getItem("conpacNostr") || "null");

  if (nostr) {
    applyNostrProfile({
      username: nostr.username,
      picture: nostr.picture,
    });
  }
});

window.resetGame = startNewGame;
window.closeModal = closeModal;
