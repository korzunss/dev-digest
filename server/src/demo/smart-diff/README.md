# Rate limiting (demo)

Demo module for the Smart Diff manual check (spec 007). It is not wired into
the app and is deleted together with the demo commit.

`checkRateLimit(req)` keeps one fixed-window bucket per client and path:

- the client is identified by `x-forwarded-for` (first entry) or the socket IP;
- the window is one hour;
- the per-path limits come from `limits.generated.ts` (`*` is the default).

When a bucket is over its limit the result is `{ allowed: false, status: 429 }`.
