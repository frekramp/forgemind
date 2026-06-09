// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ForgeVault} from "../src/ForgeVault.sol";
import {MockYieldStrategy} from "../src/MockYieldStrategy.sol";
import {IYieldStrategy} from "../src/interfaces/IYieldStrategy.sol";

/// Coverage for the new global aggregates (registry + TVL) powering analytics/leaderboard.
contract ForgeVaultAggregatesTest is Test {
    ForgeVault vault;
    MockYieldStrategy strat;
    address a = address(0xA11CE);
    address b = address(0xB0B);

    function setUp() public {
        vault = new ForgeVault(IYieldStrategy(address(0)));
        strat = new MockYieldStrategy(address(vault), 500);
        vault.setStrategy(strat);
        strat.fundRewards{value: 100 ether}();
        vm.deal(a, 1_000 ether);
        vm.deal(b, 1_000 ether);
    }

    function test_RegistryGrowsOncePerUser() public {
        vm.prank(a);
        vault.deposit{value: 10 ether}();
        vm.prank(a);
        vault.deposit{value: 5 ether}(); // second deposit, same user
        assertEq(vault.usersLength(), 1);
        vm.prank(b);
        vault.deposit{value: 3 ether}();
        assertEq(vault.usersLength(), 2);
        assertEq(vault.users(0), a);
        assertEq(vault.users(1), b);
    }

    function test_TvlTracksPrincipal() public {
        vm.prank(a);
        vault.deposit{value: 10 ether}();
        vm.prank(b);
        vault.deposit{value: 30 ether}();
        assertEq(vault.totalValueLocked(), 40 ether);
        vm.prank(a);
        vault.withdraw(4 ether);
        assertEq(vault.totalValueLocked(), 36 ether);
    }

    function test_TvlUnchangedByModeSwitchAndYield() public {
        vm.startPrank(a);
        vault.deposit{value: 100 ether}();
        vault.setMode(ForgeVault.Mode.Grow);
        vm.warp(block.timestamp + 365 days);
        vault.claimYield(); // yield from reward pool, not TVL
        vm.stopPrank();
        assertEq(vault.totalValueLocked(), 100 ether);
    }

    function test_GlobalStats() public {
        vm.prank(a);
        vault.deposit{value: 10 ether}();
        vm.prank(b);
        vault.deposit{value: 20 ether}();
        (uint256 tvl, uint256 userCount, uint256 aprBps_, uint256 days_) = vault.globalStats();
        assertEq(tvl, 30 ether);
        assertEq(userCount, 2);
        assertEq(aprBps_, 500);
        assertGt(days_, 0);
    }

    function test_GetUsersPagination() public {
        vm.prank(a);
        vault.deposit{value: 1 ether}();
        vm.prank(b);
        vault.deposit{value: 1 ether}();
        address[] memory page = vault.getUsers(0, 1);
        assertEq(page.length, 1);
        assertEq(page[0], a);
        address[] memory page2 = vault.getUsers(1, 10);
        assertEq(page2.length, 1);
        assertEq(page2[0], b);
        address[] memory empty = vault.getUsers(5, 10);
        assertEq(empty.length, 0);
    }

    receive() external payable {}
}
