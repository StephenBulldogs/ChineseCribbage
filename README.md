# Chinese Cribbage. Website

A single-file website (`index.html`) for playing Chinese Cribbage. No build step, no framework, no server required for offline play.

## Modes

- **Solo run** (offline). the original kitchen-table game: just you against the deck, racing to 29 in as few rounds as possible.
- **Versus AI** (offline). easy / medium / hard. Hard runs a Monte Carlo placement simulation (and cannot peek at its own crib).
- **Pass & play** (offline). two players on one screen, with a handoff interstitial.
- **Online table**. **2 to 4 players**, turn-based in seat order with a fresh shuffle per player. Empty seats can be filled with **AI players** (easy/medium/hard) when creating the table; AI turns are played by the host's client and everyone watches them place live. Tables are **public** (listed in the lobby, one-tap join, no code) or **private** (five-letter code), and start automatically when every human seat is filled. While you wait your turn, you watch whoever is playing place every card **live**, move for move (cribs stay hidden), with a per-round history under the rail. **Presence** is tracked: if a player's connection drops, their seat shows as *held*. frozen board, a countdown chip. and for the first **2 minutes** only they can reclaim it (same name + room code), restoring their in-progress round exactly. After 2 minutes the seat becomes claimable: any spectator (or new arrival by code) can take it over, inheriting its score and the half-played round. **Spectating:** in-play public tables stay listed in the lobby with a *Watch* button, and joining a full table by code also enters as a spectator. you see the rail, roster, history, and every placement live, with take-seat buttons if a seat opens up. Firebase config is already embedded.

  One note: AI turns run on the host's device, so if the host is offline when an AI's turn comes up, the table waits for the host to return.

Rules: the first five cards auto-deal (one per hand, one face-down to the crib); you place the rest into hands only. no hand may exceed crib + 1, and the crib auto-fills face-down each time the hands catch up, staying hidden until the count. A starter flips at the end and counts in all five rows; each row scores as a cribbage hand. Round score = total − 29 (under par pegs you backwards). First to a cumulative 29 ends the match, but only after both players have played equal rounds. highest total wins, ties are ties.

## Run it

Just open `index.html` in a browser. The home page is a splash with two doors: **Offline play** (solo, versus AI, pass and play) and **Online play** (sign-in, tables, Conquest, friends, leaderboards). To host it, drop the file on any static host:

- **GitHub Pages**: push to a repo, Settings → Pages → deploy from branch.
- **Netlify / Vercel / Cloudflare Pages**: drag-and-drop the file.

Keyboard play: press **1–5** to place the current card into a row.

## Conquest

An online campaign for Google-signed-in accounts (guests stay casual: no Conquest, no friends list): a winding, animated map of levels with three challenge types that keep escalating (the catalogue grows over time, so no fixed total is shown). Solo sprints (reach a target total within a round budget), single-hand hunts (score a big number in one round), and AI duels against one, two, or three opponents (Deckhand / Navigator / Captain) with growing head starts and higher win targets. Levels unlock in order and any unlocked one can be replayed. The goal is shown on screen throughout the challenge.

**Stars:** for solo and single-hand levels, 3 stars if you finish with 2+ rounds to spare, 2 with 1 to spare, 1 on the final allowed round. For AI duels, 3 stars if you win in 1-3 rounds, 2 in 4-5, 1 in 6+.

**Lives:** 5 hearts. Failing a level costs one, and quitting mid-level counts as a fail. One heart regrows every **30 minutes**; the regrow clock is a stored timestamp, so going offline and coming back refills exactly the hearts you earned while away. Everything (unlocked level, stars, hearts, regrow clock) saves to your account.

**Resume:** the level you are currently playing is snapshotted to your account after every placement and round, including the deal's seed and your placements so far. If you close the tab or lose connection mid-level, signing back in offers a **Resume** that drops you back into the exact board you left, with no life lost and no progress missing. The snapshot clears only when the level actually resolves.

**Leaderboards:** global and friends-only Conquest boards ranked by total stars (then levels cleared), with 🥇🥈🥉 trophies for the top three. Reachable from the Conquest map and the lobby.

## App-style interface

The home screen is a splash with two doors (Offline / Online). A sticky top app-bar carries the wordmark and quick buttons for **how-to-play (ⓘ)** and a **settings panel (⚙)** with sound, reduce-motion, and fast-count toggles plus account sign-out, in the style of mobile games. The Conquest map is a flowing gold trail of glowing nodes with type icons, a pulsing "next level" marker, a stars-and-hearts header, and auto-scroll to your current spot.

## Player levels and banners

Wins and Conquest victories earn **XP**: online win +100, tie +40, loss +20; first Conquest clear +50 plus 15 per star, repeat clears +10. Level n to n+1 costs 100·n XP; your level and progress bar show on your profile. **Banners** decorate your profile and leaderboard entry, unlocking by player level (Jade tide at 3, Gold wave at 5, Plum blossom at 8, Lantern glow at 12) or Conquest milestones (Bamboo grove at 10 stars, Gold cloud at 30, Twin clouds at 60, Dragon at 120, Phoenix at 200). Pick the equipped banner from your profile. Profile photos are a possible future addition.

## Scoring note

**His heels** is implemented: when the starter turned over is a Jack, 2 points are added to the round total (in this game you are always your own dealer). The animated count announces it, and the score sheet lists it as its own line.

## Accounts, stats, friends & challenges

- **Sign-in** gates online play: **Continue with Google** (popup) or **Play as guest**. Guest is a plain local session: one tap, a session id generated in the browser, no auth provider, no username or password. Guests can pick a display name (or get Guest-XXXX) and rename later from their profile. A guest identity lasts for the browser session; rejoining a table after a full restart still works through the same-name-plus-code path. The Firebase Auth SDK is only loaded if someone actually clicks the Google button.
- **Profile stats** per account: Current games (active tables, with one-tap rejoin buttons), Wins, Losses, Ties, Games played, Highest hand, Highest total (best five-hand round), Fastest win, Longest game (in rounds), plus **Conquest levels cleared** and **total Conquest stars**. Win/loss/tie and game-length stats come from completed online matches; highest hand/total also update from solo, AI, and pass-and-play rounds you play while signed in.
- **Friends**: every account gets a six-character friend code (shown in your profile and the lobby). Enter someone's code to add them. it's mutual. The lobby friends list shows live online/offline status with **challenge** (online friends only. creates a private 2-seat table and pops an Accept/Decline dialog on their screen), **profile**, and **remove** actions.
- **Profiles of people you play with**: roster chips for signed-in players are tappable during a match. view their stats and add/remove them as a friend right from the table.

### One-time Firebase console setup for sign-in

In your Firebase project: **Build → Authentication → Sign-in method** → enable **Google**. (Anonymous auth is not needed; guests never touch Firebase Auth.) Then under **Authentication → Settings → Authorized domains**, add the domain where you host the site (localhost is pre-authorized). Without this, the Google button will error and guest sign-in will be rejected.

## Online duels

The Firebase config for the `chinese-cribbage` project is already embedded in `index.html` (web API keys are public identifiers. security comes from the database rules). Make sure the Realtime Database **Rules** tab contains:

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
    },
    "leaderboard": {
      ".read": true,
      "$uid": { ".write": true }
    }
  }
}
```

(These open rules are fine for friends-and-family; before anything truly public, scope user writes with `"$uid": { ".write": "auth.uid === $uid" }` and harden the social writes with security rules or Cloud Functions.)

Fine for friends-and-family; add Firebase Anonymous Auth before anything public.

**Cross-play:** the room protocol is identical to the React Native app's, and both point at the same Firebase project. a browser player can duel an app player with the same room codes.

## Files & tests

```
index.html        the whole site (engine inlined)
engine.js         the game engine source (injected into index.html at build)
engine.test.js    engine tests. node engine.test.js
smoke.test.js     headless UI test via jsdom. npm i jsdom && node smoke.test.js
online.test.js    dual-client protocol test incl. spectating + rejoin. node online.test.js
```

The engine port is verified against the same test vectors as the mobile app, including real scored hands and the equal-rounds match rule.

## Honest limits of casual-mode online

The live move log that powers spectating and rejoin includes the active player's shuffle seed, which means a determined opponent with the browser console open could derive your hidden crib and upcoming cards. Fine for friends and family; for competitive public play, move the seed server-side (Cloud Functions) and publish only the placed cards.
