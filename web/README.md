# HX frontend

Static Vite / React / TypeScript frontend for the deployed HS XWesXkAAMSB0 (HX) token and its Ethereum ETH/HX Uniswap v4 pool. Source, dependencies and build configuration live here; the complete production export lives in `../dist/`. There is no application server or private credential.

## Install, build and preview

Use Node 22.12+ (worker: Node 24.21.0, npm 11.19.0). From the repository root:

```sh
npm ci --prefix web --cache /tmp/hx-npm-cache
npm run typecheck --prefix web
npm run build --prefix web
npm run verify --prefix web
npm run preview --prefix web
```

Open the local URL printed by Vite. The export also works under a gateway subpath: all exported URLs use a relative base; in-page navigation uses anchors. Serve `dist/` with any static HTTP server. `file://` is unsuitable because the app fetches its manifest and ABI. No `.imd/reads` files are needed after delivery.

`npm run dev --prefix web` starts Vite development mode. For wallet-connected testing, use the production preview because the deployment manifest and ABI are emitted only into `dist/` by the build. The initial render before configuration loads is deliberately inert.

## Deployment source of truth

`dist/imd-deployment.json` is the sole runtime deployment configuration. `src/config.ts` fetches it, constructs the public RPC client, and fetches and verifies each referenced ABI. No deployment addresses or RPC endpoints are embedded in application source. `src/config.ts` also holds the protocol interface fragments, without addresses.

`deployment/handoff.json` and `deployment/network.json` are exact durable snapshots of the supplied, validated worker inputs. They are build inputs, not an additional runtime map. Do not edit addresses to switch deployments informally; obtain an authorized handoff and matching pinned implementation exports instead.

The post-build script extracts `docs/abi/LaunchToken.json` from Git commit `8be0125e72fa2c986b86dade95dabdbf7a8a8485`, verifies the Keccak-256 of recursively key-sorted canonical JSON, and copies the raw JSON array into `dist/abi/`. The build requires this source commit to remain available in local Git history. It copies the handoff's exact contract set, source commit, launch ID, chain, attestation hash and pool key; the network and wallet-add-chain blocks are copied unchanged. It then hashes every exported file except the manifest with SHA-256. Never edit the export without rebuilding the manifest. `npm run verify` independently reconstructs the expected manifest and compares all fields and asset bytes.

The actual handoff pool fee is 12,500 (1.25%), with tick spacing 60 and the nonzero initialization hook. The older admission fee of 3,000 in the nested launch description is not used for trading. Uniswap v4 pools have a pool ID inside PoolManager, not individual pool contract addresses. The page explains this and exposes the full key and routing contracts.

## Wallets and actions

Browser wallets are discovered through EIP-6963 with a `window.ethereum` fallback. Choose between discovered wallets when more than one is present. No WalletConnect key was supplied, so no hosted WalletConnect service is configured. This implementation accepts checksummed/lowercase Ethereum addresses; it does not resolve ENS inputs.

Connection shows the full address, copy/explorer controls, and live ETH/HX balances. Wrong-chain actions present one switch control; unknown-chain error 4902 triggers the supplied `wallet_addEthereumChain` parameters and another switch. Wallet account/network/disconnect events clear the session and quotes. Read state polls the configured public endpoints every 15 seconds while the page is visible, with a manual refresh. Fallback endpoints are ordered as supplied. The wallet signs only; it is not used as an unverified public-read fallback.

RPC chain and nonempty contract code are checked on initial load and again before each transaction. ABI mismatch, RPC failure, missing code, wrong wallet chain, missing account and an uninitialized pool prevent dependent actions. Code presence is not a bytecode/source audit. The 88% pool allocation is labeled as approved launch policy, not independently proven distribution.

Buy/sell quotes use `quoteExactInputSingle` via simulation, never a transaction. Slippage defaults to 0.5%, accepts 0.1–5%, and determines the minimum output with integer arithmetic. Quotes expire after 30 seconds and are invalidated by input/slippage/direction/session changes. Active liquidity can be zero at an initialized range boundary while an ETH buy remains quotable; readiness therefore checks initialization and relies on quote/execution simulation rather than rejecting all zero-liquidity boundaries.

For sales, the UI presents exact-amount token→Permit2 approval and Permit2→router approval as separate transactions, only when their fresh allowances are short. Router permission expires after 30 minutes. Native ETH purchases require neither approval. Swaps use command `0x10`, actions `0x060c0f`, the exact handoff key, empty hook data, a five-minute deadline, and native value only when buying. The six-field swap tuple is supported when the network's `extendedSwapParams` flag is set. The assigned site supports its native ETH pair; it does not invent another pair or liquidity-management workflow.

Each write is simulated before wallet signing, holds a transaction lock through one mined confirmation, then refreshes state. Pending, rejected, reverted and confirmed states include a transaction explorer link when a hash exists. A 180-second receipt timeout means confirmation is unknown: follow the shown explorer link before retrying. Wallet gas estimation is shown by the wallet. USD context is explicitly unavailable; no price feed or fabricated USD price is added.

Native disclosure controls expose `transfer`, exact approval/revocation, allowance reads, and `transferFrom`, with address validation, prerequisite balance/allowance reads and an explicit review before confirmation. There are no owner, mint, pause, burn or upgrade controls because the implementation has no such functions.

## Validation

```sh
npm test --prefix web
node web/scripts/live-read.mjs
```

The browser test uses the installed Chrome at `/opt/google/chrome/chrome`; set `CHROME_BIN` to another compatible Chromium executable if needed. It creates and closes its own local server and browser, serves the actual production export at `/preview/`, and uses mock RPC/wallet responses. It sends no real transaction. Tests refresh evidence under `docs/frontend/`; keep it with the source. The live-read script only performs public reads and quote simulations.

See [validation](../docs/VALIDATION.md), [implemented design](../docs/DESIGN.md), and [media provenance](../docs/MEDIA.md). Main bundle size produces Vite's advisory 500 kB warning; the final export is approximately 1.01 MB before compression, including video, and all assets are local. `web/.gitignore` is the sole explicitly budgeted ignore path and excludes dependency/cache/test-output directories at every depth under `web/`. Dependency archives and `node_modules` are not deliverables.

Publication, IPFS pinning, site naming and transaction broadcasting are outside this worker task. Social metadata has title/description and favicon; an absolute social image URL awaits a published origin.
