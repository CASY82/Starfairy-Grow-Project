# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A self-contained, framework-free HTML/CSS/vanilla-JS build of **별빛 정령 키우기** (mobile idle-gacha RPG).
It started as a faithful DOM/CSS port of the prototype at `../plan/index.html`, then grew well beyond it:
`../plan/game-design-document.html` (GDD) is the narrative/UI design source of truth, and
`../plan/unimplemented-features-design-spec.md` is the implementation spec for everything added after the
initial port — read that file before touching gacha/party/village/mission code, since it records the exact
scope decisions (what was simplified vs. the GDD, and why) that the code below follows. `../plan/CONTEXT.md`
and `../plan/unimplemented-features-checklist.md` have additional background/status tracking but are
summaries — prefer the two HTML/MD design docs and this codebase's own code when they disagree.

**Numbers authority**: gacha probabilities/pity, merge costs (`MERGE_COSTS`), star multipliers
(`STAR_MULTIPLIERS`), and the stage HP/reward growth curve (`#nextEnemy()`) were ported from the original
prototype and are treated as already-validated — don't change them without an explicit reason, even when
the GDD's own tables say something numerically different (the design spec explains why: re-deriving the
stage curve from the GDD's formula would invalidate already-tuned clear-time balance).

**Scope**: everything in the design spec that is achievable client-only is implemented. Content that
inherently needs a server — guild co-op boss, async PvP, live-ops content rotation, real friends/mail,
paid subscription/pass/cosmetics, server-side analytics aggregation — is deliberately **not** implemented
and stays as static info/locked cards. See the checklist's 🔒-marked rows for the authoritative list.

**This was originally built with the Phaser 3 game engine and later reverted to plain DOM/CSS** after the
Phaser build shipped with an unresolved rendering glitch that couldn't be fixed blind in this environment
(no headless browser available to inspect it live — see `../plan/product-phaser-build.md` §9-11 for the
full story). The domain layer survived that rewrite unchanged — it never depended on Phaser.

## Running it

There is no build step and no package.json — everything is plain ES modules loaded directly by the browser.

```bash
cd game1/product
python3 -m http.server 8080   # any static file server works
# open http://localhost:8080
```

Serving over http(s) is strongly recommended over opening `index.html` via `file://` — the summon video
(`assets/video/소환.mp4`) and `fetch`-based module imports can behave inconsistently under `file://` in some
browsers.

There is no test suite, linter, or bundler configured. To sanity-check a change without a browser,
syntax-check a module directly with Node (files use `import`/`export`, so pass `--input-type=module`):

```bash
node --input-type=module --check < src/domain/GameStore.js
```

**No headless browser is available in this environment** (Node 18, no Playwright/Puppeteer). Static checks
(syntax, cross-file import/export names, DOM-id references vs. `index.html`, asset-path existence) catch a
lot but have already missed at least one real runtime bug in this project's history — treat "all static
checks pass" as necessary, not sufficient, and say so explicitly when reporting work back.

## Architecture

```
domain/   pure game rules + mutable progress state   (no DOM references — reusable, unit-testable)
audio/    sound as a small stateful class             (Web Audio only, no DOM references)
dom/      $/$$ query-selector shortcuts, toast, local analytics ring buffer (generic, no game rules)
views/    one module per bottom-tab / segment domain + cinematic  (DOM + domain, wired together)
app.js    bootstrap — creates the shared instances, wires nav/sheets, owns the two timers
```

**`src/domain/`** — framework-agnostic, the single source of truth for every rule and every mutation of
player progress:
- `units.js` — `formatUnit()`, the a~zz big-number formatter. Pure function, no state.
- `heroCatalog.js` — static reference data: rarity tables (`RARITY_ORDER`, `RARITY_LABEL`, `RARITY_COLOR`,
  `RARITY_BUDGET` — the per-rarity power budget used by `recomputePartyStats()`), the 20-hero `POOL` /
  `ALL_HEROES`, `heroRarityOf`/`heroRoleOf`/`heroElementOf` lookups, `ROLE_FRONT_PRIORITY`,
  `CHAPTER_ELEMENT` + `elementBeats()`/`chapterOfStage()` (the 5-element advantage cycle), stage names,
  boss level tables, and image-path helpers. `heroImagePath()`/`weaponImagePath()`/`weaponSdImagePath()`
  resolve to `assets/images/...jpg`; `heroSdImagePath()` resolves to `assets/images/...SD.png` (transparent,
  see Assets below — SD portraits are the only hero images with alpha, everything else is opaque JPEG).
  `weaponImagePath`/`weaponSdImagePath` fall back to a shared representative weapon art via
  `WEAPON_ART_FALLBACK` for the 11 heroes without dedicated weapon art. `CHAPTER_ENEMY_IMAGES`/
  `BOSS_ENEMY_IMAGES` + `enemyImagePath(stage)` and `CHAPTER_BACKGROUNDS` + `chapterBackgroundPath(stage)`
  map the current stage to its monster/boss PNG and chapter background JPG for the side-scroll battle scene
  (see `../plan/complete/monster-and-side-scroll-battle-integration.md` for how these were produced). Any
  new character/weapon/monster must follow this file's naming convention.
- `combatFormulas.js` — `roleCompletionMultiplier()` (party role-diversity bonus) and
  `partyDominantElement()`/`elementAdvantageMultiplier()` (5-element rock-paper-scissors vs. the current
  chapter's element). Pure functions consumed by `GameStore.recomputePartyStats()`.
- `GameStore.js` — a large class (~1200 lines) encapsulating all mutable player progress (`#state`/`#battle`
  as true private fields) and every rule that touches it. Organized in this order: gacha (`pull`/
  `pullNormal`/`pullWithBond` + pity + real 50:50 pickup guarantee), auto-battle (`performAutoAttack()`,
  `recomputePartyStats()`, `#battleForecast()`, `#nextEnemy()`, ultimate gauge, hard mode, defeat handling),
  party formation (`assignPartySlot`, `toggleSlotRow`, `autoFormLegendary`/`autoFormGrowth`, presets), hero
  growth (`levelUpHero`, `mergeHeroNamed`, `giftBond`, `upgradeWeaponFor`/`promoteWeaponFor`), village
  buildings (`startBuildingUpgrade`/`collectBuildingUpgrade`, real-time queue), special dungeons
  (`runExpedition`/`runSanctuary`/`runArmory`), new adventure content (`attemptBounty`, `attemptTower`,
  `startLabyrinth`/`attemptLabyrinthRoom`), and missions/attendance/season track. BigInt is used for large
  currencies/combat numbers (gold, gems, attack, HP); plain `Number` is used for small counters (materials,
  star powder, mission progress) — never mix the two in one expression. `app.js` owns the single
  `GameStore` instance for the session; nothing outside this class ever mutates `#state`/`#battle` directly,
  only through its methods. `store.busy` is a public settable flag (not private) — the cinematic uses it to
  lock repeat pulls while a reveal sequence is playing.
  - **`recomputePartyStats()`** is the load-bearing method for anything touching combat power: it re-sums
    attack/HP from every hero in `state.party[]` (rarity budget × level × star × weapon × row multipliers),
    then applies role-completion, element-advantage, account-level, and consecutive-loss-comeback
    multipliers, and writes the result into `#battle.attack`/`#battle.partyMaxHp`. It's called defensively/
    idempotently at the top of `effectiveAttack()`, so any state mutation that changes party composition,
    hero level/star/weapon, or account level should also call it directly (existing methods already do —
    follow that pattern for new ones).
  - **`#battleForecast()`** (public `battleForecast()`) is the single shared win/lose verdict used by the
    pre-battle badge, `attemptBounty`, `attemptTower`, and `attemptLabyrinthRoom` — don't duplicate this
    logic in a view.
  - Save format is versioned (`SAVE_VERSION = 3`) with BigInt-safe JSON (`__bigint` tag) and a
    `#migrateLegacy()` path for v2 saves (single global `weapon`/`mergeState` → per-hero `heroes[name]`).

**`src/audio/SoundManager.js`** — a small class wrapping Web Audio oscillator SFX, with `enabled` as real
encapsulated state on the instance. `app.js` creates one instance and passes it into `initCinematic()`; the
settings sheet's sound toggle calls `audio.setEnabled()` directly on that same instance.

**`src/dom/`**:
- `dom.js` — `$`/`$$` (querySelector shortcuts) and `createToast()`. There is no virtual DOM, no component
  system, no build step: views query the existing markup in `index.html` by id/class and mutate it directly
  (`textContent`, `classList`, `style.width`). CSS animations (`page-in`/`card-reveal`/`damage-rise` etc.)
  live in `index.html`'s `<style>` block and are driven by class toggling, not JS-computed styles.
- `analytics.js` — `track(name, props)` / `exportEvents()`, a `localStorage`-backed 500-event ring buffer
  implementing the GDD's event schema (`banner_view`, `summon_start`, `summon_result`, `cinematic_skip`,
  etc.). There is no server to send events to — this only accumulates a local, exportable log.

**`src/views/`** — one module per bottom-tab/segment domain, each exporting `init<Name>View(deps)` (called
once, wires event listeners) and `refresh<Name>View(store)` (called after any state change, re-renders
text/DOM from current `store` state):
- `villageView.js` — buildings (6, with the real-time construction queue) + 3 special dungeons.
- `spiritsView.js` — thin orchestrator: wires the `#spiritsSegment` (도감/편성/성장) tab buttons and
  delegates to `dexView.js` (hero dex grid), `partyView.js` (free 5-slot party formation), `growthView.js`
  (per-hero level/merge/bond/weapon detail sheet — also exports `openHeroDetail(name)`, reused by
  `dexView.js`).
- `adventureView.js` — the four adventure sub-tabs (별의 길/현상 수배/별자리 탑/꿈의 미궁), the party-HP
  bar, forecast badge, ultimate/speed/hard-mode toggles, and the recommended-growth-table sheet. Exports
  `tickAdventure(store, toast)`, called every 800ms (400ms at 2x speed) by `app.js` regardless of which tab
  is active — idle-battle must progress even off-screen, and a `display:none` page's DOM updates are cheap,
  so no visibility-gating is needed. `renderParty()` splits `state.party` into `.party-back`/`.party-front`
  DOM groups by `slot.row` (front row rendered larger and closer to the enemy, back row smaller/dimmer,
  matching the CSS in `index.html`); each `.unit` carries `data-slot-index` so the attacker picked by
  `GameStore`'s round-robin `attackerIndex` can be found regardless of front/back DOM order. On each tick,
  the attacking unit's lunge distance toward `#enemySprite` is computed via `getBoundingClientRect()` and
  written to the `--lunge-x` CSS custom property (skipped when the adventure tab isn't visible —
  `offsetParent === null` — since rects are meaningless on a `display:none` ancestor); the `unit-attack`
  keyframe animation reads that variable to make the strike actually close the distance to the monster
  instead of just hopping in place. `beginAreaTravel(store)` drives the post-kill area-transition sequence
  (enemy dissolve → faster background scroll → next monster/background swap → resume) — see the side-scroll
  integration doc referenced above for the full timing breakdown.
- `bountyView.js`, `towerView.js`, `labyrinthView.js` — thin content-card UIs for the three new adventure
  modes, calling their respective `GameStore` methods; show locked-state messaging keyed off
  `state.unlocked.*`.
- `summonView.js` — pickup/normal banner tab switching, 1x/10x/bond-pull button wiring.
- `menuView.js` — save/export/import, check-in, monthly event, season track, daily/weekly mission lists,
  and the memory-star exchange shop.
- `cinematic.js` — the gacha reveal → results flow, exporting `pull(count, bannerType)` where `bannerType`
  is `'pickup' | 'normal' | 'bond'` (routes to the matching `GameStore` pull method). Close port of the
  original prototype's `pull`/`revealNext`/`showResults`/`startParticles` functions — same legendary
  video-sync timings (9.1s card reveal, 12.2s advance), same Canvas 2D particle burst (76 particles
  legendary / 34 normal). Don't re-derive this logic from scratch if it needs a tweak — read
  `../plan/index.html`'s original functions of the same name first, since the timings were tuned against
  the actual video asset.

**`src/app.js`** is the composition root: creates the one `GameStore`/`SoundManager`/toast instance, calls
every view's `init...View()`, wires the bottom-nav tab switcher, generic bottom-sheet open/close, the
`#textSizeControl` accessibility toggle, and owns the two timers that must run for the whole session
regardless of which tab is showing: the battle tick (800ms, or 400ms at 2x speed — restarted on the
`battle-speed-changed` window event) and the 5s `checkResets()`/autosave loop (plus `beforeunload`/
`visibilitychange` save hooks). `goToSpiritsParty()` is the cross-tab navigation helper used by the defeat
overlay's and adventure tab's "파티 편성" CTAs.

## Adding a new tab, segment, or domain feature

- **New bottom tab**: add its markup as a new `<section class="page ...">` in `index.html`, add a
  `views/<name>View.js` with `init<Name>View(deps)`/`refresh<Name>View(store)`, wire both into `app.js`
  next to the existing ones, and add the `<button class="nav-btn" data-target="...">` — the tab switcher in
  `app.js` picks up any `data-target` that matches a `data-page` automatically.
- **New segment inside an existing tab** (see `spiritsView.js`'s 도감/편성/성장 or `adventureView.js`'s four
  sub-tabs for the pattern): a `.seg-btn` row toggling `.active` on itself and the matching
  `.segment-panel`, with each panel backed by its own view module.
- **New game rule/number**: add it to `GameStore` as a method, not to a view. Views should read
  `store.state`/`store.battle` for display and call `store.someAction()` for mutation — they should never
  contain gacha/battle formulas themselves. If the new rule changes party composition, hero stats, or
  account level, call `this.recomputePartyStats()` before returning.
- **New static reference data** (a new hero, a new stage): add it to `heroCatalog.js`, not inline in a view.
- **Before designing a new system**: check `../plan/unimplemented-features-design-spec.md` first — it likely
  already made the relevant scope/naming decisions (e.g. currency separation rules, why bond doesn't have
  branching stories, why equipment set effects were cut) and gives the reasoning to extend consistently.

## Assets

`assets/images/` and `assets/video/소환.mp4` are copied from `../images/` and `../plan/assets/` and then
**re-encoded** — the source art is 5–18MB PNG/GIF per file (349MB total for 58 images), which is unusable for
a mobile web build. They were downscaled and converted to JPEG (portraits ≈900px/quality 85, SD icons
≈320px/quality 82, weapon art ≈420px/quality 84), bringing the image set to ~6.8MB. If new source art is
added to `../images/`, re-run the same resize step before copying into `assets/images/` — don't copy
multi-megabyte originals in directly (see `../plan/product-phaser-build.md` §5 for the exact tooling used,
since ImageMagick/Pillow weren't available in the dev environment and a Windows-node.exe + `jimp` workaround
was needed). This pipeline has **not** been extended to WebP/AVIF derivatives or lazy loading — that remains
unimplemented (design spec §12).

`루나리아.gif` (the pickup banner's animated illustration, 17MB) is the one asset kept as-is, unresized —
`heroArtPath()` in `heroCatalog.js` special-cases 루나리아 to point at it instead of the usual JPG, used for
the summon banner, the legendary reveal card, and her results-grid portrait. It was **not** run through the
JPEG re-encode step: this GIF uses per-frame local color tables / delta-encoded frames, and every
compression tool tried in this environment (`jimp`, `gifsicle` — resize, `--lossy`, and even plain
`--colors` re-quantization) corrupted the frame data into visible noise on re-encode (tested by extracting
and viewing individual frames). If a smaller version is ever needed, test any new tool's output by
extracting a middle frame and viewing it before trusting the file size — a gifsicle run can produce a
"successful," playable-looking GIF that is actually pixel garbage past frame 0.

Weapon art has real dedicated images for only 9 of 20 heroes (`WEAPON_OWNERS` in `heroCatalog.js`); the
other 11 fall back to a shared per-rarity representative image via `WEAPON_ART_FALLBACK` — this is a known,
deliberate gap (no new art was commissioned), not a bug.

`assets/images/monsters/` (10 files, ~2.9MB) and `assets/images/backgrounds/` (5 files, ~664KB) are the
side-scroll battle scene's monster/boss portraits and chapter backgrounds — see
`../plan/complete/monster-and-side-scroll-battle-integration.md` for how they were generated and what they
replaced (a single emoji per chapter). The `.enemy img` in `index.html` applies `transform: scaleX(-1)` to
all of them — the generated monster art (most visibly the stage-50 dragon boss) faces right by default,
which reads as looking away from the party (positioned on the left of the battle scene); the CSS flip makes
every monster face left, toward the party, regardless of the source art's original orientation. If new
monster art is added, check whether it still needs the flip or was already authored facing left.

`assets/images/*SD.png` (20 files, one per hero, ~3.7MB total) are the SD/chibi portraits used everywhere
`heroSdImagePath()` is called (battle party units, hero dex grid, party formation slots/picker, growth
list) — they are **transparent PNG**, not JPEG like the rest of the hero art, because the source SD
portraits were flat-color-illustration JPGs with a solid white square baked into every file (JPEG has no
alpha channel), which showed as a visible white box wherever they were composited over the game's dark UI.
They were converted by flood-filling connected near-white pixels **starting from the image border inward**
(not a global white-pixel threshold) so that white pixels enclosed inside a character's art — hair
highlights, sparkle decorations, the drop-shadow ellipse under their feet — are left alone; only the
background actually connected to the edge gets removed, with a short alpha falloff at the cutout edge to
avoid a jagged silhouette. The Windows-node.exe + `jimp` toolchain from the JPEG re-encode pipeline (see
above) was reused for this — there's no Pillow/ImageMagick in the WSL side of this environment. If new SD
art is added with the same white-background problem, the same border flood-fill approach (not a naive
"delete all near-white pixels" filter) is required to avoid eating white details inside the character.
