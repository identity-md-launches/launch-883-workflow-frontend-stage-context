# Design and interface references

The implementation applied the supplied pinned Better Interface and eth-frontend-ux guides; those files were treated as reference data within this assignment's scope.

- Better Interface design guidance: Jakub Krehel, commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`, MIT. License: [better-interface.txt](licenses/better-interface.txt).
- Implemented-design documentation method: Paul Bakaus, Impeccable, commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`, Apache-2.0. The included combined license retains the Apache license. Source: [Impeccable document reference](https://github.com/pbakaus/impeccable/blob/9d715cc4f5564a990ca8345abfdd5df6dc9b41c8/skill/reference/document.md). Applied to this site's source rather than reproduced as a guide.
- Ethereum frontend UX guidance: Austin Griffith, ethskills, commit `06ea4efa08076ff04f6ca4945ef4a2ca881115b0`. MIT. License: [eth-frontend-ux.txt](licenses/eth-frontend-ux.txt). No live ethskills pages were fetched.

Protocol interface definitions and encoding were checked against primary Uniswap sources on 2026-10-07:

- [Uniswap v4 swapping guide](https://developers.uniswap.org/docs/protocols/v4/guides/swapping/swapping)
- [IV4Quoter](https://github.com/Uniswap/v4-periphery/blob/main/src/interfaces/IV4Quoter.sol)
- [IStateView](https://github.com/Uniswap/v4-periphery/blob/main/src/interfaces/IStateView.sol)
- [BaseV4Quoter](https://github.com/Uniswap/v4-periphery/blob/main/src/base/BaseV4Quoter.sol)
- [QuoterRevert](https://github.com/Uniswap/v4-periphery/blob/main/src/libraries/QuoterRevert.sol)
- [IUniversalRouter](https://github.com/Uniswap/universal-router/blob/main/contracts/interfaces/IUniversalRouter.sol)

These sources informed protocol interface fragments only. All protocol deployment addresses come from the supplied network handoff. The token ABI comes from the pinned repository implementation export, not a block explorer or a handwritten substitute.
