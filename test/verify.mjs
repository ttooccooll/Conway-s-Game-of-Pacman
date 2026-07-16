import puppeteer from "puppeteer-core";
import handler from "serve-handler";
import http from "http";
import path from "path";
import { execSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SHOTS = path.join(__dirname, "screenshots");
mkdirSync(SHOTS, { recursive: true });

function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const candidates = [];
  for (const bin of [
    "google-chrome-stable",
    "google-chrome",
    "chromium-browser",
    "chromium",
  ]) {
    try {
      const p = execSync(`which ${bin}`, {
        stdio: ["ignore", "pipe", "ignore"],
      })
        .toString()
        .trim();
      if (p) candidates.push(p);
    } catch (e) {
      /* not installed */
    }
  }
  const puppeteerCache = path.join(
    process.env.HOME || "",
    ".cache",
    "puppeteer",
    "chrome",
  );
  if (existsSync(puppeteerCache)) {
    for (const dir of readdirSync(puppeteerCache)) {
      candidates.push(
        path.join(
          puppeteerCache,
          dir,
          "chrome-mac-x64",
          "Google Chrome for Testing.app",
          "Contents",
          "MacOS",
          "Google Chrome for Testing",
        ),
        path.join(puppeteerCache, dir, "chrome-linux64", "chrome"),
      );
    }
  }
  candidates.push(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  );
  const found = candidates.find((c) => existsSync(c));
  if (!found) {
    throw new Error("No Chrome/Chromium found — set CHROME_PATH");
  }
  return found;
}

// Serve the game with the same security headers production sends, so the
// suite validates the real CSP in vercel.json against the real page
const securityHeaders =
  JSON.parse(readFileSync(path.join(ROOT, "vercel.json"), "utf8")).headers?.[0]
    ?.headers ?? [];

const server = http.createServer((req, res) => {
  for (const h of securityHeaders) res.setHeader(h.key, h.value);
  return handler(req, res, { public: ROOT });
});
await new Promise((r) => server.listen(8907, r));

const { startMockWallet } = await import("./nwc-mock.mjs");
const mockWallet = startMockWallet(server, 8907);

const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: true,
  args: process.env.CI ? ["--no-sandbox", "--disable-setuid-sandbox"] : [],
});

try {
  await browser
    .defaultBrowserContext()
    .overridePermissions("http://localhost:8907", [
      "clipboard-read",
      "clipboard-write",
      "clipboard-sanitized-write",
    ]);
} catch (e) {
  console.log("clipboard permissions unavailable:", e.message);
}

const results = [];
const check = (name, ok, detail = "") =>
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);

async function newGamePage(viewport) {
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);
  await page.setViewport(viewport);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("http://localhost:8907/", { waitUntil: "networkidle2" });
  return { page, errors };
}

// ---------- Desktop run ----------
const { page, errors } = await newGamePage({ width: 1200, height: 900 });
await new Promise((r) => setTimeout(r, 1000));

// free game should unlock play
const canPlay = await page.evaluate(() => window.sessionStorage.getItem("conpacCanPlay") || String(typeof canPlayGame !== "undefined" && canPlayGame));
check("page loads, free game unlocked", canPlay.includes("true"), canPlay);

// desktop layout: mute button visible, inside viewport, overlapping nothing
const layout = await page.evaluate(() => {
  const mb = document.getElementById("mute-btn").getBoundingClientRect();
  const inViewport =
    mb.width > 0 && mb.left >= 0 && mb.top >= 0 && mb.right <= innerWidth && mb.bottom <= innerHeight;
  const others = ["username-btn", "help-btn", "stats-btn", "life-canvas", "controls", "livestats"]
    .map((id) => document.getElementById(id))
    .concat([document.querySelector("header h1")])
    .filter(Boolean);
  const overlaps = others.filter((el) => {
    const b = el.getBoundingClientRect();
    return !(mb.right <= b.left || mb.left >= b.right || mb.bottom <= b.top || mb.top >= b.bottom);
  }).map((el) => el.id || el.tagName);
  return { inViewport, overlaps, rect: { l: mb.left, r: mb.right, t: mb.top, b: mb.bottom } };
});
check(
  "desktop: mute button visible, no overlaps",
  layout.inViewport && layout.overlaps.length === 0,
  JSON.stringify(layout),
);

// simulate gameplay: arrow keys start the game and move the player
const before = await page.evaluate(() => ({ x: playerX, y: playerY, gen: generation }));
await page.keyboard.press("ArrowRight");
await new Promise((r) => setTimeout(r, 700));
await page.keyboard.press("ArrowDown");
await new Promise((r) => setTimeout(r, 1500));
const after = await page.evaluate(() => ({ x: playerX, y: playerY, gen: generation, running }));
check(
  "arrow keys start game and move player",
  after.gen > before.gen && (after.x !== before.x || after.y !== before.y),
  JSON.stringify({ before, after }),
);

// toroidal wrap: player walks off the left edge (fresh state — the arrow
// phase can now legitimately end in death via ghost contact)
const wrapTest = await page.evaluate(() => {
  canPlayGame = true;
  playerAlive = true;
  gameOver = false;
  playerX = 0;
  playerY = 20;
  grid[20][GRID_SIZE - 1] = 0; // make sure landing cell is open
  for (const g of ghosts) {
    if (g.x === GRID_SIZE - 1 && g.y === 20) {
      g.x = 5;
      g.y = 5;
    }
  }
  movePlayer(-1, 0, "left");
  return { x: playerX, alive: playerAlive };
});
check("player wraps around left edge", wrapTest.x === 39 && wrapTest.alive, JSON.stringify(wrapTest));

// toroidal life: neighbor counting wraps
const lifeWrap = await page.evaluate(() => {
  grid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
  grid[0][10] = 1;
  grid[GRID_SIZE - 1][10] = 1;
  grid[0][11] = 1;
  return countNeighbors(0, 0 + 0) + "," + countNeighbors(10, 0); // cell (10,0): neighbors are (10,39),(11,0) = 2
});
check("neighbor counting wraps across edges", lifeWrap.endsWith(",2"), lifeWrap);

// ghost personalities present
const ghostInfo = await page.evaluate(() =>
  ghosts.map((g) => g.name + ":" + g.color).join(" "),
);
check(
  "six distinct ghost personalities",
  ["chaser", "ambusher", "flanker", "stalker", "patroller", "wanderer"].every((n) =>
    ghostInfo.includes(n),
  ),
  ghostInfo,
);

// difficulty curve
const speeds = await page.evaluate(() => {
  const s = [];
  const save = { score, generation };
  score = 0; generation = 0; s.push(currentLifeSpeed());
  score = 500; s.push(currentLifeSpeed());
  score = 1000; s.push(currentLifeSpeed());
  score = 5000; s.push(currentLifeSpeed());
  score = save.score; generation = save.generation;
  return s;
});
check(
  "speed curve 300 → 225 → 150 (floor)",
  speeds[0] === 300 && speeds[1] === 225 && speeds[2] === 150 && speeds[3] === 150,
  speeds.join(","),
);

// sfx module + mute toggle
const sfxTest = await page.evaluate(() => {
  const before = sfx.isMuted();
  document.getElementById("mute-btn").click();
  const mid = sfx.isMuted() + ":" + localStorage.getItem("conpacMuted") + ":" + document.getElementById("mute-btn").textContent;
  document.getElementById("mute-btn").click();
  const after = sfx.isMuted() + ":" + document.getElementById("mute-btn").textContent;
  sfx.chomp(); sfx.death(); sfx.payment(); sfx.ship(); sfx.speedup(); // must not throw
  return { before, mid, after };
});
check(
  "mute toggles + persists + all sfx callable",
  String(sfxTest.before) === "false" && sfxTest.mid.startsWith("true:true:🔇") && sfxTest.after.startsWith("false:🔊"),
  JSON.stringify(sfxTest),
);

// kill the player via a ghost -> continue button should appear
await page.evaluate(() => {
  playerAlive = false;
  endGame("Caught by a ghost! 👻");
});
await new Promise((r) => setTimeout(r, 700));
const goState = await page.evaluate(() => ({
  modalShown: document.getElementById("game-over-modal").classList.contains("show"),
  hasContinue: !!document.getElementById("continue-btn"),
  btnText: document.getElementById("continue-btn")?.textContent,
  played: JSON.parse(localStorage.getItem("conpacStats")).played,
}));
check(
  "death shows game-over modal with 21-sat continue",
  goState.modalShown && goState.hasContinue && goState.btnText.includes("21 sats"),
  JSON.stringify(goState),
);
await page.screenshot({ path: SHOTS + "/shot-gameover.png" });

// share path 1: no extension, no native sheet -> clipboard fallback
// (headless mac Chrome exposes navigator.share but hangs on it; the native
// sheet path gets its own stubbed test below)
const shareA = await page.evaluate(async () => {
  navigator.share = undefined;
  const btn = document.getElementById("share-nostr-btn");
  if (!btn) return { present: false };
  btn.click();
  await new Promise((r) => setTimeout(r, 400));
  let clip = "__unreadable__";
  try {
    clip = await navigator.clipboard.readText();
  } catch (e) {
    /* headless clipboard-read can be unavailable */
  }
  return {
    present: true,
    text: btn.textContent,
    enabled: !btn.disabled,
    clipMatches: clip === "__unreadable__" ? "n/a" : clip === buildShareText(),
  };
});
check(
  "share (no extension): copies brag text, button re-enabled",
  shareA.present && shareA.text === "Copied 📋" && shareA.enabled && shareA.clipMatches !== false,
  JSON.stringify(shareA),
);

// share path 2: stubbed NIP-07 extension -> kind-1 note signed & "published"
const shareB = await page.evaluate(async () => {
  showGameOver("test death", { recoverable: true }); // fresh buttons
  let signedCapture = null;
  window.nostr = {
    signEvent: async (e) => {
      signedCapture = e;
      return { ...e, id: "testid", pubkey: "pk", sig: "sig" };
    },
  };
  window.publishToRelays = async () => 2; // don't hit real relays with fake sigs
  const btn = document.getElementById("share-nostr-btn");
  btn.click();
  await new Promise((r) => setTimeout(r, 400));
  delete window.nostr;
  return {
    text: btn.textContent,
    sharedClass: btn.classList.contains("is-shared"),
    disabled: btn.disabled,
    kind: signedCapture?.kind,
    hasUrl: signedCapture?.content?.includes("conwaysgameofpacman.xyz"),
    hasScore: signedCapture?.content?.includes(String(getTotalScore())),
    tags: JSON.stringify(signedCapture?.tags),
  };
});
check(
  "share (stubbed extension): signs kind-1 note, marks shared, stays disabled",
  shareB.text === "Shared ✓" && shareB.sharedClass && shareB.disabled && shareB.kind === 1 && shareB.hasUrl && shareB.hasScore,
  JSON.stringify(shareB),
);
await page.screenshot({ path: SHOTS + "/shot-share.png" });

// share path 3: no extension but navigator.share available (mobile-style)
const nativeShare = await page.evaluate(async () => {
  showGameOver("share sheet test", { recoverable: true });
  delete window.nostr;
  navigator.share = async (data) => {
    window.__sharedData = data;
  };
  const btn = document.getElementById("share-nostr-btn");
  btn.click();
  await new Promise((r) => setTimeout(r, 300));
  delete navigator.share;
  const d = window.__sharedData;
  return {
    textOk: !!d?.text && d.text.includes("conwaysgameofpacman.xyz"),
    btnText: btn.textContent,
    disabled: btn.disabled,
  };
});
check(
  "share (native sheet): navigator.share used when available",
  nativeShare.textOk && nativeShare.btnText === "Shared ✓" && nativeShare.disabled,
  JSON.stringify(nativeShare),
);

// stub payment success, click continue, expect revive without double-counting stats
const reviveState = await page.evaluate(async () => {
  const scoreBefore = getTotalScore();
  window.generateInvoice = async () => "lnbc-stub";
  window.payInvoice = async () => true;
  window.WebLN = window.WebLN || {};
  document.getElementById("continue-btn").click();
  await new Promise((r) => setTimeout(r, 500));
  return {
    alive: playerAlive,
    canPlay: canPlayGame,
    modalGone: !document.getElementById("game-over-modal").classList.contains("show"),
    scoreKept: getTotalScore() === scoreBefore,
    session: sessionStorage.getItem("conpacCanPlay"),
  };
});
check(
  "continue revives: alive, modal closed, score kept",
  reviveState.alive && reviveState.canPlay && reviveState.modalGone && reviveState.scoreKept && reviveState.session === "true",
  JSON.stringify(reviveState),
);

// die again — played must NOT increment a second time
const secondDeath = await page.evaluate(async () => {
  const playedBefore = JSON.parse(localStorage.getItem("conpacStats")).played;
  playerAlive = false;
  await endGame("Caught again!");
  const playedAfter = JSON.parse(localStorage.getItem("conpacStats")).played;
  return { playedBefore, playedAfter };
});
check(
  "second death in same run doesn't double-count games played",
  secondDeath.playedAfter === secondDeath.playedBefore,
  JSON.stringify(secondDeath),
);

// continue price escalates within a run: 21 used above, so now 42
const price2 = await page.evaluate(
  () => document.getElementById("continue-btn")?.textContent,
);
check(
  "continue price escalates after a continue (21 → 42)",
  price2 === "⚡ Continue for 42 sats",
  String(price2),
);

// signed score submission: extension login attaches a NIP-98 auth event
const signedSubmit = await page.evaluate(async () => {
  localStorage.setItem(
    "conpacNostr",
    JSON.stringify({ pubkey: "abc123", via: "extension" }),
  );
  let submitted = null;
  window.nostr = {
    signEvent: async (e) => ({ ...e, id: "id1", pubkey: "abc123", sig: "s" }),
  };
  const origFetch = window.fetch;
  window.fetch = async (url, opts) => {
    if (String(url).includes("/api/submit-score")) {
      submitted = JSON.parse(opts.body);
      return { ok: true, text: async () => "" };
    }
    return origFetch(url, opts);
  };
  await endGame("sign test");
  window.fetch = origFetch;
  delete window.nostr;
  localStorage.removeItem("conpacNostr");
  return {
    authAttached: !!submitted?.auth,
    kind: submitted?.auth?.kind,
    payloadHashed: submitted?.auth?.tags?.some(
      (t) => t[0] === "payload" && t[1]?.length === 64,
    ),
    urlTag: submitted?.auth?.tags?.some(
      (t) => t[0] === "u" && t[1]?.includes("/api/submit-score"),
    ),
    scoreInBody: typeof submitted?.high_score === "number",
  };
});
check(
  "score submission carries NIP-98 auth when logged in via extension",
  signedSubmit.authAttached && signedSubmit.kind === 27235 && signedSubmit.payloadHashed && signedSubmit.urlTag && signedSubmit.scoreInBody,
  JSON.stringify(signedSubmit),
);

// BUG FIXES ------------------------------------------------------------

// fix: walking into a ghost must be fatal (was pass-through)
await page.evaluate(() => {
  initGrid();
  canPlayGame = true;
  playerAlive = true;
  gameOver = false;
  const g = ghosts[0];
  const tx = wrap(playerX + 1);
  grid[playerY][tx] = 0; // make sure the tile is walkable
  g.x = tx;
  g.y = playerY;
  movePlayer(1, 0, "right");
});
await new Promise((r) => setTimeout(r, 400));
const ghostWalk = await page.evaluate(() => ({
  alive: playerAlive,
  modal: document.getElementById("game-over-modal").classList.contains("show"),
}));
check(
  "walking into a ghost is fatal (no more pass-through)",
  !ghostWalk.alive && ghostWalk.modal,
  JSON.stringify(ghostWalk),
);

// fix: dots restock when <= 10 remain, even if walls swallowed them
const dots = await page.evaluate(() => {
  initGrid();
  canPlayGame = true;
  playerAlive = true;
  gameOver = false;
  const un = collectibles.filter((c) => !c.collected);
  un.slice(8).forEach((c) => (c.collected = true)); // leave exactly 8
  const before = collectibles.filter((c) => !c.collected).length;
  stepLife();
  const after = collectibles.filter((c) => !c.collected).length;
  return { before, after };
});
check(
  "dot supply restocks when 10 or fewer remain",
  dots.before === 8 && dots.after > 100,
  JSON.stringify(dots),
);

// fix: cell editing blocked during an active run, allowed between games
const sandbox = await page.evaluate(() => {
  canPlayGame = true;
  running = false;
  grid[5][5] = 0;
  const rect = canvas.getBoundingClientRect();
  const coords = {
    clientX: rect.left + (5.5 / GRID_SIZE) * rect.width,
    clientY: rect.top + (5.5 / GRID_SIZE) * rect.height,
  };
  canvas.dispatchEvent(new MouseEvent("click", coords));
  const blockedDuringRun = grid[5][5] === 0;
  canPlayGame = false;
  canvas.dispatchEvent(new MouseEvent("click", coords));
  const editableBetweenGames = grid[5][5] === 1;
  return { blockedDuringRun, editableBetweenGames };
});
check(
  "pause-edit cheat blocked; sandbox still works between games",
  sandbox.blockedDuringRun && sandbox.editableBetweenGames,
  JSON.stringify(sandbox),
);

// fix: zap prompt() replaced by preset modal
const zapShot = await page.evaluate(() => {
  askZapAmount(); // leave open for the screenshot
  return document.getElementById("zap-modal").classList.contains("show");
});
await page.screenshot({ path: SHOTS + "/shot-zap.png" });
const zap = await page.evaluate(async () => {
  document.getElementById("zap-cancel").click(); // close the screenshot one
  const p1 = askZapAmount();
  document.querySelector('#zap-modal .zap-preset[data-sats="210"]').click();
  const preset = await p1;
  const p2 = askZapAmount();
  document.getElementById("zap-custom-input").value = "1234";
  document.getElementById("zap-custom-send").click();
  const custom = await p2;
  const p3 = askZapAmount();
  document.getElementById("zap-cancel").click();
  const cancelled = await p3;
  const closed = !document.getElementById("zap-modal").classList.contains("show");
  return { preset, custom, cancelled, closed };
});
check(
  "zap modal: presets, custom amount, cancel all work",
  zapShot && zap.preset === 210 && zap.custom === 1234 && zap.cancelled === null && zap.closed,
  JSON.stringify({ zapShot, ...zap }),
);

// logout clears the stored Nostr identity and hides itself again
const logout = await page.evaluate(() => {
  localStorage.setItem(
    "conpacNostr",
    JSON.stringify({ pubkey: "x", username: "tester" }),
  );
  localStorage.setItem("conpacUsername", "tester");
  updateLogoutVisibility();
  const btn = document.getElementById("nostr-logout-btn");
  const visibleWhenLoggedIn = btn.style.display !== "none";
  logoutNostr();
  return {
    visibleWhenLoggedIn,
    cleared:
      !localStorage.getItem("conpacNostr") &&
      !localStorage.getItem("conpacUsername"),
    hiddenAfter: btn.style.display === "none",
  };
});
check(
  "logout clears identity and hides the button",
  logout.visibleWhenLoggedIn && logout.cleared && logout.hiddenAfter,
  JSON.stringify(logout),
);

// NWC wallet connect: modal validates input, then connects to the real
// in-process mock wallet over the relay protocol (full crypto roundtrip)
const nwcConnect = await page.evaluate(async (connString) => {
  openNwcModal();
  const visible = document.getElementById("nwc-modal").classList.contains("show");
  const input = document.getElementById("nwc-input");
  input.value = "not-a-wallet-string";
  await saveNwcConnection();
  const rejected =
    !localStorage.getItem("conpacNwcUrl") &&
    document.getElementById("nwc-status").textContent.length > 0;
  input.value = connString;
  await saveNwcConnection();
  return {
    visible,
    rejected,
    accepted: !!localStorage.getItem("conpacNwcUrl"),
    modalClosed: !document.getElementById("nwc-modal").classList.contains("show"),
    inputCleared: input.value === "",
    statusShown:
      document.getElementById("wallet-status").textContent.includes("connected"),
  };
}, mockWallet.connectionString);
check(
  "NWC modal rejects garbage and connects to a real wallet",
  nwcConnect.visible && nwcConnect.rejected && nwcConnect.accepted && nwcConnect.modalClosed && nwcConnect.inputCleared && nwcConnect.statusShown,
  JSON.stringify(nwcConnect),
);

// game unlock pays straight through the connected wallet — no QR modal
const nwcPay = await page.evaluate(async () => {
  window.generateInvoice = async () => "lnbc210n1mockinvoice";
  const paid = await handlePayment();
  return {
    paid,
    qrShown: document
      .getElementById("payment-qr-modal")
      .classList.contains("show"),
  };
});
check(
  "game unlock pays via NWC without showing the QR modal",
  nwcPay.paid === true && !nwcPay.qrShown,
  JSON.stringify(nwcPay),
);
check(
  "mock wallet really received the pay_invoice request",
  mockWallet.paidInvoices.includes("lnbc210n1mockinvoice"),
  mockWallet.paidInvoices.join(","),
);

// disconnect restores stock behavior for everything that follows
const nwcDisconnect = await page.evaluate(() => {
  openNwcModal();
  const disconnectVisible =
    document.getElementById("nwc-disconnect").style.display !== "none";
  disconnectNwc();
  return {
    disconnectVisible,
    cleared: !localStorage.getItem("conpacNwcUrl"),
    statusCleared:
      document.getElementById("wallet-status").textContent === "",
  };
});
check(
  "NWC disconnect clears the connection and status",
  nwcDisconnect.disconnectVisible && nwcDisconnect.cleared && nwcDisconnect.statusCleared,
  JSON.stringify(nwcDisconnect),
);

// XSS: malicious Nostr usernames/pictures must render inert
const xss = await page.evaluate(async () => {
  const evil = '<img src=x onerror="window.__pwned=true">';
  const origFetch = window.fetch;
  window.fetch = async (url, opts) => {
    if (String(url).includes("/api/leaderboard")) {
      return {
        ok: true,
        json: async () => [
          {
            username: evil,
            high_score: 999,
            pubkey: "p1",
            picture: "javascript:alert(1)",
            lud16: '"><script>window.__pwned=true</script>',
            zap_count: 0,
            sats_received: 0,
          },
        ],
      };
    }
    return origFetch(url, opts);
  };
  await renderLeaderboard();
  window.fetch = origFetch;
  await new Promise((r) => setTimeout(r, 400));
  const nameEl = document.querySelector(".leaderboard-name");
  const avatar = document.querySelector(".leaderboard-avatar");
  return {
    pwned: window.__pwned === true,
    nameIsLiteralText: nameEl?.textContent === evil,
    avatarSrcSafe: !!avatar && !avatar.src.startsWith("javascript:"),
  };
});
check(
  "leaderboard renders malicious profile data inert (XSS fixed)",
  !xss.pwned && xss.nameIsLiteralText && xss.avatarSrcSafe,
  JSON.stringify(xss),
);

// life engine: evolveGrid applies Conway rules correctly (blinker flips)
const engine = await page.evaluate(() => {
  grid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
  grid[10][10] = 1;
  grid[10][11] = 1;
  grid[10][12] = 1; // horizontal blinker
  const p = evolveGrid();
  drawGrid(); // no preview rendering — plain board must draw cleanly
  return {
    flipsVertical: p[9][11] === 1 && p[10][11] === 1 && p[11][11] === 1,
    endsGone: p[10][10] === 0 && p[10][12] === 0,
    noPreviewState: typeof nextGridPreview === "undefined",
  };
});
check(
  "life engine evolves correctly; no preview state remains",
  engine.flipsVertical && engine.endsGone && engine.noPreviewState,
  JSON.stringify(engine),
);

// ghosts respect walls & wrap when moving; run 30 generation ticks cleanly
const ghostSim = await page.evaluate(() => {
  try {
    playerAlive = true;
    for (let i = 0; i < 30; i++) stepLife();
    const inBounds = ghosts.every(
      (g) => g.x >= 0 && g.x < GRID_SIZE && g.y >= 0 && g.y < GRID_SIZE,
    );
    return { ok: true, inBounds };
  } catch (e) {
    return { ok: false, err: String(e) };
  }
});
check("30 generations simulate cleanly, ghosts stay in bounds", ghostSim.ok && ghostSim.inBounds, JSON.stringify(ghostSim));

// fix: free game consumed on first actual move, not on page load
const freeMark = await page.evaluate(async () => {
  localStorage.removeItem("conpacLastPlayDate");
  sessionStorage.removeItem("conpacCanPlay");
  await startNewGame(); // free-game path
  const markedAtLoad = localStorage.getItem("conpacLastPlayDate");
  startLife();
  const markedAtStart = localStorage.getItem("conpacLastPlayDate");
  pauseLife();
  return { markedAtLoad, markedAtStart };
});
check(
  "free game consumed on first move, not on page load",
  freeMark.markedAtLoad === null && !!freeMark.markedAtStart,
  JSON.stringify(freeMark),
);

// fix: refresh mid-game keeps the session credit; a fresh visit is still gated
const credit = await page.evaluate(async () => {
  const today = new Date().toISOString().split("T")[0];
  localStorage.setItem("conpacLastPlayDate", today); // free game already used
  sessionStorage.setItem("conpacCanPlay", "true"); // mid-game refresh
  await startNewGame();
  const withCredit = canPlayGame;
  sessionStorage.removeItem("conpacCanPlay"); // brand-new visit, same day
  // earlier tests stubbed payments to succeed — make them fail like a
  // declined/abandoned payment so the gate is actually exercised
  window.generateInvoice = async () => {
    throw new Error("stub: no backend");
  };
  window.payInvoice = async () => {
    throw new Error("stub: no backend");
  };
  await startNewGame();
  const withoutCredit = canPlayGame;
  return { withCredit, withoutCredit };
});
check(
  "refresh mid-game keeps credit; new visit still payment-gated",
  credit.withCredit === true && credit.withoutCredit === false,
  JSON.stringify(credit),
);

await page.screenshot({ path: SHOTS + "/shot-desktop.png" });

// Environment-only noise: no payment/leaderboard backend runs locally
const noise = [
  "net::ERR",
  "favicon",
  "api/",
  "workers.dev",
  "Failed to load resource",
  "submitting score",
  "Invoice generation",
  "Failed to parse JSON",
  "Response is not JSON",
  "not valid JSON",
  "Failed to fetch",
];
const realErrors = errors.filter((e) => !noise.some((n) => e.includes(n)));
check("no page errors on desktop", realErrors.length === 0, realErrors.join(" | "));

// ---------- Mobile run ----------
const m = await newGamePage({ width: 390, height: 844, isMobile: true, hasTouch: true });
await new Promise((r) => setTimeout(r, 1000));
const mobileLayout = await m.page.evaluate(() => {
  const mb = document.getElementById("mute-btn").getBoundingClientRect();
  const vis =
    mb.width > 0 && mb.top >= 0 && mb.left >= 0 && mb.right <= innerWidth && mb.bottom <= innerHeight;
  const overlaps = [
    "username-btn", "help-btn", "stats-btn",
    "up-btn", "down-btn", "left-btn", "right-btn",
    "livestats", "life-canvas",
  ].filter((id) => {
    const b = document.getElementById(id).getBoundingClientRect();
    return !(mb.right <= b.left || mb.left >= b.right || mb.bottom <= b.top || mb.top >= b.bottom);
  });
  return { vis, overlaps, rect: { l: mb.left, r: mb.right, t: mb.top, b: mb.bottom } };
});
check(
  "mobile: mute button visible, no overlap with header/d-pad/canvas",
  mobileLayout.vis && mobileLayout.overlaps.length === 0,
  JSON.stringify(mobileLayout),
);
await m.page.screenshot({ path: SHOTS + "/shot-mobile.png" });
const mErrors = m.errors.filter((e) => !noise.some((n) => e.includes(n)));
check("no page errors on mobile", mErrors.length === 0, mErrors.join(" | "));

console.log(results.join("\n"));
await browser.close();
server.close();
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
