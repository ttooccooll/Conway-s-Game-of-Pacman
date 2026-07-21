# Conway's Game of Pacman

A wildly unique arcade game that combines John Conway's Game of Life with classic Pacman gameplay. The walls evolve according to cellular automaton rules while you navigate as Pacman, collecting bitcoin that aren't real bitcoin but are worth fake bitcoin points.

**Play it now**: https://conwaysgameofpacman.xyz/

---

## Table of Contents

1. [How to Play](#how-to-play)
2. [Game Rules](#game-rules)
3. [Features](#features)
4. [Tech Stack](#tech-stack)
5. [Installation](#installation)
6. [File Structure](#file-structure)
7. [Controls](#controls)
8. [API Endpoints](#api-endpoints)
9. [Architecture](#architecture)
10. [Contributing](#contributing)
11. [License](#license)

---

## How to Play

1. **Start**: Press the Start button or use arrow keys to begin
2. **Move**: Navigate Pacman using arrow keys or touch controls (mobile)
3. **Collect**: Gather golden dots scattered across the arena
4. **Survive**: Avoid the ghosts AND the evolving walls!
5. **Score**: Your score = collected bitcoin + generations survived

### Objective

Score as high as possible before getting caught by:
- **The Ghosts**: 6 hunters, each with its own personality (always invincible - you can't eat them)
- **The Walls**: Conway's Game of Life cells that will kill you if they grow onto your position

The arena is a torus: run off any edge and you reappear on the opposite side. The ghosts, the walls, and the gliders all wrap around too.

Died? You can **continue right where you fell** — your score and board survive, the nearby walls clear, and the ghosts scatter. Because a continue preserves your run, it costs more than a fresh game: 121 sats, doubling each time (121, 242, 484, …), so leaderboard spots can't simply be bought.

---

## Game Rules

### Conway's Game of Life (Wall Evolution)

The grid walls follow these cellular automaton rules:
- Any live cell with **2 or 3 live neighbors survives**
- Any dead cell with **exactly 3 live neighbors becomes alive**
- All other cells **die** or remain dead

### Special Patterns

The game occasionally spawns gliders and spaceships from the corners to keep things interesting:
- **Gliders**: Move diagonally across the grid
- **LWSS** (Lightweight Spaceship): Fast horizontal movement
- **MWSS** (Medium-weight Spaceship): Slower but larger

### Speed Progression

- Game starts at **300ms per generation**
- Every **100 total score** shaves **15ms** off the generation time
- Caps at **150ms per generation** (double speed) around 1000 total score
- Gliders and spaceships also spawn more frequently the longer you survive (up to 3x)

### Free vs Paid Games

- **One free game per day** (tracked locally)
- Additional games require **100 sats** via Bitcoin Lightning
- Payment handled via WebLN browser extension or QR code

---

## Features

### Core Gameplay
- 40x40 wrap-around (toroidal) grid arena
- 6 ghosts with distinct personalities:
  - **Chaser** (red): heads straight for you
  - **Ambusher** (magenta): aims ahead of your current direction
  - **Flanker** (cyan): pincers you from the chaser's opposite side
  - **Stalker** (blue): follows the trail you leave behind
  - **Patroller** (orange): chases when far, retreats to its corner when close
  - **Wanderer** (green): drifts unpredictably
  - Each ghost's pupils look toward its current target
- 500 collectible bitcoin (dots)
- Auto-replenishing collectibles (adds 200 more when 10 remain)
- Pause/Resume/Reset controls
- Continue after death (score and board preserved) — 121 sats, doubling
  with each continue in a run
- Retro synth sound effects with a mute toggle (persisted)

### User Accounts (Nostr)
- Login with **any npub** (no password needed)
- Profile fetched from Nostr relays (damus.io, snort.social, nostr.wine)
- Username, avatar, and Lightning address support
- **Share your score to Nostr** from the game-over screen — signs a note
  with your NIP-07 extension and publishes to the relays; without an
  extension it opens the native share sheet (mobile) or copies the text
- Score submissions include a **NIP-98 auth event** when logged in with a
  Nostr extension, so the backend can verify who really posted a score
- Leaderboard entries are rendered as plain text — profile names and
  pictures from Nostr can't inject markup

### Lightning Integration
- **Connect your wallet (NWC)**: paste a Nostr Wallet Connect string
  (e.g. from Alby Hub) under stats → Connect wallet for 1-tap plays,
  continues, and zaps — ideal on mobile. Optional; stored only in your
  browser. Use a budgeted, pay-only connection.
- **WebLN**: Browser extension payment support
- **QR Code**: Manual invoice payment
- **LNURL**: Zap other players directly
- Tip developer: 10,000 sats via stats button

### Leaderboard
- Global high scores
- Zap others on the leaderboard
- Tracks zap count and sats received

### Stats Tracking
- Games played
- Best score
- Last score
- Local storage + optional backend sync

---

## Tech Stack

- **Frontend**: Vanilla JavaScript (no frameworks)
- **Rendering**: HTML5 Canvas
- **Styling**: Custom CSS with arcade-style buttons
- **Fonts**: Atari Classic, Super (TTF)
- **Payments**: Bitcoin Lightning Network
  - NWC (Nostr Wallet Connect) via AlbyHub for invoices
  - WebLN
  - LNURL/LNURLw
  - bech32 encoding
- **Authentication**: Nostr (NIP-05, NIP-19)
- **External APIs**:
  - QRCode.js
  - nostr-tools
  - @scure/base
  - bech32-buffer

---

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/gameofpacman.git
cd gameofpacman

# Install serve (or use any static server)
npm install -g serve

# Run the development server
npx serve .
```

### Backend Requirements

Lightning invoices are handled by the Vercel serverless functions in
`api/`, which talk to an [AlbyHub](https://albyhub.com/) wallet over
**NWC (Nostr Wallet Connect)** using `@getalby/sdk`:

- `POST /api/create-invoice` — creates a Lightning invoice
- `GET /api/check-invoice?paymentHash=` — checks payment status

Configuration is a single environment variable:

- `NWC_URL` — a `nostr+walletconnect://…` connection string from AlbyHub.
  Grant it **receive-only permissions** (create + look up invoices) so it
  can't spend funds. Requires Node 22 (pinned via `engines`).

To run payments locally use `vercel dev` with `NWC_URL` set; `npx serve .`
is enough for the game itself.

Leaderboard, stats, zap recording, and LNURL proxying live in a separate
Cloudflare Worker (`conpac-backend.jasonbohio.workers.dev`), not in this
repository.

### Tests

`npm test` installs the test dependencies and runs a headless-Chrome
suite (`test/verify.mjs`) covering gameplay, payments UI, sharing,
leaderboard rendering, and the security headers. It needs a local
Chrome/Chromium (set `CHROME_PATH` if it isn't auto-detected). The same
suite runs in GitHub Actions on every push.

---

## File Structure

```
.
├── index.html              # Main HTML entry point
├── script.js             # All game logic (1729 lines)
├── style.css            # Styling (1002 lines)
├── pac.png             # Favicon
├── Atari.ttf           # Retro arcade font
├── Super1.ttf         # Title font
├── api/
│   ├── create-invoice.js   # Lightning invoice creation
│   └── check-invoice.js  # Payment verification
├── kings.mp3           # Audio (referenced in code)
├── kingm.mp3          # Audio (referenced in code)
└── README.md
```

---

## Controls

| Input | Action |
|-------|-------|
| Arrow Keys | Move Pacman (auto-starts game) |
| Touch D-Pad | Mobile movement |
| Click Canvas | Toggle cells (sandbox mode, between games only) |
| Start Button | Begin new game |
| Pause Button | Pause/resume |
| Reset Button | Reset grid |
| 🔊 Button | Mute/unmute sound |

---

## Architecture

### Game Loop

```
initGrid() → startLife() → stepLife() (every 300ms)
    ↓
Draw: grid → collectibles → ghosts → player
    ↓
Check collisions
    ↓
Update score display
```

### Ghost AI

- Each ghost computes a personality-specific target (player, ahead of player, flank point, trail, or home corner)
- Pathfinding: minimizes toroidal Manhattan distance to its target
- Randomness: per-personality (15% for the chaser up to 75% for the wanderer)
- Wall avoidance: cannot traverse live cells; can wrap around edges

### Payment Flow

```
1. Check free game (localStorage)
2. If paid required:
   a. Try WebLN first
   b. Fall back to QR code
3. Poll /api/check-invoice every 1s
4. Unlock game on payment
```

### Nostr Login

```
1. User provides npub or uses extension
2. Decode npub to pubkey (NIP-19)
3. Fetch profile from relays (kind 0)
4. Store in localStorage
5. Display on leaderboard
```

---

## Contributing

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Test locally
5. Submit a PR

---

## License

MIT

---

**Play now**: https://conwaysgameofpacman.xyz/

**Author**: https://stacker.news/jasonb

*"The walls will kill you. The ghosts will eat you. The game of life goes on."*