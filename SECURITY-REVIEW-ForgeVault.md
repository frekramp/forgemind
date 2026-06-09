# Security & Correctness Review: ForgeVault

**Scope:** `contracts/src/ForgeVault.sol`, `MockYieldStrategy.sol`, `interfaces/IYieldStrategy.sol`
**Focus:** money paths — deposit, withdraw, mode switching, yield, keeper authority
**Date:** 2026-06-09

## Summary

The vault is well-architected for a money-handling contract. Reentrancy hygiene is strong, the accounting follows checks-effects-interactions, and the principal/yield design is **solvent by construction**: principal is custodied 1:1 as native value and yield payouts are capped by the reward pool, so a yield shortfall can never block a principal withdrawal. Test coverage is broad (vault, edge cases, aggregates, agent, profile, action log).

The remaining risk is **governance centralization**, not contract logic. The most important fix before handling real money is making ownership rotatable. Logic-level issues are limited to a few edge cases.

## Critical Issues

| # | File | Line | Issue | Severity |
|---|------|------|-------|----------|
| 1 | ForgeVault.sol | 46, 86–89 | `owner` is set once in the constructor and has **no transfer or renounce path**. If the key is lost, `setStrategy`/`setAgent` are frozen forever; if it's compromised, the attacker controls the strategy pointer (and thus the contract users read balances from). Single point of failure. | 🔴 High |
| 2 | ForgeVault.sol | 94–98, 248–253 | The vault **fully trusts `strategy`** for `balanceOf`/`withdrawable`/`principalOf`, and the owner can swap it. Combined with #1, the owner is an unchecked single point of control over user funds. | 🟠 Medium-High |

## Suggestions

| # | File | Line | Suggestion | Category |
|---|------|------|------------|----------|
| 3 | ForgeVault.sol | 173, 358–361 | `_setModeFor` (Grow→Stack) **force-pushes** yield via `_send`. A contract user whose `receive()` reverts blocks their own rebalance — including an `agentSetMode` the keeper attempts on their behalf. Consider a **pull-payment** pattern (credit a `claimable` balance, let the user pull) so a hostile/contract recipient can't brick rebalancing. | Correctness |
| 4 | MockYieldStrategy.sol | 125–131 | On a **full-principal exit when `rewardPool` can't cover** the owed yield, `pay` is capped at the pool and the residual stays in `_accrued[user]` for a user who now has 0 principal. It's only recoverable later via `claimYield` if the pool is refilled — and `_live` returns 0 once principal is 0. Document this, or sweep the remainder. | Accounting |
| 5 | test/ForgeReentrancy.t.sol | 57 | The only explicit malicious-reentrancy test is for `agentClaimYield`. Add one that re-enters `withdraw`/`withdrawAll` from a malicious recipient's `receive()` to lock in the `nonReentrant` guarantee on the primary user path. | Test coverage |
| 6 | ForgeVault.sol | 272 | `getProgress` percent uses integer division — reads 99% when essentially complete. Cosmetic (view only). | Style |
| 7 | ForgeVault.sol | 94–98 | After the owner swaps strategy (allowed only at zero principal), a user's `mode` can still read `Grow`. Behavior is benign (next deposit routes to the new strategy, `principalOf` reads 0), but worth a comment. | Maintainability |

## What Looks Good

- **`nonReentrant` on every fund-moving entrypoint** — `deposit`, `withdraw`, `withdrawAll`, `setMode`, `claimYield`, `agentClaimYield`, `agentSetMode`.
- **Checks-effects-interactions** is respected: state is updated before native sends in stack paths, and `MockYieldStrategy.withdraw` does its external transfer last, after decrementing principal.
- **Solvent by construction:** principal held 1:1; `_payYield` caps payout at `rewardPool`, so the strategy never tries to send more than it holds and principal withdrawals can't be starved by a yield shortfall.
- **TVL tracks principal only**, deliberately excluding unrealized yield — this avoids the underflow the comments call out at lines 168–172.
- **Keeper authority is well-contained:** opt-in, expiry-gated, revocable, separate compound/rebalance grants, and the keeper can only move a user's *own* funds — never extract.
- Fixed pragma `0.8.24` (built-in overflow checks), custom errors, thorough events, and a paginated user registry with **no unbounded on-chain loops**.

## Verdict

**Request changes** — the logic is sound, but address governance (#1, ideally #2 via a timelock + multisig owner) before mainnet. Items #3–#5 are worth fixing; #6–#7 are polish.

> Note: tests were reviewed statically rather than executed for this review. Run `forge test` locally to confirm the suite is green, and add the reentrancy test from #5.
