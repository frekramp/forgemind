// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ForgeVault} from "../src/ForgeVault.sol";
import {MockYieldStrategy} from "../src/MockYieldStrategy.sol";
import {IYieldStrategy} from "../src/interfaces/IYieldStrategy.sol";

/// Adversarial / edge-case coverage for the vault's money paths.
contract ForgeVaultEdgeTest is Test {
    ForgeVault vault;
    MockYieldStrategy strat;
    address user = address(0xBEEF);
    address attacker = address(0xBAD);

    function setUp() public {
        vault = new ForgeVault(IYieldStrategy(address(0)));
        strat = new MockYieldStrategy(address(vault), 500);
        vault.setStrategy(strat);
        strat.fundRewards{value: 100 ether}();
        vm.deal(user, 1_000 ether);
        vm.deal(attacker, 10 ether);
        vm.deal(address(this), 1_000 ether);
    }

    /// Depositing while already in Grow mode routes funds straight to the strategy.
    function test_DepositDirectlyInGrowMode() public {
        vm.startPrank(user);
        vault.setMode(ForgeVault.Mode.Grow); // empty switch
        vault.deposit{value: 40 ether}();
        vm.stopPrank();
        assertEq(strat.principalOf(user), 40 ether);
        assertEq(vault.stackBalance(user), 0);
    }

    /// Partial withdrawal in Grow leaves remaining principal invested.
    function test_PartialWithdrawGrow() public {
        vm.startPrank(user);
        vault.deposit{value: 100 ether}();
        vault.setMode(ForgeVault.Mode.Grow);
        vm.warp(block.timestamp + 30 days);
        vault.withdraw(30 ether);
        vm.stopPrank();
        assertEq(strat.principalOf(user), 70 ether);
    }

    /// Yield payout can never exceed the reward pool; principal still fully returns.
    function test_ClaimYieldCappedByRewardPool() public {
        ForgeVault v2 = new ForgeVault(IYieldStrategy(address(0)));
        MockYieldStrategy s2 = new MockYieldStrategy(address(v2), 500);
        v2.setStrategy(s2);
        s2.fundRewards{value: 0.001 ether}();

        vm.startPrank(user);
        v2.deposit{value: 100 ether}();
        v2.setMode(ForgeVault.Mode.Grow);
        vm.warp(block.timestamp + 365 days); // ~5 ether accrues, pool only 0.001
        uint256 before = user.balance;
        v2.claimYield();
        uint256 paid = user.balance - before;
        vm.stopPrank();

        assertEq(paid, 0.001 ether); // capped at pool
        assertEq(s2.principalOf(user), 100 ether); // principal intact
        assertEq(s2.rewardPool(), 0);
    }

    /// Switching Grow->Stack returns principal to the safe balance and PAYS OUT accrued
    /// yield immediately (yield is not folded into stackBalance, which tracks principal
    /// only — keeping it consistent with totalValueLocked).
    function test_GrowToStackReturnsPrincipalAndPaysYield() public {
        vm.startPrank(user);
        vault.deposit{value: 100 ether}();
        vault.setMode(ForgeVault.Mode.Grow);
        vm.warp(block.timestamp + 365 days);
        uint256 before = user.balance;
        vault.setMode(ForgeVault.Mode.Stack);
        uint256 yieldPaid = user.balance - before;
        vm.stopPrank();

        assertEq(vault.stackBalance(user), 100 ether); // principal only
        assertApproxEqAbs(yieldPaid, 5 ether, 1e13); // ~5% paid out on the switch
        assertEq(strat.principalOf(user), 0);
    }

    /// Regression: the full balance is withdrawable after a Grow->Stack round trip that
    /// accrued yield. Previously yield was folded into stackBalance without bumping TVL,
    /// so this withdraw underflowed totalValueLocked and stranded the funds.
    function test_WithdrawFullBalanceAfterGrowRoundTrip() public {
        vm.startPrank(user);
        vault.deposit{value: 100 ether}();
        vault.setMode(ForgeVault.Mode.Grow);
        vm.warp(block.timestamp + 365 days);
        vault.setMode(ForgeVault.Mode.Stack);

        uint256 bal = vault.stackBalance(user);
        assertEq(bal, 100 ether);
        uint256 before = user.balance;
        vault.withdraw(bal); // must not revert
        vm.stopPrank();

        assertEq(user.balance - before, 100 ether);
        assertEq(vault.stackBalance(user), 0);
        assertEq(vault.totalValueLocked(), 0); // accounting stays consistent
    }

    /// Re-selecting the current mode is a no-op and moves nothing.
    function test_SetSameModeNoop() public {
        vm.startPrank(user);
        vault.deposit{value: 10 ether}();
        vault.setMode(ForgeVault.Mode.Stack); // already Stack
        vm.stopPrank();
        assertEq(vault.stackBalance(user), 10 ether);
    }

    /// getVaultState returns a coherent snapshot for the agent/UI.
    function test_VaultStateSnapshot() public {
        vm.startPrank(user);
        vault.deposit{value: 20 ether}();
        vault.setHalvingGoal(100 ether);
        vault.setMode(ForgeVault.Mode.Grow);
        vm.stopPrank();
        (
            ForgeVault.Mode m,
            uint256 stack,
            uint256 growP,
            ,
            uint256 total,
            uint256 goal,
            uint256 days_,
            uint256 projected
        ) = vault.getVaultState(user);
        assertEq(uint8(m), uint8(ForgeVault.Mode.Grow));
        assertEq(stack, 0);
        assertEq(growP, 20 ether);
        assertGe(total, 20 ether);
        assertEq(goal, 100 ether);
        assertGt(days_, 0);
        assertGe(projected, total);
    }

    /// The strategy rejects calls from anyone but the vault.
    function test_OnlyVaultCanCallStrategy() public {
        vm.prank(attacker);
        vm.expectRevert(MockYieldStrategy.NotVault.selector);
        strat.deposit{value: 1 ether}(attacker);
    }

    /// Only the owner can swap the strategy.
    function test_OnlyOwnerSetStrategy() public {
        vm.prank(attacker);
        vm.expectRevert(ForgeVault.NotOwner.selector);
        vault.setStrategy(IYieldStrategy(address(0xCAFE)));
    }

    /// Swapping the strategy is blocked while it still custodies principal (no orphaning).
    function test_SetStrategyBlockedWhileFundsInGrow() public {
        vm.startPrank(user);
        vault.deposit{value: 10 ether}();
        vault.setMode(ForgeVault.Mode.Grow); // principal now lives in the strategy
        vm.stopPrank();

        MockYieldStrategy s2 = new MockYieldStrategy(address(vault), 500);
        vm.expectRevert(ForgeVault.StrategyInUse.selector);
        vault.setStrategy(s2);

        // After the user exits Grow, the swap is allowed again.
        vm.prank(user);
        vault.setMode(ForgeVault.Mode.Stack);
        vault.setStrategy(s2);
        assertEq(address(vault.strategy()), address(s2));
    }

    /// withdrawAll exits the full Grow position: all principal + all accrued yield, one call.
    function test_WithdrawAllGrow() public {
        vm.startPrank(user);
        vault.deposit{value: 100 ether}();
        vault.setMode(ForgeVault.Mode.Grow);
        vm.warp(block.timestamp + 365 days);
        uint256 before = user.balance;
        vault.withdrawAll();
        vm.stopPrank();
        assertApproxEqAbs(user.balance - before, 105 ether, 1e13); // 100 principal + ~5 yield
        assertEq(strat.principalOf(user), 0);
        assertEq(vault.totalValueLocked(), 0);
    }

    /// withdrawAll in Stack empties the safe balance.
    function test_WithdrawAllStack() public {
        vm.startPrank(user);
        vault.deposit{value: 30 ether}();
        uint256 before = user.balance;
        vault.withdrawAll();
        vm.stopPrank();
        assertEq(user.balance - before, 30 ether);
        assertEq(vault.stackBalance(user), 0);
    }

    /// withdrawAll on an empty vault reverts rather than no-op'ing.
    function test_WithdrawAllEmptyReverts() public {
        vm.prank(user);
        vm.expectRevert(ForgeVault.ZeroAmount.selector);
        vault.withdrawAll();
    }

    /// withdrawable() reports principal only (no still-accruing yield) in both modes.
    function test_WithdrawableView() public {
        vm.startPrank(user);
        vault.deposit{value: 40 ether}();
        assertEq(vault.withdrawable(user), 40 ether); // stack
        vault.setMode(ForgeVault.Mode.Grow);
        vm.warp(block.timestamp + 365 days);
        vm.stopPrank();
        assertEq(vault.withdrawable(user), 40 ether); // principal only, excludes ~2 yield
        assertGt(vault.balanceOf(user), 40 ether); // balanceOf DOES include pending yield
    }

    /// A partial Grow withdrawal pays only its pro-rata share of yield; the rest stays accruing.
    function test_PartialWithdrawPaysProportionalYield() public {
        vm.startPrank(user);
        vault.deposit{value: 100 ether}();
        vault.setMode(ForgeVault.Mode.Grow);
        vm.warp(block.timestamp + 365 days); // ~5 zkLTC accrued on 100 principal
        uint256 before = user.balance;
        vault.withdraw(50 ether); // half the principal
        uint256 got = user.balance - before;
        vm.stopPrank();

        assertApproxEqAbs(got, 52.5 ether, 1e13); // 50 principal + ~2.5 (half) yield
        assertEq(strat.principalOf(user), 50 ether);
        assertApproxEqAbs(strat.pendingYield(user), 2.5 ether, 1e13); // remaining half still claimable
    }

    /// Zero-value deposit reverts.
    function test_ZeroDepositReverts() public {
        vm.prank(user);
        vm.expectRevert(ForgeVault.ZeroAmount.selector);
        vault.deposit{value: 0}();
    }

    /// Withdrawing more than Grow principal reverts cleanly.
    function test_WithdrawMoreThanGrowPrincipalReverts() public {
        vm.startPrank(user);
        vault.deposit{value: 10 ether}();
        vault.setMode(ForgeVault.Mode.Grow);
        vm.expectRevert(ForgeVault.InsufficientBalance.selector);
        vault.withdraw(11 ether);
        vm.stopPrank();
    }

    /// Two users' balances never bleed into each other.
    function test_MultiUserIsolation() public {
        address u2 = address(0xF00D);
        vm.deal(u2, 100 ether);
        vm.prank(user);
        vault.deposit{value: 10 ether}();
        vm.prank(u2);
        vault.deposit{value: 25 ether}();
        assertEq(vault.balanceOf(user), 10 ether);
        assertEq(vault.balanceOf(u2), 25 ether);
    }

    /// Setting a goal at or below balance reverts; strictly above succeeds.
    function test_GoalBoundary() public {
        vm.startPrank(user);
        vault.deposit{value: 50 ether}();
        vm.expectRevert(ForgeVault.GoalMustExceedBalance.selector);
        vault.setHalvingGoal(50 ether); // equal -> revert
        vault.setHalvingGoal(51 ether); // above -> ok
        vm.stopPrank();
        assertEq(vault.halvingGoal(user), 51 ether);
    }

    receive() external payable {}
}
