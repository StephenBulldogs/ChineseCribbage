# Chinese Cribbage — Website

A single-file website (`index.html`) for playing Chinese Cribbage. No build step, no framework, no server required for offline play.

## Modes

- **Versus AI** (offline) — easy / medium / hard. Hard runs a Monte Carlo placement simulation.
- **Pass & play** (offline) — two players on one screen, with a handoff interstitial and the current card hidden between turns.
- **Online duel** (needs Firebase) — five-letter room codes; both players get the identical deal each round from a shared seed.

Rules: the first five cards auto-deal (one per hand, one face-down to the crib); you place the rest into hands only — no hand may exceed crib + 1, and the crib auto-fills face-down each time the hands catch up, staying hidden until the count. A starter flips at the end and counts in all five rows; each row scores as a cribbage hand. Round score = total − 29 (under par pegs you backwards). First to a cumulative 29 ends the match, but only after both players have played equal rounds — highest total wins, ties are ties.

## Run it

Just open `index.html` in a browser. To host it, drop the file on any static host:

- **GitHub Pages**: push to a repo, Settings → Pages → deploy from branch.
- **Netlify / Vercel / Cloudflare Pages**: drag-and-drop the file.

Keyboard play: press **1–5** to place the current card into a row.

## Enable online duels (~5 minutes, free)

1. [console.firebase.google.com](https://console.firebase.google.com) → Add project → Build → **Realtime Database** → Create.
2. Project settings → Your apps → **Web app (</>)** → copy the config values into the `FIREBASE_CONFIG` block near the top of the script in `index.html`.
3. Database **Rules** tab:

```json
{
  "rules": {
    "rooms": {
      "$code": { ".read": true, ".write": true }
    }
  }
}
```

Fine for friends-and-family; add Firebase Anonymous Auth before anything public.

**Cross-play:** the room protocol and the seeded shuffle are byte-identical to the React Native app's. Point both at the same Firebase project and a browser player can duel an app player — same room codes, same deals (verified: seed 12345 deals `5D,10H,13H,6D,2H` in both engines).

## Files & tests

```
index.html        the whole site (engine inlined)
engine.js         the game engine source (injected into index.html at build)
engine.test.js    engine tests — node engine.test.js
smoke.test.js     headless UI test via jsdom — npm i jsdom && node smoke.test.js
```

The engine port is verified against the same test vectors as the mobile app, including real scored hands and the equal-rounds match rule.
