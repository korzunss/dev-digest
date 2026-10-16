import type { WorkflowCase } from "../src/index.js";

/**
 * Systemic ("workflow") tier — asserts the real on-disk harness (CLAUDE.md + nested package
 * AGENTS.md + skills + subagents, loaded via settingSources:["project"]) behaves as documented.
 * Organized by scenario, not by a single artifact, because these behaviors are cross-cutting.
 *
 * Budget: 9 Claude sessions per run (run with the repeat default, -n 2).
 *   - 8 × trace (one is the engineering-insights near-miss negative) = 8
 *   - 1 × activation (engineering-insights positive)                 = 1
 *
 * `trace` folds several assertions into ONE session and stops early once every positive
 * expectation holds (or a negative one is violated). Merging rules: only positives that do not
 * compete go together, each behind its own numbered question whose answer cannot be guessed
 * without the file; a positive and its negative, a skill activation, or a dispatch never share a
 * session with anything else. Merged reads are flakier than single ones — read the failure
 * message (`X not read | reads: …`) to see which question was skipped.
 *
 * Nested `client/CLAUDE.md` / `server/CLAUDE.md` are auto-loaded when the agent touches a file in
 * that folder; that load is not a Read call, so it never shows in the trace. The cases below prove
 * the load indirectly: each expects a file that only the nested AGENTS.md routes to.
 */
export const cases: WorkflowCase[] = [
  // --- trace (1 session): server package — nested AGENTS.md routing + session protocol ---------
  {
    kind: "trace",
    // Each question must be unanswerable from the always-loaded docs, or the model answers from
    // them and never opens the file (wf-gotchas-n5: 1/5 — the GITLAB_TOKEN@<host> key and the
    // contract-first rule are written verbatim in server/AGENTS.md, gotchas.md and CLAUDE.md).
    // Q1 is only in the code of adapters/secrets/local.ts; Q2 only in the repo-intel README,
    // which only server/AGENTS.md routes to ("за документацією модуля" is needed: without it the
    // model answers Q2 from service.ts). Gotchas = session protocol.
    // Known signal, not flakiness: the routing reads hold every run, but server/insights/gotchas.md
    // is skipped in about half of them (code-level questions send the model straight to code), even
    // after the gotchas-first line at the top of server/AGENTS.md. A red run here usually means
    // that, so check the failure message before touching the case.
    name: "server task follows the protocol and the routing in server/AGENTS.md",
    prompt:
      "Два питання по server/ цього репо, файли не редагуй — відповідай з посиланнями на файли й рядки:\n" +
      "1. Що робить провайдер секретів, якщо файл секретів відсутній або в ньому зіпсований JSON? " +
      "І чи перечитує він файл при кожному запиті ключа?\n" +
      "2. За документацією модуля repo-intel: які методи фасаду підключені в стартовій версії, " +
      "у якому файлі, і якими прапорцями це вмикається?",
    expectFilesRead: [
      "server/insights/gotchas.md",
      "server/src/adapters/secrets/local.ts",
      "server/src/modules/repo-intel/README.md",
    ],
    expectNotRead: ["server/clones/"],
    maxTurns: 20,
  },

  // --- trace (1 session): client package — nested AGENTS.md (next-intl) + session protocol ------
  {
    kind: "trace",
    // The root CLAUDE.md says nothing about next-intl; only client/AGENTS.md puts UI strings in
    // messages/en/<namespace>.json. Opening AgentCard is what loads client/CLAUDE.md.
    name: "client UI-string task reads AgentCard, then the next-intl messages per client/AGENTS.md",
    // The data side is ruled out on purpose: "Last run" sent the model hunting for a last-run
    // field through server contracts and the DB schema until it ran out of turns.
    prompt:
      "У клієнті хочу додати в картку агента (AgentCard) статичний підпис \"Last run\" поруч зі статусом. " +
      "Дані для поля вже є і в картку приходять — бекенд, контракти й БД не шукай. Мене цікавить лише " +
      "текст підпису: де за конвенціями client/ має лежати цей рядок і як його підключити в компоненті. " +
      "Файли не редагуй, покажи, які саме файли й рядки треба змінити.",
    expectFilesRead: [
      "client/insights/gotchas.md",
      "client/src/app/agents/_components/AgentCard/",
      "client/messages/en/",
    ],
    // 15 was too tight: the model reads the whole AgentCard folder first, and both wf-v3 runs hit
    // the cap at 16 turns before reaching the second expected file.
    maxTurns: 25,
  },

  // --- trace (1 session): root CLAUDE.md "Read on demand" routing, three rows -------------------
  {
    kind: "trace",
    name: "root CLAUDE.md routes test strategy, approved plans and a symbol lookup",
    prompt:
      "Три короткі питання по цьому репо, файли не редагуй:\n" +
      "1. Як має називатися і куди класти тест, якому потрібен Postgres, і в якому CI-job він піде? " +
      "Відповідай за документацією стратегії тестування.\n" +
      "2. Які Development Plans уже є і в якому вони статусі? Візьми з індексу планів.\n" +
      "3. Відкрий файл, де визначено функцію `groundFindings`, і процитуй її сигнатуру.",
    expectFilesRead: ["TESTING.md", "docs/plans/README.md"],
    // Q3 checks the search, not a Read: CLAUDE.md says server/clones/ holds full copies of this repo
    // and must be excluded. Finding the symbol and quoting it straight from Grep output is correct,
    // so reviewer-core/src/grounding.ts is not a required read (wf-sandbox run 1 failed only on it).
    expectNotRead: ["server/clones/"],
    maxTurns: 15,
  },

  // --- trace (1 session): reviewer-core — deep-dive routing + gotchas lookup --------------------
  {
    kind: "trace",
    // Was two sessions (pipeline.md, gotchas.md). The prompt names both needs explicitly so
    // neither read can be skipped as "already answered".
    name: "reviewer-core task reads pipeline.md and reviewer-core gotchas",
    prompt:
      "Я збираюся змінити review pipeline у reviewer-core і вже стикнувся там з несподіваною поведінкою. " +
      "Перш ніж торкатися коду: 1) прочитай документацію, яку настанови репо (CLAUDE.md) " +
      "вимагають для змін у pipeline; 2) перевір, де в reviewer-core вже задокументовані підводні камені, " +
      "і прочитай той файл. Файли не редагуй.",
    expectFilesRead: ["reviewer-core/docs/pipeline.md", "reviewer-core/insights/gotchas.md"],
    maxTurns: 10,
  },

  // --- trace (1 session): /sdd-engineering — a feature starts at the spec stage -----------------------------
  {
    kind: "trace",
    // CLAUDE.md allows an optional brainstormer stage before the spec for a goal with no chosen
    // approach, and a PDF export with no chosen approach qualifies — so either is a correct first
    // step (wf-baseline run 2 went brainstormer, then asked the user, and failed a spec-only check).
    // What must not happen is skipping straight to planning or implementation.
    name: "a new feature request starts at brainstormer or spec-creator, not implementation",
    prompt:
      "Хочу нову фічу: експорт готового рев'ю в PDF з кнопкою на сторінці рев'ю. " +
      "Почни роботу над нею так, як це прописано в процесі цього репо.",
    expectAnySubagent: ["brainstormer", "spec-creator"],
    expectNotSubagents: ["implementer", "implementation-planner"],
    // /sdd-engineering may run the optional brainstormer first, so spec-creator can come a dozen turns in.
    maxTurns: 30,
  },

  // --- trace (1 session): /sdd-engineering negative — a bug fix skips the spec stage -----------------------
  {
    kind: "trace",
    // Negatives only, so the case runs to its natural end (no early stop) — keep maxTurns roomy:
    // hitting the cap sets isError and fails the case for the wrong reason.
    name: "near-miss negative — a bug fix does NOT go to spec-creator",
    prompt:
      "Баг: у списку рев'ю дата показується в UTC замість локального часу користувача. " +
      "Знайди причину і скажи, як її виправити. Файли не редагуй.",
    expectNotSubagents: ["spec-creator", "brainstormer"],
    expectNotRead: ["server/clones/"],
    // 25 was hit at 26 in wf-baseline while the negative itself held; a bug hunt reads a lot.
    maxTurns: 35,
  },

  // --- trace (1 session): API-route task — deep-dive routing + reviewer dispatch ----------------
  {
    kind: "trace",
    // Endpoint must NOT already exist, or the model reviews the existing code inline instead of
    // planning-then-dispatching. GET /reviews/:id/export is genuinely absent from routes.ts.
    // Expected doc was server/docs/api-contracts.md, which does not exist; the server deep-dive is
    // server/docs/architecture.md (root CLAUDE.md and server/AGENTS.md both route to it).
    // The plan is spelled out: with only "оціни мій план" the model asked which plan instead of
    // dispatching (wf-sandbox run 1).
    name: "API-route task reads server architecture AND pulls the architecture-reviewer",
    prompt:
      "Я планую додати НОВИЙ, ще не реалізований ендпоінт GET /reviews/:id/export (віддає ревʼю як " +
      "markdown). Мій план:\n" +
      "- server/src/modules/reviews/routes.ts: новий маршрут зі схемою params, лише викликає сервіс;\n" +
      "- server/src/modules/reviews/service.ts: функція exportReviewMarkdown(id) збирає ревʼю і знахідки " +
      "через repository і форматує markdown у helpers.ts;\n" +
      "- server/src/modules/reviews/repository.ts: без змін, використовую наявні запити.\n" +
      "Спершу звірся з архітектурною документацією сервера. Потім ОБОВʼЯЗКОВО запусти сабагента " +
      "architecture-reviewer, щоб він оцінив цей план на відповідність onion-шарам — не рецензуй сам.",
    expectFilesRead: ["server/docs/architecture.md"],
    expectSubagents: ["architecture-reviewer"],
    maxTurns: 10,
  },

  // --- activation pair (2 sessions): positive + near-miss negative ------------------------------
  {
    kind: "activation",
    name: "engineering-insights activates on a genuine discovery",
    prompt:
      "Щойно з'ясував, чому pgvector-запит повертав нуль рядків — розмірність колонки не збіглася " +
      "після зміни моделі ембедингів. Хочу це зафіксувати, щоб більше не наступати.",
    skill: "engineering-insights",
    shouldActivate: true,
    maxTurns: 8,
  },
  // --- trace (1 session): near-miss negative — explaining must not try to RECORD an insight ------
  // Not an activation check: engineering-insights is also the "read before work" skill (Step 0),
  // so invoking it to read INSIGHTS.md is correct per the session protocol. What must not happen
  // is the write half. Write/Edit stay visible to the model and are denied by a hook, so a try
  // shows up in writeAttempts even though nothing reaches the disk.
  {
    kind: "trace",
    name: "near-miss negative — explaining the same topic must NOT try to record an insight",
    prompt:
      "Поясни, як у pgvector працюють розмірності колонок і чому невідповідність повертає нуль рядків.",
    expectNoWriteTo: ["INSIGHTS.md", "insights/gotchas.md"],
    // Negatives only, so no early stop: leave room to finish or the isError check fails the case.
    maxTurns: 15,
  },
];
