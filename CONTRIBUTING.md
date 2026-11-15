# Contributing to EasyArr

Thanks for helping! EasyArr is a beginner-friendly Umbrel app, so every change is judged by one
question first: **can someone who has never used a terminal still use it?**

## Ways to help

- **Report a bug or an outdated VPN guide**: open an issue with one of the templates. Attach the
  diagnostics file (EasyArr → Help → Download diagnostics).
- **Improve the docs**: everything in `docs/` is shown inside the app too. Short sentences, one
  action per step.
- **Code**: pick an issue, or open one first for bigger changes so we can agree on the approach.

## Set up the project

You need Node 26 (see `.nvmrc`) and pnpm 12. Docker is only needed for the full stack test.

```sh
pnpm install
pnpm dev          # dashboard (web + server) with hot reload
pnpm lint         # eslint + prettier + vendored-code check + llms.txt check
pnpm typecheck
pnpm test         # unit tests
pnpm build
pnpm test:e2e     # Playwright (after pnpm build)
```

More detail, including testing on a real Umbrel: [docs/dev/development.md](docs/dev/development.md).

## Rules that keep EasyArr safe and simple

These come from [CLAUDE.md](CLAUDE.md) and [SPEC.md](SPEC.md):

- No feature may need a terminal for end users.
- The VPN kill switch must never leak. Changes to `vpn/` need the leak test.
- The wiring never overwrites what users changed in the apps.
- No Docker socket, no privileged containers (Gluetun's `NET_ADMIN` + `/dev/net/tun` only).
- Secrets never appear in logs, commits, test fixtures or diagnostics. Redaction is unit-tested;
  add a test when you log something new.
- All user-facing text goes through i18n keys in `dashboard/web/src/locales/en.json`.
- Everything must work on linux/amd64 and linux/arm64.
- Code from umbrelOS may only live in `dashboard/web/src/vendor/umbrel/` under the rules in
  SPEC §14.1. Never copy Umbrel's logo or brand marks.

## Commits and pull requests

- Small commits with [Conventional Commits](https://www.conventionalcommits.org/) messages
  (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`).
- New logic comes with tests.
- Non-trivial decisions go into `DECISIONS.md`.
- CI must be green.

By contributing you agree that your contribution is licensed under the [MIT license](LICENSE).
