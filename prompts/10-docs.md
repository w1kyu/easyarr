# Phase 10 — Documentation, llms.txt, in-app docs polish

Follow the session protocol in `CLAUDE.md`. Relevant spec: §16. Audience: complete beginners.

## Tasks
1. Write or finish every doc in SPEC §16. Style: short sentences, numbered steps, one action per step,
   "What you'll need" boxes, screenshots (taken from the dev stack; store under `docs/images/`).
   Don't duplicate content — link instead.
2. **README.md**: what EasyArr is, screenshot/GIF, features, "Install in 3 steps", supported hardware,
   VPN note, links to docs, legal note, license, credits to the upstream projects.
3. `docs/how-it-works.md`: every service explained in one paragraph with a simple diagram.
4. `docs/family-accounts.md`, `docs/remote-access-tailscale.md`, `docs/faq.md`, `docs/troubleshooting.md`.
5. Dev docs: `docs/dev/architecture.md` (diagram, data flow, wiring, VPN wrapper), `development.md`,
   `release.md`.
6. **llms.txt** generator (CI): all user docs concatenated with headings + a short system description;
   published at a stable raw GitHub URL used by the AI help prompt.
7. In-app docs viewer polish: navigation, search, images, deep links from "What's this?".
8. CI: Markdown lint + link checker.
9. Read-through pass: every wizard text and doc checked for jargon; add one-line explanations.

## Done when
- A beginner can install and set up EasyArr using only the docs.
- PROGRESS.md updated; next = `prompts/11-release.md`.

## My checklist (owner)
- [ ] Read the README as if I'd never heard of EasyArr
- [ ] Follow getting-started without my own knowledge
- [ ] Let a non-technical friend try (if possible) and note where they get stuck
