# Drifting Dreams

A browser-based arcade drift racing game built with Three.js / WebGL — no build step, no install. Open `index.html` (served over HTTP) and drive.

**Play it live:** see the GitHub Pages link at the top of the repo (Settings → Pages), or run locally:

```bash
python3 -m http.server 8765
# then open http://localhost:8765
```

## Status: Phase 1 — Core Playable Prototype

- Arcade vehicle physics (acceleration, braking, reverse, steering, drifting with tiered blue/purple/gold drift-boost)
- One full circuit (Dream Valley Circuit) with checkpoints, sequential lap counting, off-road/out-of-bounds detection, and respawn
- Day/night lighting toggle (click the sun/moon icon, top-left, or press `N`)
- Chase camera and POV camera (`C` to switch)
- Unified input system: keyboard (WASD/arrows), touch (virtual joystick + buttons), and gamepad (PS4/PS5/Xbox/Switch Pro/generic — standard Gamepad API mapping) all drive the same `InputActions` — see `src/input/`
- Procedural drift smoke/spark particle effects, procedural engine/drift audio (Web Audio API, no sample files yet)
- Debug overlay (`F3`) with FPS, physics state, and live gamepad diagnostics

## Controls

| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Steer | A/D or ←/→ | Left stick | Virtual joystick |
| Accelerate | W / ↑ | R2 | GAS |
| Brake / Reverse | S / ↓ | L2 | BRAKE |
| Drift | Space | Cross/A | DRIFT |
| Boost | Shift | Circle/B | BOOST |
| Camera | C | Triangle/Y | CAM |
| Respawn | R | D-Pad Down (hold) | — |
| Pause | Esc | Options/Start | — |

## Project layout

See `src/` — modular by system (`core`, `input`, `vehicles`, `camera`, `race`, `tracks`, `effects`, `audio`, `ui`). Full architecture and design brief tracked in project history; upcoming phases: AI racers, the full 12-vehicle roster, additional track styles, day/night-aware power-ups with rubber-band drop rates, an infinite-drive traffic mode, and multiplayer.
