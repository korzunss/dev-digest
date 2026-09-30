# e2e — current gotchas

Last reconciled with ../INSIGHTS.md: 2026-09-30

This is a curated index of rules still in force. Full write-ups live in
[`../INSIGHTS.md`](../INSIGHTS.md) (append-only log). A rule that stops holding
is edited or removed here. Items are added or updated by the
`engineering-insights` skill.

## Flow grammar (agent-browser 0.38)

- **No `click --text`: click with `find text|role … click` (`--exact` for substring clashes) or `click xpath=//…`; assert text as *rendered* (CSS uppercase included); wait for the click target before `find … click`** — spot it: `✗ Element not found: --text`, or a `wait --text` timeout while the text is visibly on screen. The real cause is in the `— stderr:` part of the failed step's line (the runner prints it since plan 15). — [INSIGHTS: 2026-09-30 — correction: the runner now prints agent-browser's stderr](../INSIGHTS.md#2026-09-30--correction-the-runner-now-prints-agent-browsers-stderr-on-a-failed-step-plan-15) (original: [agent-browser 0.38 locator grammar](../INSIGHTS.md#2026-09-30--agent-browser-038-locator-grammar-no-click---text-xpath-prefix-wait---text-sees-css-uppercased-text))

## Local runs and seed data

- **Run the hermetic stack (`./scripts/e2e.sh`), not `npm test` against your own dev DB** — spot it: the suite is green in CI but fails locally on a `wait --text` timeout for the seeded PR, because flows `02/04/05` follow the home redirect to the *first* repo and assume it's the only one, while a dev DB usually holds more. — [INSIGHTS: 2026-09-17 — flows 02/04/05 fail locally but pass in CI](../INSIGHTS.md#2026-09-17--flows-020405-fail-locally-but-pass-in-ci)
- **Never `docker compose down -v` to "fix" a failing local run** — spot it: the urge shows up as "just reset the dev DB" after a local failure; `-v` deletes the `devdigest_pgdata` volume, wiping every repo and review you've imported, not just the seed. — [INSIGHTS: 2026-09-17 — flows 02/04/05 fail locally but pass in CI](../INSIGHTS.md#2026-09-17--flows-020405-fail-locally-but-pass-in-ci)
