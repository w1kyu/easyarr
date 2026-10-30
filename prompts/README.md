# Prompts — how to use them

These prompts build EasyArr phase by phase with Claude Code.

1. Run them **in order**, one phase per Claude Code session (a phase may take several sessions —
   then use `CONTINUE.md` to resume).
2. Paste the prompt file's content into Claude Code (or say: "Follow prompts/04-vpn.md").
3. At the end of each phase Claude gives you a **test checklist** — do it on your Umbrel before
   starting the next phase. Report problems in the next session; Claude logs them in PROGRESS.md.
4. Starting fresh / new agent / lost context? Use `CONTINUE.md`. It needs no explanation from you.

| File | Phase |
|---|---|
| `00-setup.md` | Repos, structure, tooling |
| `01-umbrel-stack.md` | Umbrel app + compose stack |
| `02-dashboard-skeleton.md` | Dashboard skeleton, design system, CI |
| `03-wizard-basics.md` | Wizard steps 1–4 |
| `04-vpn.md` | VPN wrapper, kill switch, VPN wizard step |
| `05-wiring.md` | Wiring engine + service proxy |
| `06-wizard-rest.md` | Wizard steps 6–9 |
| `07-dashboard.md` | Dashboard + settings |
| `08-backup-restore.md` | Backup & restore |
| `09-support.md` | Diagnostics + AI help |
| `10-docs.md` | Documentation |
| `11-release.md` | Release v0.1.0 |
| `CONTINUE.md` | Resume anywhere |
