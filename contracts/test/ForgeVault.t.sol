// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ForgeVault} from "../src/ForgeVault.sol";
import {MockYieldStrategy} from "../src/MockYieldStrategy.sol";
import {IYieldStrategy} from "../src/interfaces/IYieldStrategy.sol";

contract ForgeVaultTest is Test {
    ForgeVault vault;
    MockYieldStrategy strat;
    address user = address(0xABCD);

    function setUp() public {
        vm.deal(address(this), 1_000 ether);
        vault = new ForgeVault(IYieldStrategy(address(0)));
        strat = new MockYieldStrategy(address(vault), 500); // 5% APR
        vault.setStrategy(strat);
        strat.fundRewards{value: 100 ether}();
        vm.deal(user, 1_000 ether);
    }

    function test_DepositStack() public {
        vm.prank(user);
        vault.deposit{value: 10 ether}();
        assertEq(vault.balanceOf(user), 10 ether);
        assertEq(uint8(vault.mode(user)), uint8(ForgeVault.Mode.Stack));
    }

    function test_WithdrawStack() public {
        vm.startPrank(user);
        vault.deposit{value: 10 ether}();
        vault.withdraw(4 ether);
        vm.stopPrank();
        assertEq(vault.balanceOf(user), 6 ether);
    }

    function test_GrowAccruesYield() public {
        vm.startPrank(user);
        vault.deposit{value: 100 ether}();
        vault.setMode(ForgeVault.Mode.Grow);
        vm.stopPrank();
        assertEq(strat.principalOf(user), 100 ether);
        assertEq(vault.stackBalance(user), 0);

        vm.warp(block.timestamp + 365 days);
        uint256 py = strat.pendingYield(user);
        assertApproxEqAbs(py, 5 ether, 1e12); // ~5% of 100
        assertEq(vault.balanceOf(user), 100 ether + py);
    }

    function test_WithdrawGrowReturnsPrincipalPlusYield() public {
        vm.startPrank(user);
        vault.deposit{value: 100 ether}();
        vault.setMode(ForgeVault.Mode.Grow);
        vm.stopPrank();
        vm.warp(block.timestamp + 365 days);

        uint256 before = user.balance;
        vm.prank(user);
        vault.withdraw(100 ether);
        uint256 received = user.balance - before;
        assertApproxEqAbs(received, 105 ether, 1e13);
        assertEq(strat.principalOf(user), 0);
    }

    function test_ModeToggleMovesFunds() public {
        vm.startPrank(user);
        vault.deposit{value: 50 ether}();
        vault.setMode(ForgeVault.Mode.Grow);
        assertEq(vault.stackBalance(user), 0);
        assertEq(strat.principalOf(user), 50 ether);
        vault.setMode(ForgeVault.Mode.Stack);
        vm.stopPrank();
        assertEq(strat.principalOf(user), 0);
        assertApproxEqAbs(vault.stackBalance(user), 50 ether, 1e12);
    }

    function test_SetGoalAndProgress() public {
        vm.startPrank(user);
        vault.deposit{value: 25 ether}();
        vault.setHalvingGoal(100 ether);
        vm.stopPrank();
        (uint256 percent,, uint256 goal,) = vault.getProgress(user);
        assertEq(goal, 100 ether);
        assertEq(percent, 25);
    }

    function test_GoalMustExceedBalance() public {
        vm.startPrank(user);
        vault.deposit{value: 25 ether}();
        vm.expectRevert(ForgeVault.GoalMustExceedBalance.selector);
        vault.setHalvingGoal(20 ether);
        vm.stopPrank();
    }

    function test_ProjectionGrowsInGrowMode() public {
        vm.startPrank(user);
        vault.deposit{value: 100 ether}();
        vault.setMode(ForgeVault.Mode.Grow);
        vm.stopPrank();
        assertGt(vault.getProjectedStack(user), 100 ether);
    }

    function test_ClaimYieldKeepsPrincipal() public {
        vm.startPrank(user);
        vault.deposit{value: 100 ether}();
        vault.setMode(ForgeVault.Mode.Grow);
        vm.stopPrank();
        vm.warp(block.timestamp + 365 days);

        uint256 before = user.balance;
        vm.prank(user);
        vault.claimYield();
        assertApproxEqAbs(user.balance - before, 5 ether, 1e13);
        assertEq(strat.principalOf(user), 100 ether); // principal untouched
    }

    function test_RevertWithdrawTooMuch() public {
        vm.startPrank(user);
        vault.deposit{value: 5 ether}();
        vm.expectRevert(ForgeVault.InsufficientBalance.selector);
        vault.withdraw(6 ether);
        vm.stopPrank();
    }

    receive() external payable {}
}
