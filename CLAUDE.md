# Project notes for Claude

- **Auto-push authorized**: the user has asked to auto-push commits to `main` in this repo going forward — do not stop to ask for push confirmation on ordinary commits here. Still use judgment on genuinely risky/destructive git operations (force-push, history rewrite, etc.), which remain out of scope for this blanket authorization.
- Deploy is classic GitHub Pages auto-deploy on push to `main` (no Actions workflow) — a push goes live at https://anthonymancino2.github.io/drifting-dreams/ in ~1 minute.
- See `/Users/z3ro/.claude/plans/wild-drifting-raccoon.md` for the phase-1 freeway-pivot implementation plan (architecture, `GAME_CONFIG` shape, build order) if picking this project back up.
