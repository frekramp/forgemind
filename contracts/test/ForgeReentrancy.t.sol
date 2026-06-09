// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ForgeVault} from "../src/ForgeVault.sol";
import {MockYieldStrategy} from "../src/MockYieldStrategy.sol";
import {IYieldStrategy} from "../src/interfaces/IYieldStrategy.sol";

/// A malicious user contract that re-enters the vault when it receives funds.
contract Reentrant {
    ForgeVault public vault;
    bool public armed;

    constructor(ForgeVault _vault) {
        vault = _vault;
    }

    function deposit() external payable {
        vault.deposit{value: msg.value}();
    }

    function grow() external {
        vault.setMode(ForgeVault.Mode.Grow);
    }

    function authorize() external {
        vault.authorizeAgent(true, true, uint64(block.timestamp + 365 days));
    }

    function arm() external {
        armed = true;
    }

    // Re-enter on receiving yield/principal.
    receive() external payable {
        if (armed) {
            armed = false;
            vault.claimYield(); // attempt re-entry
        }
    }
}

/// Confirms the nonReentrant guard holds on the autonomous-keeper payout path.
contract ForgeReentrancyTest is Test {
    ForgeVault vault;
    MockYieldStrategy strat;
    address keeper = address(0xA9E27);

    function setUp() public {
        vault = new ForgeVault(IYieldStrategy(address(0)));
        strat = new MockYieldStrategy(address(vault), 500);
        vault.setStrategy(strat);
        strat.fundRewards{value: 100 ether}();
        vault.setAgent(keeper);
    }

    function test_AgentClaimYieldBlocksReentrancy() public {
        Reentrant attacker = new Reentrant(vault);
        vm.deal(address(attacker), 100 ether);
        attacker.deposit{value: 100 ether}();
        attacker.grow();
        attacker.authorize();
        vm.warp(block.timestamp + 365 days); // accrue yield
        attacker.arm();

        // Keeper triggers a yield payout to the attacker; its receive() re-enters → the whole
        // call must revert (the guard prevents any double-spend).
        vm.prank(keeper);
        vm.expectRevert();
        vault.agentClaimYield(address(attacker));

        // Nothing leaked: principal still custodied, reward pool intact.
        assertEq(strat.principalOf(address(attacker)), 100 ether);
        assertEq(strat.rewardPool(), 100 ether);
    }
}
