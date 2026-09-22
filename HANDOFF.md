# Handoff: Drifting Dreams → North Bay Freeway Commute Racer

Paste this whole file into the new chat (or just tell Claude to read it — it's at
`/Users/z3ro/Desktop/Drifting Dreams/HANDOFF.md`). It captures where the project
actually stands and the full new game concept, so the new session doesn't have to
re-derive any of this from scratch.

---

## 1. Repo / deploy facts

- Project root: `/Users/z3ro/Desktop/Drifting Dreams`
- Git repo, remote `https://github.com/anthonymancino2/drifting-dreams.git`, branch `main`
- Live at `https://anthonymancino2.github.io/drifting-dreams/` via classic GitHub Pages
  auto-deploy (no Actions workflow) — a push to `main` goes live in ~1 minute
- Working tree is clean, last commit `ae787a8`, everything already pushed
- Local dev: `python3 -m http.server 8765` from the project root, then open
  `http://localhost:8765` (no build step, no npm install)

## 2. CRITICAL: which code is real

**`index.html` (4.9MB, 1248 lines) is the entire live game.** Everything that's ever
been built, tested, and deployed this project lives in this one file — HTML, CSS, and
a single `<script type="module">` block, plus every 3D vehicle model embedded inline as
base64 GLTF (that's what makes the file huge).

**`src/` is dead scaffolding, NOT the real codebase.** It's an earlier, abandoned
attempt at a modular architecture (`src/core/Game.js`, `src/vehicles/`, `src/camera/`,
etc., ~2600 lines total) dated *before* any of the actual index.html work began. The
`README.md` at the repo root still describes this `src/` structure and is stale —
disregard it. `src/multiplayer/` exists as an empty directory; nothing was ever built
there. `server/` is also empty.

**Do not build on top of `src/`.** Every instruction below assumes `index.html` is the
foundation, exactly as the user's brief requires.

## 3. Existing systems inventory (index.html)

### Vehicle models / assets
- 19 distinct car models total, embedded as base64 GLTF, loaded once at module init
  into `carAssets[0..18]` (plus `treeAsset`/`rockAsset`/`bushAsset` GLTF props used for
  scenery — `rockAsset`/`bushAsset` are loaded but currently unused/unplaced).
- Full roster with per-car stats (`const VEHICLES=[...]`, ~line 493), each
  `{assetIndex, name, tag, speed, accel, handling, topMph}`:

  | idx | name | tag | topMph |
  |---|---|---|---|
  | 0 | Apex GT | Balanced sports coupe | 165 |
  | 1 | Velocity S2 | Lightweight sports car | 180 |
  | 2 | **Interceptor** | **Police-tuned pursuit** | 150 |
  | 3 | City Cab | Taxi | 120 |
  | 4 | Trailblazer | SUV | 130 |
  | 5 | Commuter | Compact | 115 |
  | 6 | Sedan LX | Sedan | 130 |
  | 7 | Nemesis GT | Hypercar | 220 |
  | 8 | Scarlet GT | Supercar | 205 |
  | 9 | Super V12 | Supercar | 210 |
  | 10 | Onyx Supercar | Supercar | 195 |
  | 11 | Street Coupe | Sports coupe | 160 |
  | 12 | Muscle 6.2 | Muscle car | 170 |
  | 13 | Rally Cross | Rally car | 135 |
  | 14 | Armor Unit | Armored SUV | 110 |
  | 15 | Trail Runner | Off-roader | 105 |
  | 16 | **Police Cruiser** | **Police-tuned pursuit** | 150 |
  | 17 | City Runner | Compact | 115 |
  | 18 | Cargo Van | Van | 95 |

  **Two police-tagged models already exist (Interceptor, Police Cruiser)** — reuse
  these directly for the Police System, no new asset needed. Traffic-relevant variety
  (Taxi, SUV, Compact×2, Sedan, Armored SUV, Off-roader, Van) is already decent for
  sedans/compacts/SUVs/vans. **Gap: no pickup truck, no bus, no semi/box truck** — will
  need either new models or a stylized placeholder (e.g. a scaled/stretched Cargo Van
  for a "box truck" traffic category) for Phase 1 truck/bus traffic.
- Current AI roster split (`RACER_ASSETS`/`TRAFFIC_ASSETS`, ~line 529): 7 dedicated
  "racer" models (the higher-performance ones) + 4 dedicated "traffic" models
  (City Cab, Trailblazer, Commuter, Sedan LX), currently spawning 11 racers + 40 traffic
  + player = 52 cars total, all doing full laps of a closed circuit.
- `statMultipliers(v)` gives every vehicle a real, felt difference in accel/handling,
  not just top speed — already tuned and works for both player and AI. Reusable as-is
  for freeway traffic speed variety (a van should accelerate slower than a sports car
  merging into a gap — this already exists).

### Traffic / AI
- `driveAI(c, dt)` — lightweight lane-following-ish logic: looks ahead along the track
  centerline, steers toward a preferred lateral offset, applies corner-cut/drift-bonus
  speed adjustments, does its own wall-clamp collision recovery. Currently built for a
  **closed-loop circuit with a fixed lateral track width**, not discrete freeway lanes —
  this will need real rework for lane-based freeway traffic (see gap notes below).
  It is cheap (a handful of trig calls per car per frame) and already handles 52 cars at
  ~57fps, so the *performance approach* (simple per-car steering, no physics engine) is
  worth preserving even though the lane logic itself needs replacing.
  Details in the exploration deep-dive: `driveAI` at index.html:928; spawn distribution
  `spawnTransform` at index.html:280 (recently reworked to spread traffic evenly around
  a whole lap instead of clustering at the start — same *spirit* of what freeway traffic
  needs, just needs to become lane/segment-based instead of arc-length-around-a-loop).

### Road / track system
- `TRACK_DEFS` (~line 190-ish area, see index.html): each track is
  `{name, desc, theme, trackW, sampleGap, gen:{radiusX,radiusZ,waves,amp,numPoints,elevAmp}}`.
  Geometry is procedurally generated once per track via `buildTougePoints(...)` → a
  `THREE.CatmullRomCurve3` closed loop → sampled into a `SAMPLES[]` array (position,
  tangent, side-vector, cumulative arc length) used by everything else (AI, minimap,
  scenery placement, HUD progress).
  **This is a closed-loop, single-ribbon road model.** A freeway network with branches/
  interchanges/route choice is a fundamentally different topology (a graph of segments,
  not one loop) — this part needs a genuine rebuild, though the *sampling/frame()*
  pattern (arc-length parametrization, tangent/side vectors per sample) is a solid,
  reusable technique to apply to each freeway segment individually.
- 3 existing tracks/themes: cyberpunk city (Neon City Circuit), Japanese mountain rally
  (Sakura Mountain Rally, cherry blossom trees + mountains), sunset GT circuit. Each
  theme drives `THEME_PALETTES` (sky gradient, fog, lighting, road/curb colors) via
  `applyEnvironment(theme)`, and theme-specific scenery via `buildScenery(theme)`
  (buildings/skyline for cyberpunk, mountains+trees for sakura, grandstands for sunset).
  None of these themes are freeway-appropriate as-is, but the *palette-driven
  environment system* (one config object swaps sky/fog/lighting/scenery wholesale) is
  directly reusable for swapping between US-101/SR-37/I-580/etc. visual identities.

### Physics / driving feel
- Arcade, not simulation: `updatePlayer(dt)` does lerp-based accel/steering, a tiered
  handbrake-drift system (charge → commit → tiered blue/purple/gold boost on release),
  wall-clamp collision recovery, auto-boost-after-drift mechanic, nitro.
  **The brief explicitly wants LESS drifting and MORE precise lane-changing** — the
  drift-tier/boost system should likely be de-emphasized or removed from the freeway
  mode; the underlying lerp-based accel/steering/braking foundation is exactly the
  "arcade, forgiving, not twitchy" feel the brief asks for and should be preserved.
- Per-vehicle stat differentiation (accel/handling multipliers) already real for both
  player and AI — reusable directly.

### Controls
- Unified input: keyboard (remappable, `dd_keybinds` in localStorage, `DEFAULT_KEYBINDS`
  + `KEY_ALT` always-on fallback keys), gamepad (remappable, `dd_gpbinds`, standard
  Gamepad API polling in `pollGamepad()`, connect/disconnect handling), touch (6 virtual
  buttons: left/right/gas/brake/drift/camera-cycle).
  A full **Controls & Mapping** settings screen already exists with live rebinding UI
  (`renderBindList()`) — reusable as-is, just needs new actions added if freeway mode
  needs new inputs (e.g. "pull over").
- **Just shipped**: touch buttons are now user-draggable/repositionable (new
  "REARRANGE TOUCH BUTTONS" screen), positions persisted to `localStorage` as
  viewport-fraction coordinates so they survive resize/rotation. Directly reusable.

### Camera
- Three modes cycled via `cycleCamera()` (key `C` / gamepad Triangle / touch cam
  button): Chase, Hood (POV), 360° Orbit (drag to look around manually). Chase camera
  already does smooth lerped follow reacting to speed/turning. This is very close to
  what the brief asks for (POV + third-person, smooth switching) — mostly reusable,
  may want to drop or repurpose the 360° orbit mode for freeway driving.

### HUD
- Speed (mph), gear indicator, lap counter, position (`X/12`), drift score, nitro bar,
  minimap canvas (`drawMap()`, draws the track outline + car dots), camera mode label.
  All DOM-based (not canvas-drawn text), styled via CSS custom properties. The overall
  visual language (cyan/dark HUD chrome) and the "keep secondary info small, prioritize
  speed/position" layout instinct already matches what the brief wants — will need new
  fields (ETA/lateness, money, bad rep, police status, speed limit, navigation/next-exit)
  added following the same visual pattern, not a redesign from zero.

### Mobile / responsive
- `@media (pointer:coarse),(max-width:820px)` switches to touch UI; a `#rotate`
  "please rotate your device" gate for portrait phones exists. Game already targets
  phones/tablets/desktop in one file — no separate mobile build needed, this constraint
  is already satisfied structurally.

### Audio
- **None. Zero audio code exists anywhere in index.html** (confirmed via grep — no
  `AudioContext`, no `<audio>`, no oscillators, nothing). Every audio requirement in the
  brief (engine, wind, tires, horns, siren, UI, ambience) is a from-scratch build.

### Multiplayer
- **None. Zero multiplayer/networking code exists anywhere** (confirmed via grep — no
  WebSocket, no socket.io, no peer/WebRTC references, nothing). The "AI racers" today
  are 100% local simulation, not networked players. Everything in the brief's
  Multiplayer Architecture / Multiplayer Authority sections is a from-scratch build.
  The brief is explicit that this can be *structured* for later network play without
  being fully implemented yet — that's the right scope for now given there's nothing
  to build on top of.

### Code structure / quality note for the new session
- The entire game is **one flat `<script type="module">` block** — no classes, no
  sub-files, just top-level `const`/`function` declarations and heavy reliance on
  closures over shared `let` bindings (a pattern used deliberately several times this
  project to solve load-order issues — e.g. reassigning `points`/`curve`/`trackLength`
  in place when switching tracks so every function referencing them by name picks up
  the new values automatically).
- The brief asks for genuine modular classes (`TrafficManager`, `PoliceManager`,
  `RoadNetwork`, etc.) and a central `GAME_CONFIG` tuning object. **Recommendation for
  the new session to evaluate**: since the file already uses
  `<script type="module">`, it can be split into real separate `.js` files using native
  ES module `import`/`export` — GitHub Pages serves static files fine, so this needs no
  build step and preserves the "no install, just open it" property while actually
  getting the modularity the brief wants. This is a call worth confirming with the user
  before doing it, since it's a meaningful structural change to how the project is
  authored (many small files vs. one file) — but it directly satisfies both the
  "keep it deployable with zero build step" constraint and the "modular classes,
  centralized config" ask.

## 4. What's clean / already deployed this session (context, not action items)

Recent work already shipped and live: track scale-up + two new themed tracks (rally/
sunset), 32→52 car AI field with traffic spread across the whole lap instead of
clustering at the start, dark-thumbnail fix, real per-vehicle accel/handling physics,
draggable touch control layout. None of this is broken — it's the most recent state of
the drift-racing game this is pivoting away from.

---

## 5. THE NEW GAME CONCEPT (verbatim brief from the user)

Everything below is the user's own words, unedited, and is the authoritative design
spec for the pivot. Treat it as such.

> ## Change of complete plan
>
> I want to significantly change the direction of my EXISTING HTML racing game.
>
> **IMPORTANT: DO NOT rebuild the project from scratch. Use the CURRENT GAME as the
> foundation.**
>
> Before changing anything:
> 1. Inspect the existing project structure.
> 2. Identify the current: vehicle models, traffic car models, player vehicle assets,
>    environment assets, road system, physics, controls, HUD, mobile controls,
>    keyboard controls, controller support, camera system, audio, multiplayer-related
>    code.
> 3. Preserve working systems whenever possible.
> 4. Reuse ALL of the current car models and useful assets.
> 5. Refactor or replace systems only where necessary for this new game concept.
> 6. Do not remove working features unless they directly conflict with this design.
> 7. Keep the project optimized for: iPhone 13 Pro, modern smartphones, tablets,
>    desktop browsers.
>
> ### Game concept
>
> The game is now primarily a **FREEWAY TRAFFIC RACING GAME**.
>
> Premise: the player's character overslept and is late for work. They must drive
> through freeway traffic as quickly as possible without being excessively late. The
> race starts manageable and escalates: open freeway → light → moderate → heavy commute
> → extremely heavy → near-gridlock, plus lane merging, slow vehicles, trucks, buses,
> bottlenecks, police.
>
> The feeling: **"OH NO. I'M LATE FOR WORK."** Fun, slightly chaotic, arcade-like,
> competitive, easy to understand. **DO NOT make this a realistic driving simulator —
> this is an ARCADE TRAFFIC RACER.**
>
> Think: easy controls + high-speed freeway traffic + weaving through cars + risk vs.
> reward + racing other players + trying not to hit innocent traffic + trying not to
> attract police + trying to get to work before everyone else.
>
> ### North Bay California freeway map
>
> Base the world on North Bay Area freeways — **not** a 1:1 recreation. A compressed,
> stylized, believable network, real geography as inspiration only.
>
> **US-101** — main north/south backbone. San Rafael → Novato → Petaluma → Rohnert
> Park → Santa Rosa. Largest/fastest section: 3-5 lanes, long straights, sweeping
> curves, HOV-style lanes, frequent entrances, large interchanges, heavier traffic near
> populated areas, faster between cities.
>
> **SR-37** — connects US-101 side toward Vallejo/I-80. Narrower, marsh/wetland
> environment, long straights, few exits, bottlenecks, lane reductions, high-risk
> passing. Best location for HEAVY/SUPER HEAVY traffic modes.
>
> **I-580** — Richmond–San Rafael bridge inspiration. Large bridge/freeway section,
> water views, strong sense of speed, long sweeping bridge, merging near US-101,
> potential toll-area, dramatic multiplayer racing location.
>
> **I-80** — Vallejo/Cordelia/Fairfield. Wide freeway, higher average speeds, many
> lanes, trucks, large interchanges, dense traffic, good for six-player races.
>
> **I-680** — eastern connection. Wide, hills, sweeping turns, high-speed sections,
> large interchange with I-80.
>
> **I-780** — Vallejo/Benicia alternate route. Shorter, hills, curves, potentially lower
> traffic than I-80.
>
> ### Map design
>
> Do NOT create hundreds of miles of real freeway — compress the geography so the
> player *feels* like they're traveling through the North Bay without real-world
> distances. Rough topology:
>
> ```
> US-101
>    |
> San Rafael
>    |
> Novato
>    |\
>    | \ SR-37 ---------------- Vallejo
>    |                            |
> Petaluma                       I-80
>    |                            |
> Rohnert Park                 Cordelia
>    |                          /     \
> Santa Rosa                 I-680   I-80
>                               |
>                             Benicia
>                               |
>                             I-780
> ```
>
> I-580 connects into the San Rafael/US-101 section from the east via a large bridge
> section. This creates a **connected network, not a single racetrack** — players hit
> freeway splits and choose different routes. Some routes are shorter-but-more-congested,
> others longer-but-faster. **Route choice must matter** — this is extremely important,
> the player should not simply follow one road.
>
> ### Race structure
>
> Support 1 to 6 human players — competitive multiplayer, all racers trying to reach
> the destination first. Track: position, distance remaining, ETA, points, money, bad
> reputation, police status, current speed, current speed limit.
>
> Finishing first should **not** necessarily mean driving best — track **RACE POSITION**
> and **DRIVER SCORE** separately, so someone can arrive first with a terrible driving
> reputation from smashing through traffic the whole way.
>
> ### The clock
>
> Player is already late when the race starts. Give an arrival goal, e.g.:
> ```
> WORK STARTS: 8:00 AM
> CURRENT TIME: 7:47 AM
> ESTIMATED NORMAL COMMUTE: 22 MINUTES
> ```
> HUD should make lateness pressure obvious, e.g. `WORK STARTS 8:00 / CURRENT TIME
> 7:52 / ETA 8:06 / 6 MIN LATE`, dynamically updating as the player gains/loses time.
>
> ### Traffic options (pre-race select)
>
> NO TRAFFIC (empty, for learning/testing/pure racing), LIGHT (plenty of openings,
> occasional weaving), MEDIUM (normal commuter, frequent lane changes), HEAVY (small
> gaps, slower traffic, frequent braking, merging matters), SUPER HEAVY (near-gridlock
> in *sections*, not the whole race — must find gaps/change lanes/take alternate
> routes/use exits intelligently), MIXED (**the most interesting mode** — density
> dynamically changes through the race, geographically believable, e.g. open →
> light → medium → heavy → gridlock → open again; a rural 101 section relatively
> open, an interchange heavily congested, SR-37 suddenly gridlocked from a lane
> reduction, I-80 high volume but still moving).
>
> ### Traffic vehicles
>
> Use existing vehicle assets. Non-player cars become traffic: sedans, compacts, SUVs,
> pickups, vans, sports cars, delivery vans, box trucks, semi trucks (use existing
> models where they support these categories). Randomize model/color/speed/lane/
> following distance, but traffic must stay **predictable enough to be fun** — no
> randomly slamming into the player, traffic should behave like normal drivers.
>
> ### Traffic AI
>
> Maintain lanes, reasonable following distance, occasional lane changes, slow when
> traffic ahead slows, accelerate when road opens, merge at entrances, allow traffic
> waves to develop, react when blocked. **Avoid extremely expensive AI** — lightweight
> lane-following logic, since there may be many vehicles at once. Performance is
> critical: object pooling, distance-based simulation, LOD, simplified collision for
> distant traffic, despawning/recycling.
>
> ### Collision penalty (configurable constants required)
>
> Every time a human player hits a non-player traffic vehicle: **-1 score, +1 bad
> reputation**, at minimum. Example config names: `TRAFFIC_HIT_SCORE_PENALTY = 1`,
> `TRAFFIC_HIT_BAD_REP = 1`. Do not penalize the innocent traffic vehicle. Do not treat
> wall scrapes the same as hitting innocent traffic.
>
> ### Bad reputation system
>
> A "BAD REP" meter (e.g. `0/10`), rises with traffic collisions. Configurable
> thresholds, e.g.: 0-2 Normal, 3-4 Reckless, 5-7 Police Attention, 8+ High Police
> Attention. These exact numbers must be config values.
>
> ### Police system
>
> Police must **NOT** simply chase every fast car map-wide — they need real detection:
> limited detection distance, field of view, line-of-sight where practical, patrol vs.
> pursuit state. Once bad reputation crosses a threshold, police AI *can* start
> appearing (patrolling/in traffic). A debug mode should optionally visualize the
> detection cone/radius. Outside detection range, the player is simply not detected.
>
> ### Speed limit system
>
> Different freeway areas have posted (believable, not simulator-precise) speed
> limits. HUD shows `SPEED` and `SPEED LIMIT`. Police do **not** chase purely from bad
> reputation — bad reputation makes police *appear*; **then**, if the player is within
> detection range **and** sufficiently over the speed limit, the officer detects them
> and pursuit begins.
>
> ### Police pursuit
>
> HUD shows `POLICE PURSUIT`. Officer follows the player's lane changes/route.
> No supernatural acceleration/grip — challenging but escapable. Player choices:
> **PULL OVER** or **RUN**.
>
> **Pull over**: explicit control, player slows + moves to shoulder + stops, then a
> short (not overly long — this is an arcade racer) penalty screen, e.g.:
> `SPEEDING 87 MPH IN 65 MPH ZONE / FINE: $250 / TIME LOST: 15 SEC / PAY FINE AND
> CONTINUE`. Values configurable.
>
> ### Player money
>
> Starts with money (e.g. `STARTING_MONEY = 1000`, configurable). Used for fines. If
> pulled over and enough money exists, fine is deducted, player waits out the penalty,
> race resumes.
>
> **Running out of money**: if pulled over and unable to pay the fine, **that player's
> race ends** (fun message, e.g. "CAN'T PAY THE TICKET / YOU'RE NOT MAKING IT TO WORK
> TODAY / RACE OVER"). Other multiplayer racers **continue** — one elimination must
> never end the whole race.
>
> ### Running from police
>
> If the player doesn't pull over, pursuit continues; escape via distance, freeway
> splits, traffic, route changes. **No weapons, no combat** — the challenge is purely
> driving. Losing police long enough → `ESCAPED`, commute continues. Optionally raise
> bad reputation for successful flight (configurable).
>
> ### Player-to-player collisions
>
> No innocent-traffic -1 score penalty for player-vs-player contact. Use reasonable
> arcade collision physics, but prevent bumper-car abuse — if intentional ramming
> becomes a problem, a configurable multiplayer contact penalty system can be added
> later. Not the primary mechanic.
>
> ### Camera system
>
> Support both **first-person/POV** and **third-person**.
>
> **First person**: convincing sense of speed — driver/cockpit, hood, or windshield
> camera depending on what the current models support. Don't render interior geometry
> that doesn't exist; if no interiors exist, use a clean hood/bumper POV.
>
> **Third person**: player must clearly see their vehicle — a **real 3D model**, not a
> sprite/billboard, visible from different angles via a smooth chase camera that
> responds naturally to speed/turning/lane changes/braking/acceleration/collisions
> (not stiff). Keep the existing vehicle assets.
>
> **Switching**: keyboard `C`, mapped controller button, mobile camera icon — POV ↔
> third-person, immediate or very short smooth interpolation.
>
> ### Arcade handling
>
> Not realistic sim physics. Easy to learn, responsive, forgiving, fun. Challenge comes
> from traffic/speed/route choice/other players/police/time pressure, not the driving
> mechanics themselves. Cars should feel planted with weight transfer, braking,
> acceleration, steering response, minor high-speed sliding — **avoid excessive
> drifting, this is no longer primarily a drifting game**.
>
> ### Lane changing
>
> One of the most important actions — must feel excellent. Smooth, controllable
> steering at freeway speed. Avoid oversteer, twitchy steering, instant rotation, spins
> during simple lane changes. Player should confidently weave between traffic.
>
> ### Nitro/boost
>
> If it already works, preserve it, but balance it for traffic — boosting through heavy
> traffic should be dangerous, boost must never be invincibility.
>
> ### Freeway interchanges
>
> Splits create strategic choices with enough advance warning to choose a route, via
> large overhead California-inspired freeway signs (gameplay-first, not pixel-accurate
> real signage), e.g. `US 101 NORTH SANTA ROSA` / `37 EAST VALLEJO` / `580 EAST
> RICHMOND` / `80 EAST FAIRFIELD` / `680 SOUTH BENICIA`.
>
> ### Dynamic routing
>
> Some races offer multiple routes, e.g. `ROUTE A: 10.2 MILES, HEAVY TRAFFIC` vs.
> `ROUTE B: 12.8 MILES, LIGHT TRAFFIC`. Players choose shorter-distance vs.
> higher-average-speed. **Do not tell the player which route will always be faster** —
> traffic should create genuine uncertainty.
>
> ### Navigation
>
> Simple freeway navigation, not a complicated GPS map: distance-to-exit, large
> arrows, freeway signs, route indicator, minimap if already supported. E.g.
> `KEEP LEFT / US-101 NORTH / NEXT SPLIT 0.7 MI`.
>
> ### Starting locations / destinations
>
> Several freeway starting regions (San Rafael, Novato, Petaluma, Santa Rosa, Vallejo,
> Fairfield start) — no detailed city streets, can start near an on-ramp or already on
> the freeway. Destinations near freeway exits (Downtown Office, Tech Campus, Warehouse,
> Factory, Hospital, Construction Site, Airport Job, Retail Job) — no detailed
> workplace interiors: exit freeway → short approach road → finish zone.
>
> ### Race variety
>
> Short commute (~3-5 min game time), Normal (~6-10 min), Long (~10-15 min) — game
> time, not real North Bay travel time.
>
> ### Multiplayer HUD / player identification
>
> Compact racer list, e.g. `1 ALEX 2.4 MI / 2 YOU 2.6 MI / 3 MIKE 2.8 MI / 4 JAY
> 3.1 MI` — must not cover the driving view. Subtle per-player indicators (name above
> vehicle, small colored marker, position number) — no clutter. Traffic vehicles must
> never look like human racers.
>
> ### HUD
>
> Preserve the best parts of the existing HUD direction. Priority info: current speed,
> speed limit, position, time, ETA, points, money, bad rep, police status, navigation,
> distance to destination. Secondary info smaller. Example layout:
> ```
>                 WORK: 8:00 AM
>                 ETA: 8:07 AM
>                 7 MIN LATE
>
> 2 / 6
>
> NEXT:
> 37 EAST
> 0.8 MI
>
>
>                      82
>                     MPH
>
>                   LIMIT 65
>
>
> SCORE 12
>
> $750
>
> BAD REP
> ████░░░░░░
> ```
>
> ### Traffic density + performance
>
> May need a lot of traffic — do not spawn hundreds of full-detail Three.js vehicles
> at once. Object pooling, LOD (near = full model, medium = lower complexity, far =
> very simplified/aggressive LOD), recycle cars far behind the player, only fully
> simulate traffic relevant to the player's current freeway region.
>
> ### Multiplayer traffic
>
> Do **not** independently generate different traffic per multiplayer user — racers
> together must encounter approximately the same traffic; if Player A sees a truck
> blocking lane 2, Player B must see it too. Design traffic to be deterministic or
> synchronized enough for this; one player must never drive through a car that only
> exists on another player's screen.
>
> ### Multiplayer authority
>
> Architect so one authority controls traffic state, race state, police state, player
> positions, collision validation. If full backend multiplayer isn't implemented yet,
> structure the code so it can be added cleanly later. Do not fake multiplayer AI and
> call it finished online multiplayer — clearly separate local/single-player code from
> real network multiplayer code.
>
> ### Police in multiplayer
>
> Police target individual players based on their own bad rep/detection state (e.g.
> Player 1: bad rep 7, pursued; Player 2: bad rep 1, not pursued) — never chase every
> racer because one person drove badly. Multiple police should eventually be possible
> if several users have high bad reputation.
>
> ### Traffic collision ownership
>
> Only penalize the player actually responsible for hitting a traffic vehicle — avoid
> Player A hitting traffic that then gets pushed into Player B, with B unfairly
> penalized. Reasonable impact attribution required.
>
> ### Sound
>
> Use/improve current audio system (**note: none currently exists, see inventory
> above — this is 100% new work**). Needed: engine RPM, wind at high speed, tire
> noise, traffic, horns, semi trucks, collision impacts, police siren, police
> radio-style notification, UI warnings, freeway ambience. Increase wind/road noise at
> high speed for a stronger sense of speed.
>
> ### Environments
>
> Northern-California-inspired, not photorealistic: US-101 (trees, rolling hills,
> urban/suburban freeway, sound walls, business areas), SR-37 (marshland, water, low
> open landscape, distant hills), I-580 (large bridge, bay, industrial shoreline, city
> views), I-80 (wide freeway, larger interchanges, commercial areas, rolling terrain),
> I-680 (hills, open terrain, large freeway structures). Don't waste performance on
> detailed cities — road/traffic/cars/gameplay come first.
>
> ### Weather / time
>
> Structure for future morning/sunrise/day/evening/night/rain/fog, but the first
> working version should focus purely on **morning commute** (fits the "overslept,
> late for work" premise).
>
> ### Game start presentation
>
> Give it personality but keep it short: black screen, phone alarm sound, "7:42 AM",
> "OH NO." / "WORK STARTS AT 8.", then START ENGINE → quickly into the race. No long
> cinematic — start driving fast.
>
> ### Result screen
>
> Show both arrival performance and driving quality, e.g.:
> ```
> YOU MADE IT!
> ARRIVAL: 8:04 AM
> 4 MINUTES LATE
> FINISH: 2ND / 6
> SCORE: 17
> TRAFFIC CARS HIT: 3
> BAD REP: 4
> POLICE STOPS: 1
> FINES: $250
> MONEY REMAINING: $750
> ```
> Optionally a fun driving-style label (Careful Commuter / Aggressive Commuter / Road
> Menace / Police Magnet) that's flavor only, doesn't silently alter core scoring.
>
> ### Build order (explicit phase plan from the user)
>
> 1. One excellent freeway section: player vehicle + traffic + camera + lane changing +
>    collision penalties.
> 2. Traffic density settings.
> 3. Connected freeway sections + interchanges.
> 4. Bad reputation.
> 5. Police.
> 6. Money/fines/pull-over mechanics.
> 7. Race structure + commute timer.
> 8. Multiplayer architecture/synchronization.
> 9. Environmental polish.
>
> **"Do NOT attempt to implement everything poorly at once."**
>
> ### Most important development rule (user's own words)
>
> "I want QUALITY OVER QUANTITY. Do not create five mediocre freeway areas before one
> freeway area feels good. Start with US-101 STYLE FREEWAY. Build: player vehicle,
> traffic, POV camera, third-person camera, smooth lane changing, traffic collisions,
> score penalty, bad reputation, performance optimization. Make THAT FUN FIRST. Once
> the core driving loop feels good, expand into the North Bay freeway network."
>
> ### Use existing assets (repeated emphasis)
>
> Before downloading/generating/replacing anything, use the existing player cars,
> traffic cars, 3D vehicle models, road assets, environment objects, sounds (none
> exist — build these), HUD elements, controls, camera code, mobile UI, controller
> code. This is an **evolution** of the current project, not a brand-new game.
>
> ### Code quality
>
> Modular classes/modules, e.g. `TrafficManager`, `TrafficVehicle`, `RoadNetwork`,
> `FreewaySegment`, `InterchangeManager`, `RaceManager`, `PlayerVehicle`,
> `PoliceManager`, `PoliceVehicle`, `ReputationManager`, `FineSystem`, `MoneyManager`,
> `NavigationManager`, `CameraManager`, `MultiplayerManager`. Avoid one enormous update
> loop containing the entire game. Centralize tuning variables, e.g.:
> ```js
> GAME_CONFIG = {
>   traffic: {...},
>   police: {...},
>   reputation: {...},
>   fines: {...},
>   camera: {...},
>   vehicle: {...},
>   race: {...}
> }
> ```
> This matters so values can be tuned later without hunting through thousands of lines.
>
> ### Debug tools
>
> A toggleable debug panel to change: traffic level, traffic count, player speed, bad
> reputation, starting money, police spawn, police detection radius, speed limit, race
> timer, camera mode. Optionally visualize: traffic lanes, AI paths, police detection
> areas, traffic spawn/despawn zones, freeway nodes, interchange paths.
>
> ### Final design goal (the target feeling, user's own examples)
>
> "I'm already 8 minutes late." / "I can still make up time." / "Traffic is opening
> up." / "OH NO, GRIDLOCK." / "Take 37 or stay on 101?" / "There's a gap!" / "GO GO
> GO." / "I HIT THAT CAR." / "My bad rep is getting high." / "There's a cop." / "I'm
> doing 92." / "Slow down." / "Never mind, he saw me." / "Do I pull over or run?" /
> "I only have $180 left." / "If I get another ticket I'm done." / "My friend is right
> behind me." / "He's taking the other freeway." / "I HAVE TO BEAT HIM TO WORK."
>
> "THAT is the game. It should feel like a frantic California morning commute turned
> into a fun arcade racing game."
>
> ### First task (explicit process, do this before writing code)
>
> 1. Inspect the current game. *(done — section 3 of this handoff)*
> 2. Explain which existing systems/assets can be reused.
> 3. Identify what needs modification.
> 4. Identify what needs to be newly built.
> 5. Create the proposed North Bay freeway network architecture.
> 6. Show the implementation plan.
> 7. **Then** begin modifying the existing game.
>
> Work directly from the latest version of the current project (`index.html`) and
> preserve existing working assets and systems.

---

## 6. What the new session should do first

Steps 2-6 of the user's own "First task" list above are **not yet done** — this
handoff only completes step 1 (inspection). The new session should pick up at step 2:
turn the inventory in section 3 into an explicit reuse/modify/build-new breakdown,
propose the freeway network architecture (segment graph + interchange design,
probably reusing the existing `SAMPLES[]`/arc-length-frame pattern per segment), and
present the phased implementation plan back to the user for approval — **before**
touching `index.html`. The user was explicit and repeated multiple times: inspect,
explain, plan, then implement, in that order, and build ONE freeway section
excellently before expanding to the network.
