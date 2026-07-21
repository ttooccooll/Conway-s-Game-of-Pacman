# Alby Hub App Store submission

Materials for submitting Conway's Game of Pacman to the Alby Hub store
(see the [how-to wiki](https://github.com/getAlby/hub/wiki/How-to:-submit-new-app-to-Hub's-Store)).

## Pre-submission checklist

- [ ] Playtest the in-game **Connect wallet (NWC)** flow against a real
      Alby Hub connection (stats → Connect wallet), including a paid play,
      a continue, and a zap
- [ ] Fork `getAlby/hub`, branch from `master`
- [ ] Copy `docs/store/conpac.png` (200×200, 555 bytes) to
      `frontend/src/assets/suggested-apps/conpac.png`
- [ ] Edit `frontend/src/components/connections/SuggestedAppData.tsx`
      (import + entry below, both in alphabetical order - `conpac` sits
      between `clams` and `coracle`)
- [ ] Open the PR

## Import line

```tsx
import conpac from "src/assets/suggested-apps/conpac.png";
```

## App entry

```tsx
{
  id: "conpac",
  title: "Conway's Game of Pacman",
  description: "Pac-Man vs the Game of Life",
  webLink: "https://conwaysgameofpacman.xyz/",
  logo: conpac,
  extendedDescription:
    "Pay for arcade plays and continues, and zap the leaderboard, straight from your Hub",
  installGuide: (
    <>
      <p className="text-muted-foreground">
        Open{" "}
        <ExternalLink
          to="https://conwaysgameofpacman.xyz"
          className="font-medium text-foreground underline"
        >
          Conway's Game of Pacman
        </ExternalLink>{" "}
        in your browser
      </p>
    </>
  ),
  finalizeGuide: (
    <>
      <div>
        <h3 className="font-medium">In Conway's Game of Pacman</h3>
        <ul className="list-inside list-decimal text-muted-foreground">
          <li>
            Click{" "}
            <span className="font-medium text-foreground">stats</span> →{" "}
            <span className="font-medium text-foreground">Connect wallet</span>
          </li>
          <li>Paste your connection secret and click Connect</li>
          <li>
            Plays, continues, and leaderboard zaps are now paid in one tap
          </li>
        </ul>
      </div>
    </>
  ),
},
```

## Notes

- The connection only needs `pay_invoice` (a small monthly budget like
  2,000 sats is plenty - a play is 100 sats, continues start at 121).
- The game works without any connection (WebLN extension or QR); the NWC
  connection is the recommended path for mobile players.
