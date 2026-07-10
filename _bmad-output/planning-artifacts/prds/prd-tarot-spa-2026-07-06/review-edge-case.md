# Edge-Case Hunter Review — reviews prd.md + addendum.md as of 2026-07-07

```json
[
  {
    "location": "prd.md:80-89 (FR-1)",
    "trigger_condition": "Two redemption requests for the same Invite Key submitted concurrently",
    "guard_snippet": "BEGIN TRANSACTION; SELECT ... FOR UPDATE key WHERE status='unredeemed'; mark redeemed atomically",
    "potential_consequence": "Same key redeemed twice, creating two Accounts from one key"
  },
  {
    "location": "prd.md:84 (FR-1)",
    "trigger_condition": "Rejection message does not distinguish invalid vs redeemed vs revoked key",
    "guard_snippet": "return specific reason code (invalid|redeemed|revoked) in rejection response",
    "potential_consequence": "User cannot tell whether to retry, contact granter, or give up"
  },
  {
    "location": "prd.md:82-87 (FR-1)",
    "trigger_condition": "Cognito account creation succeeds but key-redeemed flag write fails (or vice versa)",
    "guard_snippet": "wrap Cognito signup + key-mark-redeemed in a single saga/compensating transaction",
    "potential_consequence": "Orphaned Cognito user with no Account, or key stuck unredeemed/redeemed inconsistently"
  },
  {
    "location": "prd.md:80-89 (FR-1)",
    "trigger_condition": "Same person redeems two different Invite Keys to create two Accounts",
    "guard_snippet": "enforce uniqueness on verified email/identity across Accounts at redemption",
    "potential_consequence": "One person doubles effective Daily Orientation Limit via a second Account"
  },
  {
    "location": "prd.md:91-98 (FR-2)",
    "trigger_condition": "First-Gen account double-clicks/duplicate-submits 'generate onward key'",
    "guard_snippet": "SELECT ... FOR UPDATE account WHERE onward_key_generated=false before insert",
    "potential_consequence": "Account generates more than one onward Invite Key, breaking the two-generation cap"
  },
  {
    "location": "prd.md:93-97 (FR-2)",
    "trigger_condition": "First-Gen account redeems its own generated onward key",
    "guard_snippet": "reject redemption if key.issuer_account_id == redeeming_identity",
    "potential_consequence": "Single person holds both a First-Gen and self-created Second-Gen Account"
  },
  {
    "location": "prd.md:99-109 (FR-3)",
    "trigger_condition": "Generated onward key is later revoked (e.g. abuse) after being granted",
    "guard_snippet": "on revoke, reset account.onward_key_generated=false to allow reissue, or document as permanent",
    "potential_consequence": "First-Gen account permanently loses grant ability with no defined recovery path"
  },
  {
    "location": "prd.md:107 (FR-3 Notes)",
    "trigger_condition": "Key is revoked while a redemption using it is already in flight",
    "guard_snippet": "re-check key status inside the same transaction that finalizes redemption",
    "potential_consequence": "Revoked key still succeeds in creating an Account due to race with revocation"
  },
  {
    "location": "prd.md:104, 245 (FR-3/FR-13)",
    "trigger_condition": "Admin double-clicks 'mint key' control on the Dashboard",
    "guard_snippet": "disable control / dedupe via idempotency key on mint request",
    "potential_consequence": "Duplicate unredeemed First-Gen keys created from a single admin action"
  },
  {
    "location": "prd.md:123-133 (FR-5)",
    "trigger_condition": "Request-access form submitted with empty name or malformed email",
    "guard_snippet": "if not name or not is_valid_email(email): reject with inline error",
    "potential_consequence": "Malformed/empty request emails sent to Tony's cutout address"
  },
  {
    "location": "prd.md:127-129 (FR-5)",
    "trigger_condition": "Same email resubmits the request-access form repeatedly",
    "guard_snippet": "rate-limit or dedupe submissions per email/IP within a time window",
    "potential_consequence": "Cutout address flooded, defeating its purpose as a lightweight intake"
  },
  {
    "location": "prd.md:128 (FR-5)",
    "trigger_condition": "Email send to the cutout address fails or bounces",
    "guard_snippet": "log/alert on send failure even though requester sees acknowledgment",
    "potential_consequence": "Request silently lost with no record and no way to recover it"
  },
  {
    "location": "prd.md:143-149 (FR-6)",
    "trigger_condition": "Context text submitted with no upper length bound",
    "guard_snippet": "if len(context) > MAX_CHARS: reject or truncate before LLM call",
    "potential_consequence": "Oversized input inflates LLM cost/latency or exceeds model context window"
  },
  {
    "location": "prd.md:145-149 (FR-6/FR-8)",
    "trigger_condition": "'Help Me Orient' triggered with empty/blank Context field",
    "guard_snippet": "if not context.strip(): block submission with validation message",
    "potential_consequence": "Daily Orientation Limit unit consumed on a request with no meaningful input"
  },
  {
    "location": "prd.md:158-169, 187-196 (FR-8/FR-9)",
    "trigger_condition": "Duplicate/near-simultaneous 'Help Me Orient' requests race the limit check",
    "guard_snippet": "atomically check-and-increment usage counter (e.g. conditional UPDATE ... WHERE used < cap)",
    "potential_consequence": "Two requests both pass the remaining-limit check, exceeding the configured cap"
  },
  {
    "location": "prd.md:164 (FR-8)",
    "trigger_condition": "Current Events search returns fewer than 3 relevant items",
    "guard_snippet": "define minimum acceptable count / fallback behavior when search yields <3",
    "potential_consequence": "Guide generated with under-grounded Lens with no defined fallback or partial-fail handling"
  },
  {
    "location": "prd.md:169 (FR-8)",
    "trigger_condition": "User closes tab/loses connection after limit unit consumed but before Guide delivered",
    "guard_snippet": "define 'completed' as server-side generation success, independent of client connection",
    "potential_consequence": "User charged a daily unit for a Guide they never received, with no stated recourse"
  },
  {
    "location": "prd.md:175, 178 (FR-8 NFR/Notes)",
    "trigger_condition": "LLM call succeeds but exceeds the 20s target, or returns malformed/off-structure output",
    "guard_snippet": "define whether slow-success or malformed-but-nonempty output consumes a limit unit",
    "potential_consequence": "No refund rule for degraded-but-technically-completed responses; ambiguous billing of the unit"
  },
  {
    "location": "prd.md:159, 163 (FR-8, also_consider: card draw randomness)",
    "trigger_condition": "Multi-position Spread (Three/Decision/System) draws the same Card into more than one position",
    "guard_snippet": "draw without replacement across positions within a single Draw",
    "potential_consequence": "Orientation Guide references the same Card idea twice, undermining spread intent"
  },
  {
    "location": "prd.md:59 (Glossary: Card)",
    "trigger_condition": "Card inversion selection has no defined probability or mechanism",
    "guard_snippet": "specify inversion probability (e.g. 50/50) and RNG source for the Draw",
    "potential_consequence": "Inversion behavior is unverifiable/untestable; boundary cases (always/never inverted) unhandled"
  },
  {
    "location": "prd.md:187-196 (FR-9, also_consider: reset timing)",
    "trigger_condition": "Calendar-day boundary timezone is unspecified (server UTC vs. user local)",
    "guard_snippet": "define canonical timezone for 'calendar day' reset (e.g. UTC) and document it",
    "potential_consequence": "Users in different timezones see limit reset at different, confusing local times"
  },
  {
    "location": "prd.md:189 (FR-9)",
    "trigger_condition": "Tony lowers the cap mid-day below a user's already-consumed count",
    "guard_snippet": "clamp remaining = max(0, new_cap - used_today) rather than allowing negative remaining",
    "potential_consequence": "Undefined state where used count exceeds the newly configured cap"
  },
  {
    "location": "prd.md:189 (FR-9)",
    "trigger_condition": "Cap configured to 0",
    "guard_snippet": "enforce a documented minimum cap value (e.g. >=1) at config time",
    "potential_consequence": "Account permanently blocked from any Orientation Guide with no defined messaging"
  },
  {
    "location": "prd.md:175, 191-192 (FR-8 NFR/FR-9)",
    "trigger_condition": "Concurrent requests race the decrement-then-rollback path for an outright-failed call",
    "guard_snippet": "make consume-then-refund-on-failure atomic (single transaction per request)",
    "potential_consequence": "Interleaved refund and decrement operations leave usage counter incorrect under concurrency"
  },
  {
    "location": "prd.md:204-211 (FR-10, also_consider: account deleted before nudge)",
    "trigger_condition": "Account deleted/revoked before its scheduled Follow-Up Nudge fires",
    "guard_snippet": "on account deletion, cancel/skip pending Follow-Up Nudge jobs for that Account",
    "potential_consequence": "Nudge job attempts to email a deactivated user or errors against a missing Account"
  },
  {
    "location": "prd.md:204-206 (FR-10)",
    "trigger_condition": "User completes many Sessions in one day, each scheduling its own nudge independently",
    "guard_snippet": "cap or batch nudges per user per day/window",
    "potential_consequence": "User's inbox is flooded with multiple near-simultaneous nudge emails"
  },
  {
    "location": "prd.md:204-206 (FR-10)",
    "trigger_condition": "Follow-Up Nudge email delivery itself fails (bounce, invalid address)",
    "guard_snippet": "add retry/backoff and dead-letter handling for nudge send failures",
    "potential_consequence": "Nudge silently never reaches the user with no retry or record of failure"
  },
  {
    "location": "prd.md:212-218 (FR-11, also_consider: survey response edge cases)",
    "trigger_condition": "Survey link has no stated authentication or expiry",
    "guard_snippet": "bind survey link to a single-use, expiring, Session-scoped token",
    "potential_consequence": "Link can be forwarded, replayed, or resubmitted producing duplicate/unauthorized responses"
  },
  {
    "location": "prd.md:214-217 (FR-11)",
    "trigger_condition": "Survey submitted after the originating Account or Session has been deleted",
    "guard_snippet": "handle foreign-key/orphan case explicitly (reject, or store detached with reason)",
    "potential_consequence": "Survey response stored with a dangling reference to a nonexistent Session/Account"
  },
  {
    "location": "prd.md:214-217 (FR-11)",
    "trigger_condition": "Survey submitted with blank/empty response content",
    "guard_snippet": "define whether an empty submission counts toward SM-2 response-rate metric",
    "potential_consequence": "Success metric (SM-2) inflated by empty, non-informative survey submissions"
  },
  {
    "location": "prd.md:229-238 (FR-12)",
    "trigger_condition": "Daily metrics refresh job fails silently",
    "guard_snippet": "surface last-refreshed timestamp and alert on stale/failed refresh",
    "potential_consequence": "Admin Dashboard shows stale data indefinitely with no indication it is out of date"
  },
  {
    "location": "prd.md:56-70 (Glossary: Session)",
    "trigger_condition": "Context entered but Draw never triggered (abandoned before completion)",
    "guard_snippet": "define whether a partial attempt counts as a Session for nudge scheduling/metrics",
    "potential_consequence": "Undefined whether abandoned attempts schedule a nudge or appear in Session counts/metrics"
  },
  {
    "location": "prd.md:249-251 (Cross-Cutting NFR: Reliability)",
    "trigger_condition": "Current Events search succeeds but the subsequent LLM essay call fails, or vice versa",
    "guard_snippet": "define partial-failure path distinctly from the 'fails outright' case in FR-8 NFR",
    "potential_consequence": "Ambiguous whether a partial pipeline failure consumes a Daily Orientation Limit unit"
  }
]
```
