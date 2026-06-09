// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ForgeVault} from "../src/ForgeVault.sol";
import {MockYieldStrategy} from "../src/MockYieldStrategy.sol";
import {IYieldStrategy} from "../src/interfaces/IYieldStrategy.sol";

/// Coverage for the autonomous keeper: opt-in grants, capped/expiring/revocable, and the
/// guarantee that the keeper can only ever move a user's OWN funds (yield to them, or mode).
contract ForgeAgentTest is Test {
    ForgeVault vault;
    MockYieldStrategy strat;
    address user = address(0xBEEF);
    address keeper = address(0xA9E27); // the autonomous agent
    address attacker = address(0xBAD);

    function setUp() public {
        vault = new ForgeVault(IYieldStrategy(address(0)));
        strat = new MockYieldStrategy(address(vault), 500);
        vault.setStrategy(strat);
        strat.fundRewards{value: 100 ether}();
        vault.setAgent(keeper);
        vm.deal(user, 1_000 ether);
    }

    function _depositAndGrow(uint256 amount) internal {
        vm.startPrank(user);
        vault.deposit{value: amount}();
        vault.setMode(ForgeVault.Mode.Grow);
        vm.stopPrank();
    }

    function test_OnlyOwnerSetsAgent() public {
        vm.prank(attacker);
        vm.expectRevert(ForgeVault.NotOwner.selector);
        vault.setAgent(attacker);
    }

    function test_AuthorizeAndRevoke() public {
        vm.prank(user);
        vault.authorizeAgent(true, true, uint64(block.timestamp + 1 days));
        assertTrue(vault.agentCan(user, false));
        assertTrue(vault.agentCan(user, true));

        vm.prank(user);
        vault.revokeAgent();
        assertFalse(vault.agentCan(user, false));
        assertFalse(vault.agentCan(user, true));
    }

    function test_AgentCompoundsYieldToUser() public {
        _depositAndGrow(100 ether);
        vm.prank(user);
        vault.authorizeAgent(true, false, uint64(block.timestamp + 400 days)); // outlasts the warp
        vm.warp(block.timestamp + 365 days); // ~5 yield

        uint256 before = user.balance;
        vm.prank(keeper);
        vault.agentClaimYield(user);
        assertApproxEqAbs(user.balance - before, 5 ether, 1e13); // yield went to the USER
        assertEq(strat.principalOf(user), 100 ether); // principal untouched
    }

    function test_AgentRebalancesUserMode() public {
        vm.prank(user);
        vault.deposit{value: 40 ether}(); // Stack
        vm.prank(user);
        vault.authorizeAgent(false, true, uint64(block.timestamp + 1 days));

        vm.prank(keeper);
        vault.agentSetMode(user, ForgeVault.Mode.Grow);
        assertEq(uint8(vault.mode(user)), uint8(ForgeVault.Mode.Grow));
        assertEq(strat.principalOf(user), 40 ether);
    }

    function test_NonAgentCannotAct() public {
        _depositAndGrow(10 ether);
        vm.prank(user);
        vault.authorizeAgent(true, true, uint64(block.timestamp + 1 days));

        vm.prank(attacker);
        vm.expectRevert(ForgeVault.NotAgent.selector);
        vault.agentClaimYield(user);

        vm.prank(attacker);
        vm.expectRevert(ForgeVault.NotAgent.selector);
        vault.agentSetMode(user, ForgeVault.Mode.Stack);
    }

    function test_AgentNeedsGrant() public {
        _depositAndGrow(10 ether);
        // no authorization at all
        vm.prank(keeper);
        vm.expectRevert(ForgeVault.AgentNotAuthorized.selector);
        vault.agentClaimYield(user);
    }

    function test_CompoundGrantDoesNotAllowRebalance() public {
        _depositAndGrow(10 ether);
        vm.prank(user);
        vault.authorizeAgent(true, false, uint64(block.timestamp + 1 days)); // compound only

        vm.prank(keeper);
        vm.expectRevert(ForgeVault.AgentNotAuthorized.selector);
        vault.agentSetMode(user, ForgeVault.Mode.Stack);
    }

    function test_ExpiredGrantRejected() public {
        _depositAndGrow(10 ether);
        vm.prank(user);
        vault.authorizeAgent(true, true, uint64(block.timestamp + 1 hours));
        vm.warp(block.timestamp + 2 hours); // expired

        assertFalse(vault.agentCan(user, false));
        vm.prank(keeper);
        vm.expectRevert(ForgeVault.AgentNotAuthorized.selector);
        vault.agentClaimYield(user);
    }

    function test_RevokeStopsKeeper() public {
        _depositAndGrow(100 ether);
        vm.prank(user);
        vault.authorizeAgent(true, true, uint64(block.timestamp + 60 days)); // still valid after the warp
        vm.warp(block.timestamp + 30 days);

        vm.prank(user);
        vault.revokeAgent(); // so the rejection below is due to revoke, not expiry

        vm.prank(keeper);
        vm.expectRevert(ForgeVault.AgentNotAuthorized.selector);
        vault.agentClaimYield(user);
    }

    /// The user can always still act for themselves regardless of agent grants.
    function test_UserStillSelfManages() public {
        _depositAndGrow(50 ether);
        vm.warp(block.timestamp + 365 days);
        uint256 before = user.balance;
        vm.prank(user);
        vault.claimYield();
        assertGt(user.balance, before);
    }

    receive() external payable {}
}
