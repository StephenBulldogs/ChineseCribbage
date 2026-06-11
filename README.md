# Chinese Cribbage — Website

A single-file website (`index.html`) for playing Chinese Cribbage. No build step, no framework, no server required for offline play.

## Modes

- **Versus AI** (offline) — easy / medium / hard. Hard runs a Monte Carlo placement simulation.
- **Pass & play** (offline) — two players on one screen, with a handoff interstitial and the current card hidden between turns.
- **Online duel** — five-letter room codes; turn-based, a fresh shuffle for each player each round (the waiting player sees whose turn it is). Firebase config is already embedded.

Rules: the first five cards auto-deal (one per hand, one face-down to the crib); you place the rest into hands only — no hand may exceed crib + 1, and the crib auto-fills face-down each time the hands catch up, staying hidden until the count. A starter flips at the end and counts in all five rows; each row scores as a cribbage hand. Round score = total − 29 (under par pegs you backwards). First to a cumulative 29 ends the match, but only after both players have played equal rounds — highest total wins, ties are ties.

## Run it

Just open `index.html` in a browser. To host it, drop the file on any static host:

- **GitHub Pages**: push to a repo, Settings → Pages → deploy from branch.
- **Netlify / Vercel / Cloudflare Pages**: drag-and-drop the file.

Keyboard play: press **1–5** to place the current card into a row.

## Online duels

The Firebase config for the `chinese-cribbage` project is already embedded in `index.html` (web API keys are public identifiers — security comes from the database rules). Make sure the Realtime Database **Rules** tab contains:

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

**Cross-play:** the room protocol is identical to the React Native app's, and both point at the same Firebase project — a browser player can duel an app player with the same room codes.

## Files & tests

```
index.html        the whole site (engine inlined)
engine.js         the game engine source (injected into index.html at build)
engine.test.js    engine tests — node engine.test.js
smoke.test.js     headless UI test via jsdom — npm i jsdom && node smoke.test.js
online.test.js    dual-client turn-based protocol test — node online.test.js
```

The engine port is verified against the same test vectors as the mobile app, including real scored hands and the equal-rounds match rule.
