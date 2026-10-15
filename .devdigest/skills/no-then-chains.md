# async/await, not .then()

New code in this repo uses `async`/`await`. Flag a `.then()` chain added by the
diff, and flag these specifically because they read as correct:

- `forEach` with an async callback — the loop does not wait, and a rejection
  inside it is unhandled.
- A promise stored and awaited later, past the point its result is used.
- `.catch()` that returns a value, silently converting a failure into a success.

`Promise.all` / `Promise.allSettled` for genuine concurrency is fine and is not
what this rule is about.