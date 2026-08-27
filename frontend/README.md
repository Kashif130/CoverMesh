# CoverMesh

A generic, multi-peril parametric-insurance protocol: one shared, solvency-capped liquidity
pool backs covers across three independently-evidenced peril adapters (severe weather, asset
price thresholds, and general news/GitHub-evidenced events with a caller-defined outcome
taxonomy), settled by GenLayer consensus, with every lesson from a prior steward review
designed in from the first line rather than retrofitted.

## Reviewer summary

CoverMesh generalizes a proven single-peril, single-contract pattern (structured thresholds, a
comparator locked to `>=` to close a free-text-condition exploit, a solvency-capped pool,
expiry for stuck claims) into genuine **reusable infrastructure**: a registry of peril types,
each backed by the same shared pool, each using one of three built-in evidence adapters. Anyone
can provide liquidity (NAV-accounted LP shares, a 7-day withdrawal lock-up), and anyone can open
a forward-looking cover against any active peril type. Once a cover's window ends, anyone can
permissionlessly trigger `check_claim`, which runs a GenLayer consensus round appropriate to
that peril's adapter and settles the outcome directly against the pool's own NAV -- premiums and
payouts are the protocol's concrete settlement mechanism from the start, not a layer added
afterward.

- **Live app**: a Next.js dashboard is included in this repo under [`frontend/`](./frontend) --
  see [`frontend/README.md`](./frontend/README.md) for local dev and deployment instructions.
- **Source**: add GitHub repo URL here when published
- **Contract**: `0x3b279743B132B4f2f115EB13f39519C907E55397` (StudioNet)
- **Main workflow**: provide liquidity -> open a forward-looking cover against an active peril
  type (paying a computed premium, which raises pool NAV) -> once the window ends, anyone
  triggers `check_claim` -> a peril-appropriate consensus round settles the claim directly
  against pool NAV (payout on trigger, nothing on non-trigger) -> LPs can queue and later
  execute a withdrawal at the pool's then-current NAV per share.

## Problem and counterfactual

A predecessor contract in this series (a single-peril weather-insurance product) proved the
core mechanics work: structured, one-directional thresholds close a real exploit path a
free-text condition would otherwise open; a solvency cap prevents the pool from ever promising
more than it can pay; an expiry path prevents a stuck claim from locking capital forever. But it
proved all of that for exactly one peril, in exactly one evidence source, in one contract with
no reusable registry or shared capital base. Every new peril type would mean writing a new
contract, with a new pool, splitting liquidity and diluting the capital efficiency that makes
insurance pooling work in the first place (a shared pool backing many uncorrelated risks needs
less capital per unit of coverage than many small, isolated pools each backing one risk alone).

CoverMesh is the generalization of that proven pattern into something a future peril type does
not require redeploying a whole new protocol to add: register a peril type against one of three
already-built evidence adapters, and it shares the same pool, the same solvency accounting, and
the same LP base as every other peril type already live on the contract.

## Why three adapters, and why exactly these three

- **WEATHER** -- Open-Meteo's archive API (the same source proven in the predecessor contract),
  extended here to four selectable metrics (precipitation, max/min temperature, max wind speed)
  instead of one hardcoded metric.
- **PRICE_THRESHOLD** -- CoinGecko's keyless historical-price endpoint, checking an asset's USD
  price on a specific date against a caller-chosen `>=` or `<=` threshold -- a real, common
  hedging need (protecting against a price drop or betting on a price rise) with no predecessor
  in this series.
- **NEWS_EVENT** -- the general-purpose GitHub + Google News + Wikipedia triangulation with a
  caller-defined outcome taxonomy, the same generic pattern already proven in this ecosystem's
  dedicated verdict-primitive contract, reused here as the adapter for anything that is not
  cleanly weather- or price-shaped.

Every adapter's own evidence sources are fixed and safe (never a caller-supplied URL, which
would turn a claims engine into an open fetch proxy) -- what the caller controls is the
question, the threshold or taxonomy, and the coverage terms, never which endpoints get queried.

## Why the model only extracts numbers -- the contract does the comparing

For the two numeric adapters (WEATHER, PRICE_THRESHOLD), the consensus round's job is
deliberately narrower than in every predecessor contract: the model extracts a single numeric
reading from evidence text and nothing else. The actual `>=`/`<=` comparison against the cover's
own stored threshold happens afterward, in this contract's own deterministic Python code -- not
inside the consensus round, not as the model's own comparative judgment. This is a stricter
trust boundary than any predecessor: even less of the paying decision is delegated to the
model's own say-so. (NEWS_EVENT still needs a genuine categorical judgment call, since
classifying an event against a caller-defined taxonomy is not a numeric-extraction task -- that
adapter keeps the categorical-classification approach proven elsewhere in this ecosystem.)

## Steward-feedback lessons designed in from the start

A steward review of an earlier, single-purpose oracle contract in this series identified three
concrete gaps. All three are architectural decisions in CoverMesh from its first version, not
patches applied afterward:

1. **Query inputs cannot reshape the evidence.** Keywords are restricted to a safe character set
   (`_require_safe_keywords`) and percent-encoded before being embedded in any query string
   (`_url_encode_component`); asset ids are restricted to CoinGecko's own lowercase-hyphen id
   format. A cover buyer cannot inject `& = # ? / %` to steer which evidence a source returns.
2. **A minimum independent-source count is a code rule, not a suggestion**, per peril type
   (configurable at registration, minimum 2, seeded at 2 for all three built-in adapters).
   `check_claim` can never resolve to a paying or non-paying outcome on fewer than that many
   sources actually responding, regardless of what the model itself claims -- enforced
   identically inside every validator's own evaluation.
3. **Settlement is the protocol's core mechanism, not a bolted-on layer.** Premiums and payouts
   are the pool's own NAV accounting from `provide_liquidity`'s first line onward -- there is no
   separate staking or reward system sitting alongside an otherwise-inert oracle result.

## Steward round 2: fixes applied in this revision

A second steward review of this submission identified five concrete gaps, all closed in this
revision:

1. **Every pool outflow now preserves the liability backing live covers.** `execute_withdrawal`
   reverts if redeeming the queued shares at current NAV would draw `pool_nav` below
   `reserved_liability`; the keeper reward paid on every `check_claim` call (including repeated
   `INSUFFICIENT_EVIDENCE` rechecks that never resolve a cover) is now gated the same way. Before
   this, an LP could exit -- or enough retried keeper rewards could accumulate -- ahead of a
   cover the pool had already promised to pay, silently under-collateralizing it.
2. **Direct-VM tests for a full LP exit and an unresolved retry sequence.** New tests cover a
   sole LP's complete exit both with no covers open (pool goes fully to zero) and with an open
   cover reserving liability (execution is correctly blocked), plus a 3-round
   `INSUFFICIENT_EVIDENCE` retry sequence asserting the solvency invariant holds after every
   single retry, not just the final one.
3. **Trivially guaranteed numeric covers are rejected.** `precipitation_mm` and
   `wind_speed_max_kmh` can never be negative, so a `>= 0` threshold was a guaranteed trigger
   regardless of evidence -- now rejected. `PRICE_THRESHOLD` similarly rejects a threshold at or
   below 0 for either comparator, since a real asset price is always positive (making `>= 0`
   guaranteed and `<= 0` impossible).
4. **NEWS_EVENT outcome labels are persisted in normalized form.** Validation already
   stripped/uppercased/deduplicated the buyer's labels to determine what `check_claim` compares
   the consensus outcome against, but the *raw*, un-normalized input was what actually got
   stored on the cover -- a mismatch that could silently break the triggering-set match on
   anything but already-clean input. The cover now stores the same normalized labels the
   comparison actually uses.
5. **Buyer-controlled subject/keywords/taxonomy text is isolated from validator instructions.**
   Both consensus prompts now fence the buyer-supplied subject, search keywords, and (for
   NEWS_EVENT) the outcome-label taxonomy as explicitly untrusted, non-instruction text -- the
   same treatment already given to fetched evidence pages -- so a buyer cannot embed
   instruction-like phrasing in their own cover fields to steer a validator's classification.

## Architecture

- `contracts/CoverMesh.py` -- a single Intelligent Contract holding three internally-separated
  concerns (peril registry, NAV-accounted liquidity pool, and cover issuance/claims), following
  the same proven single-contract, many-internal-concerns pattern the predecessor weather
  contract established, rather than an unverified multi-contract call architecture. `open_cover`
  and the liquidity methods are deterministic writes; `check_claim` is the only non-determinism
  round, dispatched to one of two consensus helpers (`_consensus_numeric` or
  `_consensus_categorical`) depending on the cover's peril adapter, each exactly four
  non-deterministic operations (two or three `gl.nondet.web.render` fetches plus one
  `gl.nondet.exec_prompt`), run at most once per attempt with a cooldown between retries.
- `tests/direct/` -- 81 direct-VM pytest tests (`gltest`) covering the registry, LP share
  economics and withdrawal lock-up, every adapter's field-isolation and validation rules
  (including the rejection of trivially guaranteed numeric thresholds), both solvency caps
  (isolated from each other with a dedicated multi-cover test), all three claim adapters'
  trigger/non-trigger/insufficient paths, normalized categorical-label persistence and matching,
  the minimum-source enforcement, the defensive downgrade of out-of-taxonomy model output, the
  keeper reward and its own solvency floor, a full LP exit (with and without competing reserved
  liability), a multi-round unresolved retry sequence, cover expiry, and every view method.
- `frontend/` -- a Next.js dashboard talking to the deployed contract via `genlayer-js` and an
  injected browser wallet: pool solvency at a glance, the peril-type registry, opening a cover in
  any of the three adapters, and a covers ledger with claim-check / expire actions. See
  [`frontend/README.md`](./frontend/README.md) for the full breakdown of what's wired up.

### Contract methods

| Method | Kind | Consensus round? | What it does |
| --- | --- | --- | --- |
| `register_peril_type(...)` | admin-only write | No | Registers a new peril type against one of the three built-in adapters. |
| `set_peril_type_active(id, active)` | admin-only write | No | Enables/disables a peril type for new covers. |
| `provide_liquidity()` | payable write | No | Mints NAV-proportional LP shares. |
| `request_withdrawal(shares)` | write | No | Queues a share redemption; starts the 7-day lock-up. |
| `execute_withdrawal()` | write | No | Redeems queued shares at the pool's current NAV per share, once unlocked. |
| `open_cover(...)` | payable write | No | Opens a forward-looking cover against an active peril type, paying the computed premium. |
| `check_claim(cover_id)` | write, permissionless | **Yes -- once per attempt** | Runs the peril-appropriate consensus round and settles the claim against pool NAV. |
| `expire_unclaimed_cover(cover_id)` | write, permissionless | No | Voids a cover stuck in repeated INSUFFICIENT_EVIDENCE, releasing its reserved liability. |
| `get_peril_type` / `list_peril_types` | view | No | Registry reads. |
| `get_cover` / `list_covers` / `list_covers_by_beneficiary` | view | No | Cover reads. |
| `get_lp_position` / `get_pool_summary` | view | No | Liquidity/pool reads. |

## Pool economics

- **NAV accounting**: `pool_nav` and `total_shares` track the pool's real backing capital. Every
  premium raises `pool_nav`; every payout and every keeper reward lowers it. Share price is
  always `pool_nav / total_shares`.
- **Two-tier solvency caps**: `reserved_liability` (the sum of every currently-open cover's
  maximum possible payout) can never exceed 70% of `pool_nav` pool-wide, and no single cover's
  `coverage_amount` can exceed its own peril type's configured concentration cap (seeded at 20%
  for WEATHER, 15% for PRICE_THRESHOLD, 10% for NEWS_EVENT) -- both checked against the pool's
  state *before* that cover's own premium is added, so a cover can never fund its own capacity
  headroom.
- **Withdrawal lock-up**: requesting a withdrawal removes those shares from the requester's
  active balance immediately, but the shares keep bearing the pool's real P&L for a full 7 days
  before they can actually be redeemed -- the same family of cooldown mechanic used by real
  underwriting-pool protocols, specifically to prevent an LP who learns a claim is imminent from
  exiting ahead of paying it.
- **Keeper reward**: a small, fixed amount is deducted from `pool_nav` on every `check_claim`
  call, paid to whoever triggered it -- a real, small operating cost the pool bears (the same
  role a real insurer's claims-processing overhead plays), not a separate fee reserve.
- **Every outflow respects the reserved-liability floor**: both `execute_withdrawal` and the
  keeper reward in `check_claim` refuse to draw `pool_nav` below `reserved_liability` -- an LP
  exit or an accumulation of repeated keeper rewards can never silently under-collateralize a
  cover the pool has already promised to pay.

## Scope of this submission

This submission is **Contract + Tests + Frontend**. The contract's own correctness, solvency
invariants, and the steward-feedback lessons applied from the ground up were the priority for
this revision, and the [`frontend/`](./frontend) Next.js dashboard now demonstrates the full flow
end to end on top of it: provide liquidity, browse peril types, open a cover in any of the three
adapters, trigger a claim check, and request/execute a withdrawal. See
[`frontend/README.md`](./frontend/README.md) for what's wired up, local dev, and deployment.

## Honest limitations

- **Peril-type registration is admin-gated, not permissionless.** A peril type defines which
  evidence adapter and safety caps apply, so it is a protocol-parameter decision, not a
  financial one -- opening a cover and providing liquidity, the actually financially meaningful
  actions, are fully permissionless. A future version could move to a timelocked or
  governance-voted registration process instead of single-admin control.
- **The two-outcome triggered/not-triggered model has no partial-payout tier.** A predecessor
  contract's proportional MODERATE tier was deliberately left out of this version to keep the
  already-substantial scope (three adapters, a shared pool, two solvency caps) manageable; a
  future version could reintroduce graduated payouts per adapter.
- **PRICE_THRESHOLD checks a single historical date (the window's end), not an intra-window
  extremum.** WEATHER deliberately checks the most extreme single-day reading across the whole
  window (matching how a real threshold-crossing weather peril is judged), but CoinGecko's
  keyless history endpoint only exposes one date per call within this contract's fixed
  non-determinism budget, so PRICE_THRESHOLD is necessarily an expiry-style check rather than a
  window-extremum check. This is a real, adapter-specific difference, documented rather than
  papered over.
- **No cross-contract composition.** CoverMesh is one contract with internally-separated
  concerns, following the same proven single-contract pattern the predecessor weather contract
  used, rather than a literal multi-contract system with inter-contract calls -- a choice made
  deliberately to avoid shipping unverified cross-contract-call semantics in an environment this
  submission could not execute-test against a live network.
- **Wallet-extension write path is architecturally identical to a proven pattern elsewhere in
  this ecosystem, but has not been tested against every wallet extension** -- see
  [`frontend/README.md`](./frontend/README.md)'s own "Honest limitations" for the frontend's
  specific caveats (no indexer, admin-only calls have no UI, etc).
