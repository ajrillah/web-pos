---
name: stage-done
description: Close out work on the current roadmap stage - verify, tick the checklist, commit, report what remains.
disable-model-invocation: true
---

# Stage done

1. Identify the stage from the branch name (`stage-N-<name>`). If unclear, ask.
2. Run the `verify` skill. If anything fails and cannot be fixed, stop and report.
3. Open `production_checklist.md`. For each unchecked item in this stage, confirm it is implemented and tested. Tick only confirmed items.
4. Check the stage's "Done when" criteria. State whether each is met, with evidence (test names, commands). List criteria that need manual testing for the user; do not tick them.
5. Commit with a Conventional Commit in English, e.g. `feat(stage-N): <summary>` or `chore: update production checklist`.
6. Report:
   - Items ticked in this run.
   - Items still open in this stage.
   - "Done when" status and manual checks the user must perform.
   - Suggested next step.
7. Never merge into `main`, create tags, rebase, or delete branches without explicit approval. Ask.
