# Continue EasyArr (resume prompt)

Use this whenever you start a new Claude Code session, switch agents, or lost context.
Paste it as-is — no other explanation needed.

---

You're continuing work on **EasyArr** in this repository. Don't ask me to re-explain the project.

1. Read `CLAUDE.md` and follow its session protocol exactly.
2. Read `PROGRESS.md`, `SPEC.md`, `DECISIONS.md`, and the prompt file of the current phase in `prompts/`.
3. Check the repo state: `git status`, `git log --oneline -15`, open branches/PRs, CI status
   (`gh run list -L 5`). Run the build and tests.
4. Give me a short status report (max ~8 lines):
   - current phase + what's done in it
   - what the last session left unfinished or broken
   - anything waiting on me (tests on my Umbrel, decisions, accounts/tokens)
   - what you'll do next
5. If nothing is waiting on me, continue with the next unfinished task of the current phase without
   waiting for confirmation. If the current phase is done (all "Done when" criteria met and my test
   checklist confirmed in PROGRESS.md), tell me and start the next phase's prompt.
6. End the session as `CLAUDE.md` describes (update PROGRESS.md, commit, push, tell me what to test).

If anything in PROGRESS.md contradicts the code, trust the code, fix PROGRESS.md, and tell me.
