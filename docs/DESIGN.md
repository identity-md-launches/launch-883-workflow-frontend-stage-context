# HX implemented design

## Overview

HX introduces an AI agent company and lets visitors inspect and use its Ethereum token. The page uses a quiet, dark green surface, warm white typography and a pale lime action color. Its order is identity → token facts → purpose → swap → advanced token tools → deployment provenance. The supplied animated identity is central to the hero. This visual direction is an implementation choice inferred from the brief, not a separately approved brand system.

This document is under `docs/` because the assignment's overriding write budget prohibits root files, including the separately requested root `DESIGN.md`. The source of truth is `web/src/style.css` and the components in `web/src/App.tsx`.

## Colors

All component colors use semantic custom properties in `style.css:1`.

| Semantic token | Primitive / exact value | Role |
| --- | --- | --- |
| `--bg` | `--green-950: #101916` | Page and on-accent text |
| `--surface` | `--green-900: #18231e` | Swap card and disclosures |
| `--field` | `--green-800: #243128` | Inputs, selected direction and notices |
| `--border` | `--green-700: #405044` | Structural separators |
| `--text` | `--stone-50: #f4f3e9` | Primary text |
| `--muted` | `--stone-300: #c0c8bc` | Supporting text and captions |
| `--accent`, `--focus` | `--lime-200: #d4f3a0` | Primary actions and keyboard outline |
| `--accent-hover` | `--lime-300: #bddc89` | Primary-action hover |
| `--on-accent` | `--green-950: #101916` | Text on lime |
| `--error` | `--red-200: #ffb8ac` | Persistent error messages |

This is a deliberately dark-only identity; there is no misleading theme control. Status always includes text. Normal body/page contrast measured 16.07:1, muted/page 10.43:1, primary-action text/fill 14.61:1, badge/card 9.42:1 and field-label/field 7.92:1. See `frontend/contrast.json` for the computed rendered colors and unrounded ratios. These are specific measured pairs, not a claim that every state passes.

## Typography

Body: Arial, Helvetica, sans-serif at 16px, weight 400, line height 1.6. No remote fonts or font dependencies. The hero's italic word uses Georgia, Times New Roman, serif. Browser/system fonts supply their normal, italic and bold variants.

The implemented semantic scale is `--body: 1rem`, `--small: .8125rem`, `--label: .75rem`, `--title: clamp(2rem, 3.4vw, 3rem)`, and `--display: clamp(3.5rem, 6.7vw, 6.25rem)`. H1 has 1.02 line height and -.065em tracking; H2 has 1.12 line height and -.035em tracking. UI headings descend to 1.5rem. Eyebrows are uppercase through CSS, with .13em letter spacing. Buttons are .875rem and semibold. Form fields stay at 1rem or larger, including mobile.

Changing amounts use tabular numerals. Addresses/hashes use Courier New/monospace at .8125rem, remain selectable and wrap where needed. Headings use balanced wrapping, prose uses pretty wrapping, purpose copy is capped at 55ch and deployment explanation at 75ch. Exact minimum output and token-tool amounts use all necessary decimals; compact balances retain full tiny nonzero values.

## Layout

The shared page width is `min(1232px, calc(100% - 96px))`. Hero and content sections use two equal columns with a 4rem gap. The token-fact strip uses four columns. Main section spacing is 5–5.5rem, grouped controls typically use .5–1.5rem spacing, and the swap card has 1.5rem padding.

At 64rem, side gutters become 28px, column gaps 2.5rem and the stats become two columns. At 48rem, gutters are 20px, header navigation wraps to its own row, hero/content become one column, and sections use 3rem vertical padding. At 24rem, gutters are 16px, stats become one column, and card padding/amount type reduce. The full account remains in the trade card even when the compact header account is hidden. Addresses wrap; token units remain grouped.

Browser evidence covers widths 320, 390, 768 and 1440px, plus a separate 1280px tool session. No horizontal page overflow was measured. Connected quote/expanded tools also passed at 320px. Root font enlargement to 32px at 768px passed reflow; this is not native browser 200% zoom.

## Elevation & Depth

The design is mostly flat with structural borders. The swap card has `0 8px 28px rgb(0 0 0 / .12)` shadow. Surface/field colors separate controls from reading content. The media frame has a 1px white outline at 10% opacity. No dialogs, modal overlays, sticky action bars, or page-load animation are implemented.

## Shapes

The motion frame uses a 12px radius, swap card 14px, amount fields 8px, actions 7px, ordinary inputs/notices 6px, and badges 4px. Coin symbols are round; small status dots are 6px. Media uses centered `object-fit: cover`, square on desktop and 1.1 aspect ratio on mobile. The shipped video retains its original wide frame; the hero frame crops its edges visually.

## Components

All components are local patterns in `web/src/App.tsx`, not a separate public UI library.

| Pattern | Purpose and states |
| --- | --- |
| `External` | Ordinary destination link, new tab with `noreferrer`, decorative arrow |
| `AddressRow` | Full checksummed address, explorer destination, Copy/Copied state and clipboard failure fallback; used for contracts and connected wallet |
| `Motion` | Poster plus supplied local video, explicit Play/Pause, failed playback message; paused by default for all visitors |
| `Swap` | Buy/Sell pressed buttons, labeled amount/slippage, quote output, minimum and rate; connect → switch → quote → required approvals → confirmed swap |
| `TokenTools` | Native details/summary; select action, labeled fields, inline validation, explicit review/confirm and cancellation |
| Transaction status | Stable pending/confirmed/rejected/reverted text with explorer hash; one global write lock through the receipt |
| Deployment disclosure | Full pool key, pool ID, source commit, attestation, ABI and network routing addresses |

Buttons normally have at least 44px height; compact media/copy controls use 40px. Focus uses a 2px lime outline offset 4px; forced-colors mode uses system Highlight. Native links/buttons/select/details support keyboard behavior; a visible-on-focus skip link precedes the header. Errors are persistent alerts and linked to inputs; status messages use polite status roles. State is never represented solely by color.

Only hover background and press transform animate, at 150ms ease-out, inside `prefers-reduced-motion: no-preference`. Press scale is .96. Video never autoplays, and its toggle updates its visible label.

## Do's and Don'ts

Start another section from `.section-grid`, `.eyebrow`, H2 and bounded prose. Use `.primary` for its single main action, `.quiet` for secondary controls, semantic color tokens for state, and `AddressRow` for contract addresses. Keep the source order useful when stacked. Keep trading facts separate from explanatory prose.

Do not hardcode deployment addresses in components, imply successful transactions before a receipt, replace readable status with colored dots, or turn the media into autoplay. Keep full values accessible behind any compact display. Do not label the 88% policy as an independently verified distribution or zero active liquidity as proof that no trade can execute.
