# Worker validation — HX frontend

Date: 2026-10-07. Completion: **Complete source, static export and validation evidence within the assigned write scope.** These are worker observations, not independent certification or publication checks. No contracts were changed or deployed, no transaction was broadcast, and no site was published.

## Scope and consequential decisions

Implemented a single static page: company identity, required local motion, supply/pair/allocation facts, wallet connection, ETH/HX swaps, ERC-20 transfer/approval/revocation/transferFrom, live token and pool reads, full deployment provenance and repository/explorer links. The deployed source is unchanged. Dark-only styling and standard browser wallet discovery were inferred from the brief. The 88% allocation is explicitly labeled approved policy, not a newly verified distribution.

`dist/imd-deployment.json` is the runtime source of deployment configuration. Its complete contract set, source commit, chain, launch ID, attestation hash, exact pool key, network and wallet-add-chain values match the provided inputs. The ABI is extracted from `docs/abi/LaunchToken.json` at commit `8be0125e72fa2c986b86dade95dabdbf7a8a8485` and canonically hashes to `38880b8e56d42ce900f744a7908c7139632a49f1c3f33385c64ceaed29d37bee`. The exact raw JSON array is shipped and loaded at runtime.

The overriding path budget permits only `web/**`, `dist/**`, `docs/**`, and the explicit `web/.gitignore` exception. Therefore design documentation is `docs/DESIGN.md`, not the conflicting root path. This is the only ignore file created, with an explicit path-budget comment; it excludes nested dependency/cache directories. Workspace `.git` is read-only under the supplied permission profile. Source/export/evidence are left as submission-ready working files; the network publisher can commit them. A full-history candidate commit and Git bundle are constructed only inside disposable `test/scratch/` to check submission size without modifying workspace Git metadata.

## Checks and results

| Check | Actual command/method | Result |
| --- | --- | --- |
| TypeScript | `npm run typecheck --prefix web` | Passed |
| Production build | `npm run build --prefix web` | Passed; relative Vite base; all assets local |
| Deployment/ABI/assets | `npm run verify --prefix web` | Passed; 8 declared assets, 1,009,297 bytes excluding manifest; no missing or extra exported file |
| Browser interactions | `npm test --prefix web` | 18 scenarios passed against the production export under `/preview/` |
| Live RPCs | `node web/scripts/live-read.mjs` | Both configured endpoints returned chain 1, nonempty required contract code, expected token metadata and pool state |
| Browser tool | Navigated final export, clicked Trade, played/paused motion, inspected screenshots/console/network | Static requests successful; final console had zero errors/warnings |
| Accessibility automation | Axe on disconnected desktop and connected 320px quote/expanded tools | Zero violations in tested states; manual-review items retained |
| Layout | 320, 390, 768, 1440px; 768px with root text at 200%; connected 320px | No horizontal page overflow |
| Packaging | Export inventory, allowed-path scan, nested dependency exclusions, full-history scratch Git bundle | Checked below 8 MiB; source and required media retained |

Vite emits an advisory that the approximately 539 kB uncompressed main JS chunk exceeds 500 kB. Its gzip estimate is approximately 164 kB. The entire static export remains about 1.01 MB, far below both the assignment bundle cap and the publication response-body budget. This is a build warning, not an omitted asset or failed build.

The reproducible interaction report is [frontend/interactions.json](frontend/interactions.json). It covers disconnected/missing wallet, rejection/retry, wrong chain and unknown-chain add/switch, live balances, native quote/execution encoding, exact pool key and native value, sequential token and Permit2 approvals, skipping sufficient allowances, slippage/amount validation, quote errors and expiry, simulation-before-signing, signature rejection, pending locks, session changes, transfer/revoke/allowance/transferFrom, missing code, uninitialized pool, zero-active-liquidity boundary, corrupted ABI, wrong RPC chain, and reverted receipts. Successful simulations and transaction receipts in these tests are mocks; they do not assert real trade execution.

## Live-chain observations

[frontend/live-read.json](frontend/live-read.json) records both configured public endpoints at block 26,138,738. Each returned Ethereum chain 1 and nonempty code for LaunchToken, PoolManager, UniversalRouter, Quoter, StateView, PositionManager, Permit2 and the initialization hook. The token returned the specified name, symbol HX, 18 decimals, and supply `1000000000000000000000000000` minor units.

Pool ID: `0x711c69baa153949a70e2b9f2724b04d2cc08cee1c9f360bedc6a6fad27e744e4`. The pool was initialized, tick 184216, LP fee 12500, packed protocol fee 0, and active liquidity 0. An `eth_call` quote of 0.0001 ETH returned `9859085587022901712057` HX minor units (about 9859.085587 HX). The sampled reverse quote for 100 HX reverted on both endpoints. This is time-specific evidence, not a standing market price or a promise of liquidity. The app permits a quote at an initialized boundary and requires execution simulation before signing. No funded wallet, real approval, transfer, router execution, gas payment, wallet extension, or live receipt was tested.

## Better Interface consolidated review

The workflow and all six domain cores of the pinned guide were read before implementation; relevant motion/forms/address/transaction guidance was applied during construction. Supporting reference and licenses are listed in [ATTRIBUTION.md](ATTRIBUTION.md).

| Domain | Coverage | Evidence and limitations |
| --- | --- | --- |
| Accessibility | Checked | Native landmarks, one H1, labeled inputs, skip link, native details/select/buttons, alert/status messages, address copy, visible focus, 40–44px controls, paused media. Keyboard skip-link and focused screenshot inspected. Axe scans cover disconnected and connected/expanded states. No full screen-reader session or exhaustive keyboard-only swap was performed. |
| Layout | Checked | Shared alignment, content/control grouping, two-to-one-column layout, addresses/long minimum outputs and full account wrapping. Desktop/mobile/connected 320px and text enlargement passed measured overflow checks. Native zoom, RTL and pseudo-localization unperformed; no translated UI is shipped. |
| Writing | Checked | Verb-first wallet and transaction actions, explicit spender/amount/expiry/minimum, recoverable persistent errors, approved-versus-live status distinction, USD-unavailable context. No invented agent capabilities, prices or publication status. |
| Typography | Checked | System sans plus Georgia italic display; heading hierarchy, bounded prose, readable input size, tabular numbers and full inspectable addresses. Desktop/mobile wrapping inspected. Physical-device font rendering was not tested. |
| Colors | Checked | Semantic tokens, text plus status, focused-state screenshot and measured rendered pairs. Five pairs range 7.92–16.07:1; see [contrast.json](frontend/contrast.json). Axe's incomplete contrast item remains a manual-review limitation; every hover/disabled/focus-adjacency pair was not measured. No alternate theme is implemented. |
| UI | Checked | Distinct pressed direction, loading/disabled/rejected/reverted/confirmed states, card hierarchy, explicit disclosures, shared address component, restrained 150ms transitions. Motion played and paused in Chrome and starts paused with reduced motion. No dialog/focus trap, localization animation or theme switching is applicable. Slow-motion animation-panel review was not performed. |

Axe reports `color-contrast` and `video-caption` as incomplete/manual-review items. The delivered decorative identity video is silent and contains no spoken information; a text label identifies it and playback is optional. There is no essential task information inside it. No claim of complete accessibility compliance is made.

## Findings, fixes and rechecks

Locations refer to final formatted source; the behaviors described as findings were repaired before the final build.

| Severity / domain | Source | Observation and user impact | Fix and recheck |
| --- | --- | --- | --- |
| High / interaction correctness | `web/src/App.tsx:769` | Live active liquidity was zero, but a native-buy quote succeeded. A blanket zero-liquidity gate incorrectly disabled a usable pool direction. | Gate on initialization; show boundary status; require quote/execution simulation. Dedicated boundary test passed and actual live status was inspected. |
| High / UI state | `web/src/App.tsx:860` | Allowance preflight happened before controls were locked, leaving a short double-click preparation window. | Local preflight lock plus global wallet/receipt lock; fields/direction disabled through preparation. Pending and approval tests passed. |
| Medium / writing | `web/src/chain.ts:61` and `:290` | Router simulation initially lacked token custom-error fragments and could surface an unreadable selector. | Include compiler-derived token errors during simulation; translate token, quote, deadline, wallet and router errors; safe text fallback. Simulation failure test passed without sending. |
| Medium / interaction correctness | `web/src/App.tsx:138` and `:1163` | Asynchronous work can complete after a session or delegated-transfer field changes. | Current-session identity guard and review revision counter reject obsolete work. Session invalidation and token action tests passed. |
| Medium / layout and addresses | `web/src/App.tsx:54` | Connected-wallet presentation needed the same full-value/copy behavior as contract rows. | Reuse AddressRow. Connected 320px reflow and accessibility scan passed. |
| Low / packaging | `web/public/media/identity.mp4` | The supplied 5.74 MB media and source/export copies constrained the bundle budget. | Retain the full sequence as a roughly 425 kB local encode plus poster; playback verified; no CDN dependency. |

During test development, the mock initially reused an old “Confirmed” label and a static block height, leading to false failures in approval counting/receipt polling. The tests now wait for the intended sent-call count and advance mocked block numbers. These were test-fixture corrections, not evidence of a successful real transaction.

## Evidence and remaining limitations

- [Desktop page](frontend/desktop.webp), [mobile page](frontend/mobile.webp), [keyboard focus](frontend/keyboard.webp), [connected quote review](frontend/swap-review.webp): production export with mocked reads; displayed market values are test fixtures.
- [Live trade section](frontend/live-trade.webp): actual configured RPC state, disconnected wallet, boundary status. [Browser console](frontend/browser-console.txt): zero final-session errors/warnings.
- [Disconnected accessibility](frontend/accessibility.json), [connected accessibility](frontend/accessibility-connected.json), [rendered contrast](frontend/contrast.json), [live reads](frontend/live-read.json).

Browser coverage is Chrome/Chromium on this worker. Physical mobile, Safari/Firefox, screen-reader use, native zoom, extension-specific signing, EIP-6963 multi-wallet selection on real extensions, chain reorg/replacement behavior and receipt timeouts remain untested. ENS and WalletConnect are not implemented; the app accepts explicit Ethereum addresses and browser wallets. No USD source was supplied. Absolute Open Graph imagery awaits an origin. Allocation/distribution and source-to-bytecode equivalence were not independently audited. Publication/CID/named-site validation belongs to the later control plane and was not run or claimed here.
