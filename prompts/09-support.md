# Phase 09 — Diagnostics, redaction, "Get help with AI"

Follow the session protocol in `CLAUDE.md`. Relevant spec: §13, D-016.

## Tasks
1. **Redaction module** (shared, server-side): passwords, API keys, tokens, WireGuard/OpenVPN keys,
   usernames, emails, public IPs, optional private IPs, indexer/provider hostnames → `[REDACTED:type]`.
   Extensive unit tests incl. real-looking samples from each service's logs. Use it in pino logs too.
2. **Diagnostics bundle** `GET /api/diagnostics` (zip) per SPEC §13; collect recent logs per service via
   their APIs where possible plus EasyArr's own logs.
3. **AI help prompt** `GET /api/diagnostics/ai-prompt?context=<step|error>`: template from SPEC §13,
   includes the relevant docs links and a link to `llms.txt`, size cap ~12k chars (trim logs first).
4. **UI**: "Get help with AI" button in Help, on every wizard error screen and the Finish checklist;
   dialog with preview (exactly what gets copied), "What I was trying to do" field, Copy button,
   buttons to open popular AI chats in a new tab; "Download diagnostics" button.
5. **GitHub**: issue templates (bug report asks for the diagnostics zip / AI prompt preview, feature request,
   VPN provider tutorial outdated), `SECURITY.md`, `CONTRIBUTING.md` basics.
6. `docs/getting-help.md` + first version of `docs/troubleshooting.md` from issues seen so far.

## Done when
- Any error → user can copy a redacted, useful AI prompt in two clicks; tests prove no secrets leak.
- PROGRESS.md updated; next = `prompts/10-docs.md`.

## My checklist (owner)
- [ ] Break something on purpose (wrong VPN key) → copy AI prompt → paste into Claude → helpful answer
- [ ] Check the preview: no passwords, keys or my IP
