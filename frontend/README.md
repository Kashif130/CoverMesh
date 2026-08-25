# CoverMesh — frontend

A Next.js dashboard for the CoverMesh parametric-insurance contract: pool solvency at a glance,
the peril-type registry, opening a cover in any of the three adapters, and a covers ledger with
claim-check / expire actions.

**Wallet**: two modes, via `genlayer-js` --
- **Injected wallet** -- MetaMask or a compatible extension, signing through the browser
  provider.
- **Browser wallet** -- a locally generated private key, non-custodial, stored only in this
  browser's `localStorage`. Lets someone use the whole app with no extension installed. Export
  the key (top-right wallet menu) before relying on it -- losing it means losing access to
  covers/LP shares opened with it.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in / confirm the contract address
npm run dev
```

Open http://localhost:3000. You'll need a browser wallet connected to the same network the
contract is deployed on (StudioNet by default).

## Environment variables

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | yes | the deployed StudioNet address | the CoverMesh contract to talk to |
| `NEXT_PUBLIC_GENLAYER_CHAIN` | no | `studionet` | `studionet` \| `localnet` \| `testnetAsimov` |
| `NEXT_PUBLIC_GENLAYER_ENDPOINT` | no | chain default | override the RPC endpoint |

## Deploy to Vercel

1. Push this folder to a GitHub repo (or drag-and-drop deploy from the Vercel dashboard).
2. Import the repo in Vercel — it auto-detects Next.js, no build config needed.
3. In Project Settings → Environment Variables, add the three variables above.
4. Deploy.

Or from the CLI:

```bash
npm i -g vercel
vercel
```

## What's wired up

- **Pool**: `get_pool_summary` drives the utilization gauge and NAV/reserved-liability stats.
- **Registry**: `list_peril_types` renders one instrument card per adapter (WEATHER,
  PRICE_THRESHOLD, NEWS_EVENT); selecting one adapts the "Buy cover" form's fields.
- **Cover issuance**: `open_cover`, sending the exact premium the contract expects
  (`coverage_amount * premium_rate_bps / 10000`, computed client-side the same way).
- **Claims**: `check_claim` and `expire_unclaimed_cover` from each ledger row.
- **Liquidity**: `provide_liquidity`, `request_withdrawal`, `execute_withdrawal`, and
  `get_lp_position` for the connected address.

## Honest limitations

- No indexer: `list_covers` is paginated client-side from the contract directly (fine for a
  StudioNet-scale cover count; a production deployment with many covers would want a subgraph
  or similar).
- Admin-only calls (`register_peril_type`, `set_peril_type_active`) have typed wrappers in
  `src/lib/contract.ts` but no UI — this submission's scope is the permissionless flows.
- Injected-wallet support is the standard `window.ethereum` provider pattern; it hasn't been
  tested against every wallet extension. The generated browser wallet has no such dependency,
  since it signs directly against a locally held key.
