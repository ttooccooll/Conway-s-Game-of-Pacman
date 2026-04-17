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
- **The Ghosts**: 6 chase you relentlessly (always invincible - you can't eat them)
- **The Walls**: Conway's Game of Life cells that will kill you if they grow onto your position

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
- After **500 total score**, speed increases to **210ms per generation**

### Free vs Paid Games

- **One free game per day** (tracked locally)
- Additional games require **100 sats** via Bitcoin Lightning
- Payment handled via WebLN browser extension or QR code

---

## Features

### Core Gameplay
- 40x40 grid arena
- 6 ghosts with independent AI (40% random movement to be unpredictable)
- 500 collectible bitcoin (dots)
- Auto-replenishing collectibles (adds 200 more when 10 remain)
- Pause/Resume/Reset controls

### User Accounts (Nostr)
- Login with **any npub** (no password needed)
- Profile fetched from Nostr relays (damus.io, snort.social, nostr.wine)
- Username, avatar, and Lightning address support

### Lightning Integration
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

Lightning payment features require a backend server. The frontend expects:
- `POST /api/create-invoice` - Creates Lightning invoice
- `GET /api/check-invoice?paymentHash=` - Verifies payment

Example backend (Cloudflare Workers):
```javascript
// api/create-invoice.js
// api/check-invoice.js
```

See the live site for the production backend implementation.

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
| Click Canvas | Toggle cells when paused |
| Start Button | Begin new game |
| Pause Button | Pause/resume |
| Reset Button | Reset grid |

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

- Pathfinding: Minimizes Manhattan distance to player
- Randomness: 40% chance to move randomly
- Wall avoidance: Cannot traverse live cells

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