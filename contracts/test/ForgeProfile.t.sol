// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ForgeVault} from "../src/ForgeVault.sol";
import {MockYieldStrategy} from "../src/MockYieldStrategy.sol";
import {ForgeProfile, IForgeVault} from "../src/ForgeProfile.sol";
import {IYieldStrategy} from "../src/interfaces/IYieldStrategy.sol";

contract ForgeProfileTest is Test {
    ForgeVault vault;
    MockYieldStrategy strat;
    ForgeProfile profile;
    address user = address(0xBEEF);

    function setUp() public {
        vault = new ForgeVault(IYieldStrategy(address(0)));
        strat = new MockYieldStrategy(address(vault), 500);
        vault.setStrategy(strat);
        strat.fundRewards{value: 100 ether}();
        profile = new ForgeProfile(IForgeVault(address(vault)));
        vm.deal(user, 1_000 ether);
        vm.deal(address(this), 1_000 ether);
    }

    function test_FirstForgeMission() public {
        vm.startPrank(user);
        vault.deposit{value: 1 ether}();
        assertTrue(profile.missionMet(user, 0));
        profile.claimMission(0);
        vm.stopPrank();
        assertEq(profile.xp(user), 100);
        assertTrue(profile.claimed(user, 0));
    }

    function test_StackerMissionThreshold() public {
        vm.startPrank(user);
        vault.deposit{value: 5 ether}();
        assertFalse(profile.missionMet(user, 1)); // < 10
        vault.deposit{value: 5 ether}();
        assertTrue(profile.missionMet(user, 1)); // == 10 lifetime
        profile.claimMission(1);
        vm.stopPrank();
        assertEq(profile.xp(user), 200);
    }

    function test_GoalAndHalfwayMissions() public {
        vm.startPrank(user);
        vault.deposit{value: 60 ether}();
        vault.setHalvingGoal(100 ether);
        assertTrue(profile.missionMet(user, 2)); // goal set
        assertTrue(profile.missionMet(user, 3)); // 60*2 >= 100
        profile.claimMission(2);
        profile.claimMission(3);
        vm.stopPrank();
        assertEq(profile.xp(user), 400);
    }

    function test_YieldFarmerMission() public {
        vm.startPrank(user);
        vault.deposit{value: 1 ether}();
        assertFalse(profile.missionMet(user, 4)); // Stack mode
        vault.setMode(ForgeVault.Mode.Grow);
        assertTrue(profile.missionMet(user, 4));
        profile.claimMission(4);
        vm.stopPrank();
        assertEq(profile.xp(user), 150);
    }

    function test_CannotClaimUnmet() public {
        vm.prank(user);
        vm.expectRevert(ForgeProfile.MissionNotMet.selector);
        profile.claimMission(0); // never deposited
    }

    function test_CannotDoubleClaim() public {
        vm.startPrank(user);
        vault.deposit{value: 1 ether}();
        profile.claimMission(0);
        vm.expectRevert(ForgeProfile.AlreadyClaimed.selector);
        profile.claimMission(0);
        vm.stopPrank();
    }

    function test_UnknownMissionReverts() public {
        vm.prank(user);
        vm.expectRevert(ForgeProfile.UnknownMission.selector);
        profile.claimMission(9);
    }

    function test_LevelFromXp() public {
        vm.startPrank(user);
        vault.deposit{value: 60 ether}();
        vault.setHalvingGoal(100 ether);
        profile.claimMission(0); // 100
        profile.claimMission(2); // +100 = 200
        assertEq(profile.levelOf(user), 1); // <250
        profile.claimMission(3); // +300 = 500
        vm.stopPrank();
        assertEq(profile.levelOf(user), 3); // 1 + 500/250
    }

    function test_UsernameAndRegistry() public {
        vm.prank(user);
        profile.setUsername("satoshi_jr");
        assertEq(profile.username(user), "satoshi_jr");
        assertEq(profile.usersLength(), 1);
        assertEq(profile.getUsers(0, 10)[0], user);
    }

    function test_UsernameTooLong() public {
        vm.prank(user);
        vm.expectRevert(ForgeProfile.UsernameTooLong.selector);
        profile.setUsername("this-username-is-definitely-way-too-long-to-fit");
    }

    function test_ProfileOfSnapshot() public {
        vm.startPrank(user);
        vault.deposit{value: 1 ether}();
        profile.claimMission(0);
        vm.stopPrank();
        (uint256 totalXp, uint256 level, uint256 claimedCount, bool[] memory met, bool[] memory done) =
            profile.profileOf(user);
        assertEq(totalXp, 100);
        assertEq(level, 1);
        assertEq(claimedCount, 1);
        assertEq(met.length, 5);
        assertTrue(done[0]);
        assertFalse(done[1]);
    }

    function test_RegistryDedupes() public {
        vm.startPrank(user);
        vault.deposit{value: 1 ether}();
        profile.claimMission(0);
        profile.setUsername("x");
        vm.stopPrank();
        assertEq(profile.usersLength(), 1); // claim + username, still one entry
    }

    receive() external payable {}
}
