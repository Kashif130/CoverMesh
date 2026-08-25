# CoverMesh Decision Record

## The product

A registry of peril types (WEATHER, PRICE_THRESHOLD, NEWS_EVENT, plus any admin-registered
future adapter instance) shares one solvency-capped, NAV-accounted liquidity pool. LPs deposit
GEN and receive shares proportional to the pool's current NAV. Anyone may open a forward-looking
cover against any active peril type, paying a premium computed from that peril type's own rate.
Once a cover's window ends, anyone may permissionlessly trigger a GenLayer consensus round
appropriate to that peril's adapter, which settles the claim directly against the pool's NAV --
paying the beneficiary on a triggered outcome, or simply releasing the reserved liability on a
non-triggered or voided one.

## Counterfactual: why not another single-peril contract

A predecessor contract in this series already proved every core insurance mechanic works on
GenLayer: a structured, `>=`-only threshold closes the free-text-condition exploit a
buyer-chosen comparison would otherwise open; a solvency cap prevents a pool from ever promising
more than it can pay; an expiry path prevents a stuck claim from locking capital forever. Writing
a fourth, fifth, or sixth single-peril contract, each with its own separate pool, would repeat
that already-proven mechanism at the cost of the one thing that makes insurance pooling
economically sound in the first place: capital efficiency from pooling *uncorrelated* risks
together. A weather-only pool and a price-only pool, kept separate, each need enough capital to
cover their own worst case in isolation. The same total capital, shared across both, needs less
buffer for the same aggregate coverage, because a bad weather event and a bad price move are not
the same event. CoverMesh's shared pool is not a convenience feature -- it is the actual
financial reason multi-peril insurance protocols pool capital together instead of running
separate, isolated funds per risk type.

## Why a registry of adapters instead of one fixed peril

A registry with a small, fixed set of built-in adapters (rather than either a single hardcoded
peril, or a fully open "supply any evidence source" design) is the middle path that is both
genuinely reusable and genuinely safe. Fully open evidence sourcing was considered and rejected
for the same reason a companion verdict-primitive contract in this series rejected it: a
consensus contract that fetches whatever URL a caller supplies is an unbounded, abusable fetch
proxy, not a bounded, auditable claims engine. A registry of a small number of adapters, each
with its own fixed, safe, already-proven evidence sources, gives real reusability (any future
peril type that fits WEATHER, PRICE_THRESHOLD, or NEWS_EVENT's shape needs no new code at all,
just a registration call) without that risk.

## Why the model only extracts a number for numeric perils

Every predecessor contract in this series that made a categorical decision (a mood band, a
fulfillment verdict, an arbitrated outcome) had the model make that categorical call directly,
with the contract only validating that the returned label was one of the allowed options. For
CoverMesh's two numeric adapters, a stricter design was chosen deliberately: the model's job is
narrowed to extracting a single number from evidence text, and the actual pass/fail decision --
the thing that determines whether real pooled capital gets paid out -- is computed by this
contract's own deterministic code, comparing that extracted number against the cover's own
stored threshold. This is not a cosmetic difference. It means the paying decision for a WEATHER
or PRICE_THRESHOLD cover is, in the strictest sense available in this architecture, never the
model's own comparative judgment call -- only its reading of what a number in the evidence text
says. Given that real pooled LP capital is directly at stake in every payout, this is the
appropriate place in the whole project series to apply the narrowest possible trust boundary.

## Why premiums and payouts are the settlement mechanism, not a layer added afterward

A steward review of an earlier, single-purpose contract in this series pointed out that its
oracle result did not drive any concrete outcome -- correct feedback, and the fix there required
retrofitting a staking layer onto a contract that was not originally designed around real fund
movement. CoverMesh does not have that problem, because it was never designed as a pure
information oracle in the first place: `provide_liquidity` and `open_cover` move real GEN through
`pool_nav` from the contract's very first useful call, and `check_claim`'s consensus result
directly determines whether that same pool pays out. There is no separate settlement layer to
retrofit here because settlement -- who gets paid, and how much -- is the entire reason this
contract's state exists.

## Why single-contract, multi-concern architecture instead of separate deployed contracts

A cleaner separation of concerns on paper would split the registry, the pool, and the claims
engine into three separately deployed contracts calling each other. This was considered and
deliberately not built, for an honest, practical reason: this submission's development
environment cannot execute-test real inter-contract calls against a live GenVM network, and
shipping unverified cross-contract-call semantics in a claims-paying financial contract would be
a worse engineering choice than a single, internally-organized contract whose every code path can
actually be tested end to end. The predecessor weather contract in this series already proved
that a single contract holding pool state, policy state, and claims logic together is a working,
provable pattern on this platform. CoverMesh follows that same proven shape, deliberately, rather
than reaching for an architecturally "cleaner" design this submission could not actually verify
works.

## Why the two solvency caps are checked before, not after, a cover's own premium is added

Checking pool capacity using the pool's state *before* a new cover's premium is credited is a
small detail with a real consequence: if the check ran after crediting the premium, a cover
could partially fund its own capacity headroom, letting the pool accept more aggregate risk than
its pre-existing capital actually justified. Checking against pre-premium state closes that gap
-- every cover must fit within capacity the pool already had, not capacity that cover's own
premium payment conjures into existence in the same transaction.
