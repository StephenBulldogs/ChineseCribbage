# Chinese Cribbage — Website

A single-file website (`index.html`) for playing Chinese Cribbage. No build step, no framework, no server required for offline play.

## Modes

- **Solo run** (offline) — the original kitchen-table game: just you against the deck, racing to 29 in as few rounds as possible.
- **Versus AI** (offline) — easy / medium / hard. Hard runs a Monte Carlo placement simulation (and cannot peek at its own crib).
- **Pass & play** (offline) — two players on one screen, with a handoff interstitial.
- **Online table** — **2 to 4 players**, turn-based in seat order with a fresh shuffle per player. Empty seats can be filled with **AI players** (easy/medium/hard) when creating the table; AI turns are played by the host's client and everyone watches them place live. Tables are **public** (listed in the lobby, one-tap join, no code) or **private** (five-letter code), and start automatically when every human seat is filled. While you wait your turn, you watch whoever is playing place every card **live**, move for move (cribs stay hidden), with a per-round history under the rail. **Presence** is tracked: if a player's connection drops, their seat shows as *held* — frozen board, a countdown chip — and for the first **2 minutes** only they can reclaim it (same name + room code), restoring their in-progress round exactly. After 2 minutes the seat becomes claimable: any spectator (or new arrival by code) can take it over, inheriting its score and the half-played round. **Spectating:** in-play public tables stay listed in the lobby with a *Watch* button, and joining a full table by code also enters as a spectator — you see the rail, roster, history, and every placement live, with take-seat buttons if a seat opens up. Firebase config is already embedded.

  One note: AI turns run on the host's device, so if the host is offline when an AI's turn comes up, the table waits for the host to return.

Rules: the first five cards auto-deal (one per hand, one face-down to the crib); you place the rest into hands only — no hand may exceed crib + 1, and the crib auto-fills face-down each time the hands catch up, staying hidden until the count. A starter flips at the end and counts in all five rows; each row scores as a cribbage hand. Round score = total − 29 (under par pegs you backwards). First to a cumulative 29 ends the match, but only after both players have played equal rounds — highest total wins, ties are ties.

## Run it

Just open `index.html` in a browser. To host it, drop the file on any static host:

- **GitHub Pages**: push to a repo, Settings → Pages → deploy from branch.
- **Netlify / Vercel / Cloudflare Pages**: drag-and-drop the file.

Keyboard play: press **1–5** to place the current card into a row.

## Accounts, stats, friends & challenges

- **Sign-in** gates online play: **Continue with Google** (popup) or **Play as guest** — one tap, anonymous Firebase auth, no username or password either way. Guests can pick a display name (or get Guest-XXXX) and rename later from their profile.
- **Profile stats** per account: Current games (active tables, with one-tap rejoin buttons), Wins, Losses, Ties, Games played, Highest hand, Highest total (best five-hand round), Fastest win and Longest game (in rounds). Win/loss/tie and game-length stats come from completed online matches; highest hand/total also update from solo, AI, and pass-and-play rounds you play while signed in.
- **Friends**: every account gets a six-character friend code (shown in your profile and the lobby). Enter someone's code to add them — it's mutual. The lobby friends list shows live online/offline status with **challenge** (online friends only — creates a private 2-seat table and pops an Accept/Decline dialog on their screen), **profile**, and **remove** actions.
- **Profiles of people you play with**: roster chips for signed-in players are tappable during a match — view their stats and add/remove them as a friend right from the table.

### One-time Firebase console setup for sign-in

In your Firebase project: **Build → Authentication → Sign-in method** → enable **Google** and **Anonymous**. Then under **Authentication → Settings → Authorized domains**, add the domain where you host the site (localhost is pre-authorized). Without this, the Google button will error and guest sign-in will be rejected.

## Online duels

The Firebase config for the `chinese-cribbage` project is already embedded in `index.html` (web API keys are public identifiers — security comes from the database rules). Make sure the Realtime Database **Rules** tab contains:

```json
{
  "rules": {
    "rooms": {
      "$code": { ".read": true, ".write": true }
    },
    "publicRooms": {
      ".read": true,
      "$code": { ".write": true }
    },
    "users": {
      "$uid": { ".read": true, ".write": true }
    },
    "friendCodes": {
      ".read": true,
      "$code": { ".write": true }
    }
  }
}
```

(These open rules are fine for friends-and-family; before anything truly public, scope user writes with `"$uid": { ".write": "auth.uid === $uid" }` and harden the social writes with security rules or Cloud Functions.)

Fine for friends-and-family; add Firebase Anonymous Auth before anything public.

**Cross-play:** the room protocol is identical to the React Native app's, and both point at the same Firebase project — a browser player can duel an app player with the same room codes.

## Files & tests

```
index.html        the whole site (engine inlined)
engine.js         the game engine source (injected into index.html at build)
engine.test.js    engine tests — node engine.test.js
smoke.test.js     headless UI test via jsdom — npm i jsdom && node smoke.test.js
online.test.js    dual-client protocol test incl. spectating + rejoin — node online.test.js
```

The engine port is verified against the same test vectors as the mobile app, including real scored hands and the equal-rounds match rule.

## Honest limits of casual-mode online

The live move log that powers spectating and rejoin includes the active player's shuffle seed, which means a determined opponent with the browser console open could derive your hidden crib and upcoming cards. Fine for friends and family; for competitive public play, move the seed server-side (Cloud Functions) and publish only the placed cards.
