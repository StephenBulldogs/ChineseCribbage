# Chinese Cribbage. Website

A single-file website (`index.html`) for playing Chinese Cribbage. No build step, no framework, no server required for offline play.

## Modes

- **Solo run** (offline). the original kitchen-table game: just you against the deck, racing to 29 in as few rounds as possible.
- **Versus AI** (offline). easy / medium / hard. Hard runs a Monte Carlo placement simulation (and cannot peek at its own crib).
- **Pass & play** (offline). 2 to 4 players on one screen, with a handoff interstitial. Pick the player count and name each seat before the match; the setup is remembered for rematches.
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

**Lives:** 5 hearts. Failing a level costs one, and quitting mid-level counts as a fail. One heart regrows every **30 minutes** (**15 minutes** for Premium accounts, see Coins & Shop below); the regrow clock is a stored timestamp, so going offline and coming back refills exactly the hearts you earned while away. Everything (unlocked level, stars, hearts, regrow clock) saves to your account.

**Resume:** the level you are currently playing is snapshotted to your account after every placement and round, including the deal's seed and your placements so far. If you close the tab or lose connection mid-level, signing back in offers a **Resume** that drops you back into the exact board you left, with no life lost and no progress missing. The snapshot clears only when the level actually resolves.

**Leaderboards:** global and friends-only Conquest boards ranked by total stars (then levels cleared), with 🥇🥈🥉 trophies for the top three. Reachable from the Conquest map and the lobby.

## App-style interface

The online section opens on a **menu hub** of three large jade-and-gold cards rather than one long form: **Make Table** (host 2-4 players, configure AI seats, public or private), **Find Table** (browse open/in-play tables, join by code, manage friends and challenges), and **Conquest** (the campaign). A back arrow returns to the hub from any panel. A signed-in account bar shows an avatar, player level and an XP bar.

The home screen is a splash with two doors (Offline / Online). A sticky top app-bar carries the wordmark and quick buttons for **how-to-play (ⓘ)** and a **settings panel (⚙)** with sound, reduce-motion, and fast-count toggles plus account sign-out, in the style of mobile games. The Conquest map is a flowing gold trail of glowing nodes with type icons, a pulsing "next level" marker, a stars-and-hearts header, and auto-scroll to your current spot.

## Coins, the Shop & Premium

Signed-in Google accounts earn **coins** by playing: **+1 coin** per win in a normal match (versus AI, or an online table), and **+2 coins per star** earned in a Conquest level — including replays of a level you've already cleared. Your coin total shows at all times as a gold pill in the top app bar (tap it to open the Shop).

The **Shop** (tap the coin pill) spends coins two ways:
- **Premium — 1,000 coins**, a one-time account upgrade. Premium accounts regrow Conquest hearts every **15 minutes** instead of 30.
- **Extra life — 20 coins**, an instant +1 Conquest heart (up to the usual 5-heart cap).

Guest sessions earn and can spend coins too, but since guest identities aren't persistent (see Accounts below), the Shop blocks guests from buying Premium or lives — sign in with Google first to keep them.

## Admin panel

The Google account **sschwender@gmail.com** sees an **Admin panel** button in Settings (⚙). It lists every account (name, email, coins, hearts, Premium status) with a search box, and lets the admin directly edit any account's **coins**, **hearts**, and toggle **Premium** on/off — for comping Premium, fixing a stuck account, etc.

This gate is **client-side only**, the same trust model the rest of this app already uses for stats, XP, and Conquest progress (see "Honest limits" below): the panel simply doesn't render unless the signed-in Firebase Auth user's email matches. It is not a substitute for real server-side authorization. See the Firebase rules block below for the one rule change this feature needs.

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
      ".read": true,
      "$uid": { ".write": true }
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

**If you already have this project's rules deployed from before the Coins/Shop/Admin feature**, you need to make exactly one change: move `".read": true` from under `"$uid"` up to the `"users"` node itself (as shown above). That's what lets the admin panel list every account in one query (`fdb.ref('users').get()`) instead of only ever reading one known uid at a time — the same pattern `publicRooms` and `friendCodes` already use. Nothing else needs to change: coins, `premium`, and `email` are just new fields under the existing `users/$uid` node, already covered by the existing `"$uid": { ".write": true }` rule.

(These open rules are fine for friends-and-family; before anything truly public, scope user writes with `"$uid": { ".write": "auth.uid === $uid" }` and harden the social writes with security rules or Cloud Functions. Note that doing so would also block **guest** sign-in as currently implemented, since guests never authenticate with Firebase Auth at all — their `uid` is a locally-generated string, so `auth.uid` is never set for their writes. The admin panel's email gate is client-side only, same as every other write in this app; nothing stops a signed-in user from editing their own `coins`/`premium` fields directly via the browser console short of adding Cloud Functions to mediate purchases.)

Fine for friends-and-family; add Firebase Anonymous Auth before anything public.

**Cross-play:** the room protocol is identical to the React Native app's, and both point at the same Firebase project. a browser player can duel an app player with the same room codes.

## Files & tests

```
index.html        the whole site (engine + ui + online inlined; this is the deployed artifact and what the tests below load)
engine.js         the game engine source (kept in sync with the copy inlined in index.html)
ui.js             the UI/app source (kept in sync with the copy inlined in index.html)
online.js         Firebase loading + online room protocol source (kept in sync with the copy inlined in index.html)
engine.test.js    engine tests. node engine.test.js
smoke.test.js     headless UI test via jsdom. npm i jsdom && node smoke.test.js
online.test.js    dual-client protocol test incl. spectating + rejoin. node online.test.js
resume.test.js    Conquest resume-after-close test. node resume.test.js
isolation.test.js per-account state isolation test. node isolation.test.js
newfeatures.test.js  forfeit + idle-table auto-close tests. node newfeatures.test.js
shop.test.js      coins, Premium, the Shop, and the admin panel. node shop.test.js
```

`ui.js` and `index.html`'s inlined copy of it must always match exactly — there is no build step, so any change to one has to be hand-copied into the other.

The engine port is verified against the same test vectors as the mobile app, including real scored hands and the equal-rounds match rule.

## Honest limits of casual-mode online

The live move log that powers spectating and rejoin includes the active player's shuffle seed, which means a determined opponent with the browser console open could derive your hidden crib and upcoming cards. Fine for friends and family; for competitive public play, move the seed server-side (Cloud Functions) and publish only the placed cards.

## App-style visual layer

The interface is built to feel like a polished mobile game while remaining a single self-contained HTML file. The looks are reconstructed in CSS/SVG (not embedded screenshots) so they scale across screen sizes and wire to live game state:

- Bottom tab bar (Home / Conquest / Friends / Messages / Profile) for primary navigation, with live badges for online friends and pending challenges.
- Unlockable card-back designs using real sliced artwork (Classic, Jade Garden, Red Lacquer Imperial, Bamboo Minimalist, Porcelain Blue & White, Gold Dragon Ornate, Dark Night Tournament), unlocked by player level or Conquest stars and chosen from a picker in the profile dialog. The six themed backs are sliced from the supplied transparent asset sheet and embedded as compressed WebP data URIs (~46KB total).
- Ornate jade/lacquer/gold buttons and splash doors with depth and cloud-corner motifs.
- The Conquest map uses a compressed embedded background image behind the node trail with a dark legibility scrim; nodes are styled as stone/jade tiles.

Embedded raster assets are the Conquest map backdrop (~107KB JPEG) and the six card backs (~46KB total WebP); buttons, nav and UI chrome remain CSS/SVG so they scale. Friends management lives solely in the Friends tab (removed from the Find Table panel to avoid duplication).

## Card-face decks

Separate from the card *backs*, players can unlock full illustrated **deck face** themes that replace every card front with custom artwork (illustrated pips, dragon aces, and painted court cards):

- Imperial Ink (unlocks at player level 3)
- Dragon Brush (unlocks at 25 Conquest stars)
- Jade Porcelain (unlocks at player level 8 and 50 Conquest stars)

The three themes were sliced from the supplied deck sheets into 156 individual card faces (52 per theme), compressed to WebP, and embedded as data URIs in a dedicated script block (window.FACE_DECKS). The active deck is chosen from a picker in the profile and persists per account. Selecting "Standard Faces" returns to the lightweight text/pip rendering.

## Conquest map tiles

The Conquest level nodes use sliced isometric tile artwork instead of plain circles. Eight node tiles were cut from the supplied transparent tile sheet (the gray checkerboard was flood-filled to real transparency), compressed to WebP (~77KB total), and embedded as CSS variables. Each node picks its tile by state and type: locked levels show a chained stone tile, cleared levels a cloud-marked tile, AI duels a crossed-swords tile, best-round challenges a reward tile, milestone levels (every 10th) a gold dragon tile, and standard levels a blank stone platform. The decorative scenery tiles (temple, bridge, gate, shrine, bamboo spring) were sliced too but are not yet placed on the map.

## Conquest map road and terrain zones

The Conquest map now reads as a journey along a winding stone road. The level nodes sit on a curved road drawn with quadratic SVG segments (dark edge, stone fill, dashed centre line, and a gold progress overlay that fills as you advance). Every 10 levels the terrain changes into a named zone (Bamboo Vale, Jade Cliffs, Lantern Town, Misty Range, Autumn Maples, Lotus Waters, Stone Pass, Snow Peaks, Imperial Road, Dragon Summit), each rendered as a tinted band behind the road with its own label. Unreached zones are dimmed.
