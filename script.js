const CELL_SIZE = 14;
const GRID_SIZE = 40;

let collectibles = [];
const NUM_COLLECTIBLES = 50;

let grid = [];
let running = false;
let generation = 0;
let lifeInterval = null;
let activePointerInterval = null;

let playerX = Math.floor(GRID_SIZE / 2);
let playerY = Math.floor(GRID_SIZE / 2);
let playerAlive = true;
let playerDir = "right"; // "up" | "down" | "left" | "right"
let mouthOpen = true;

const gliderCoords = [
  [0, 1],
  [1, 2],
  [2, 0],
  [2, 1],
  [2, 2],
];

let score = 0;

let ghosts = [];
const NUM_GHOSTS = 5;

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

    if (!grid[y][x] && !(x === playerX && y === playerY)) {
      ghosts.push({
        x,
        y,
        color: colors[placed % colors.length], // cycle through colors
      });
      placed++;
    }
  }
}

function placeGlider() {
  // Top-left safe area
  let gx = 0;
  let gy = 0;

  // Check if space is empty
  const canPlace = gliderCoords.every(([dx, dy]) => {
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

  for (const [dx, dy] of gliderCoords) {
    grid[gy + dy][gx + dx] = 1;
  }

  showMessage("⚡ A glider has entered the arena! Watch it soar!", 3000);
  return true;
}

function placeCollectibles(num = NUM_COLLECTIBLES) {
  let placed = 0;

  while (placed < num) {
    const x = Math.floor(Math.random() * GRID_SIZE);
    const y = Math.floor(Math.random() * GRID_SIZE);

    // Ensure empty and not player, and not overlapping existing collectibles
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

  // ⚠️ New: check if player is now on a live cell
  if (playerAlive && grid[playerY][playerX]) {
    playerAlive = false;
    endGame("Life grew onto you!");
  }

  // Place glider every 100 generations
  if (generation % 100 === 0) {
    placeGlider();
  }

  drawGrid();

  if (grid.flat().every((c) => c === 0)) {
    endGame("All life died out");
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

  // Don't steal focus if typing in a modal input
  if (
    (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA") &&
    openModal
  ) {
    return; // let modal handle it
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

  /*   let paymentRequired = !canPlayFreeGameToday();

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
*/
  canPlayGame = true;
  sessionStorage.setItem("conpacCanPlay", "true");

  initGrid();

  closeModal("game-over-modal");
}
/*
async function generateInvoiceForBlink(amountSats) {
  try {
    const resp = await fetch("/api/create-invoice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ amount: amountSats, memo: "Conpac Game Payment" }),
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

async function payWithQR(amountSats, memo = "Conpac Game Payment") {
  const tipBtn = document.getElementById("tip-btn");
  tipBtn.disabled = true;

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

    const qrSuccess = await payWithQR(100, "Conpac Game Payment");
    tipBtn.disabled = false;
    return qrSuccess;
  } catch (err) {
    console.error("Payment failed:", err);
    showError("Payment failed. Please try again.");
    tipBtn.disabled = false;
    return false;
  }
}
*/
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
    message.textContent = reason || "All life died out";
    answerDiv.innerHTML = "";

  showModal("game-over-modal");
}

async function loadStats() {
  let stats = {
    played: 0,
    current_streak: 0,
    max_streak: 0,
  };

  const userId = localStorage.getItem("conpacUserId");
  if (userId) {
    try {
      const resp = await fetch(
        `https://conpac-backend.jasonbohio.workers.dev/api/user/${userId}`
      );
      if (resp.ok) {
        stats = await resp.json();
      }
    } catch (err) {
      console.warn("Could not fetch stats, falling back to localStorage:", err);
      const localStats = localStorage.getItem("conpacStats");
      if (localStats) stats = JSON.parse(localStats);
    }
  }

  document.getElementById("played").textContent = stats.played;
  document.getElementById("current-streak").textContent = stats.current_streak;
  document.getElementById("max-streak").textContent = stats.max_streak;
}

async function updateStats() {
  const userId = localStorage.getItem("conpacUserId");
  if (!userId) return;

  try {
    await fetch(
      `https://conpac-backend.jasonbohio.workers.dev/api/update-stats`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...body }),
      }
    );
  } catch (err) {
    console.error("Failed to update stats on backend:", err);
  }

  // fallback to localStorage
  const statsKey = "conpacStats";
  const stats = JSON.parse(localStorage.getItem(statsKey)) || {
    played: 0,
    current_streak: 0,
    max_streak: 0,
  };

  stats.played++;

  stats.current_streak = 0;


  localStorage.setItem(statsKey, JSON.stringify(stats));

  loadStats();
}

function pauseLife() {
  running = false;
  clearInterval(lifeInterval);
}

function endGame(reason = false) {
  pauseLife();
  gameOver = true;
  updateStats();
  showGameOver(`${reason} Score: ${getTotalScore()}`);
}

document.getElementById("username-submit").onclick = async () => {
  const username = document.getElementById("username-input").value.trim();
  if (!username) return;

  try {
    const resp = await fetch(
      `https://conpac-backend.jasonbohio.workers.dev/api/auth`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      }
    );

    const data = await resp.json();
    localStorage.setItem("conpacUserId", data.userId);
    localStorage.setItem("conpacUsername", data.username);

    showMessage(`Welcome, ${data.username}!`);
  } catch (err) {
    console.error("Failed to save username:", err);
    showError("Could not save username. Try again.");
  }

  closeModal("username-modal");
};

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
    endGame("You were eaten by life!");
  }

  // Check collectibles
  for (const c of collectibles) {
    if (!c.collected && c.x === playerX && c.y === playerY) {
      c.collected = true;
      score += 5;

      const collectedCount = collectibles.filter((c) => c.collected).length;
      if (collectedCount % 40 === 0) {
        placeCollectibles(40);
      }
    }
  }

  drawGrid();
}

async function renderLeaderboard() {
  const el = document.getElementById("leaderboard");
  el.innerHTML = "<h3>Leaderboard</h3>";
  el.innerHTML += `
  <div class="leaderboard-header">
    <div class="leaderboard-number">#</div>
    <div>Player</div>
    <div class="leaderboard-stats-header">
      🔥 Streak
    </div>
  </div>
`;

  try {
    const resp = await fetch(
      `https://conpac-backend.jasonbohio.workers.dev/api/leaderboard`
    );

    if (!resp.ok) throw new Error("Leaderboard fetch failed");

    let data = await resp.json();

    if (!data || data.length === 0) {
      el.innerHTML += "<p>No players yet. Play some games to appear here!</p>";
      return;
    }

    data.sort((a, b) => {
      if (b.max_streak !== a.max_streak) return b.max_streak - a.max_streak;
      return b.win_rate - a.win_rate;
    });

    const currentUser = localStorage.getItem("conpacUsername");

    // Render each player
    data.forEach((u, i) => {
      const row = document.createElement("div");
      row.className = "leaderboard-row";

      // Highlight current user
      if (u.username === currentUser) {
        row.classList.add("current-player");
      }

      row.innerHTML = `
  <div class="leaderboard-rank">${i + 1}</div>
  <div class="leaderboard-name">${u.username}</div>
  <div class="leaderboard-stats">
    ${u.max_streak} in a row
  </div>
`;

      el.appendChild(row);
    });
  } catch (err) {
    console.error("Failed to render leaderboard:", err);
    el.innerHTML += "<p>Error loading leaderboard. Try again later.</p>";
  }
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
    await loadStats(); // update stats
    await renderLeaderboard(); // populate leaderboard
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
  lifeInterval = setInterval(stepLife, 200);
  startBtn.disabled = true;
  pauseBtn.disabled = false;
}

function pauseLife() {
  running = false;
  clearInterval(lifeInterval);
  startBtn.disabled = false;
  pauseBtn.disabled = true;
}

window.resetGame = startNewGame;
window.closeModal = closeModal;
