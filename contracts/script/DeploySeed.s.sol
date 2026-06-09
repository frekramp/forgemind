// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ForgeVault} from "../src/ForgeVault.sol";
import {MockYieldStrategy} from "../src/MockYieldStrategy.sol";
import {ForgeProfile} from "../src/ForgeProfile.sol";
import {ForgeActionLog} from "../src/ForgeActionLog.sol";
import {IYieldStrategy} from "../src/interfaces/IYieldStrategy.sol";
import {IForgeVault} from "../src/ForgeProfile.sol";

/// @notice Deploys the full stack AND seeds REAL on-chain proof: a handful of genuine vault
///         actions (Deposited / GoalSet / ModeChanged events power the Activity feed) plus a
///         realistic agent-decision ledger — including cryptographically ✓Verified entries
///         (logAttested) signed by the deployer-as-trusted-signer. After this runs, the live
///         app shows real (not demo) on-chain activity and a verifiable "why" trail.
///
/// @dev    The deployer acts as BOTH the user and the agent/keeper signer (simplest single-key
///         setup for a hackathon demo). Run:
///           forge script script/DeploySeed.s.sol:DeploySeed --rpc-url liteforge --broadcast
///         Env: PRIVATE_KEY (required, funded). Optional overrides (wei):
///           REWARD_SEED (0.01e18), SEED_DEPOSIT (0.005e18), SEED_GOAL (0.05e18).
///         Needs ~REWARD_SEED + 2*SEED_DEPOSIT + gas (~0.025 zkLTC by default).
contract DeploySeed is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address me = vm.addr(pk);
        uint256 rewardSeed = vm.envOr("REWARD_SEED", uint256(0.01 ether));
        uint256 dep = vm.envOr("SEED_DEPOSIT", uint256(0.005 ether));
        uint256 goal = vm.envOr("SEED_GOAL", uint256(0.05 ether));

        uint256 startBlock = block.number; // lower bound for the frontend's event-log scan

        vm.startBroadcast(pk);

        // --- deploy + wire ---
        ForgeVault vault = new ForgeVault(IYieldStrategy(address(0)));
        MockYieldStrategy strat = new MockYieldStrategy(address(vault), 500); // 5% APR
        vault.setStrategy(strat);
        if (rewardSeed > 0) strat.fundRewards{value: rewardSeed}();
        vault.setAgent(me); // deployer doubles as the keeper so "Run keeper now" works
        ForgeProfile profile = new ForgeProfile(IForgeVault(address(vault)));
        // Trusted signer = deployer, so the seed can post ✓Verified (attested) decisions.
        ForgeActionLog log = new ForgeActionLog(me);

        // --- seed REAL activity (vault events) + a decision ledger (action log) ---
        uint256 n = 0; // attestation nonce for `me` (self log() does not consume it)

        vault.deposit{value: dep}(); // Deposited (Stack)
        log.log(ForgeActionLog.Kind.Deposit, ForgeActionLog.Engine.Manual, dep, "Initial deposit");

        vault.setHalvingGoal(goal); // GoalSet
        _attest(log, pk, me, ForgeActionLog.Kind.SetGoal, ForgeActionLog.Engine.Claude, goal,
            "Set a halving goal above current balance to track pace", n++);

        vault.setMode(ForgeVault.Mode.Grow); // ModeChanged (Stack -> Grow)
        _attest(log, pk, me, ForgeActionLog.Kind.SetMode, ForgeActionLog.Engine.Claude, 0,
            "Projected short of goal in Stack - Grow closes the gap", n++);

        vault.deposit{value: dep}(); // Deposited (Grow)
        _attest(log, pk, me, ForgeActionLog.Kind.Deposit, ForgeActionLog.Engine.Claude, dep,
            "DCA top-up toward the halving goal", n++);

        _attest(log, pk, me, ForgeActionLog.Kind.AutoCompound, ForgeActionLog.Engine.Rules, 0,
            "Auto-Compound armed: claim yield once it clears the threshold", n++);

        vm.stopBroadcast();

        console.log("CHAIN_ID                       :", block.chainid);
        console.log("NEXT_PUBLIC_VAULT_ADDRESS      :", address(vault));
        console.log("NEXT_PUBLIC_STRATEGY_ADDRESS   :", address(strat));
        console.log("NEXT_PUBLIC_PROFILE_ADDRESS    :", address(profile));
        console.log("NEXT_PUBLIC_ACTIONLOG_ADDRESS  :", address(log));
        console.log("NEXT_PUBLIC_VAULT_DEPLOY_BLOCK :", startBlock);
        console.log("NEXT_PUBLIC_ACTIONLOG_DEPLOY_BLOCK:", startBlock);
        console.log("Decisions seeded (1 manual + 4 attested):", log.total());
        console.log("Keeper/trusted signer (deployer):", me);
    }

    /// @dev Builds the exact digest ForgeActionLog verifies, signs it with `pk`, and submits
    ///      the attested decision. Mirrors ForgeActionLog.t.sol::_sign (proven by the suite).
    function _attest(
        ForgeActionLog log,
        uint256 pk,
        address actor,
        ForgeActionLog.Kind kind,
        ForgeActionLog.Engine engine,
        uint256 amount,
        string memory reason,
        uint256 nonce
    ) internal {
        bytes32 structHash = keccak256(
            abi.encode(
                actor, uint8(kind), uint8(engine), amount, keccak256(bytes(reason)), nonce, block.chainid, address(log)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        log.logAttested(actor, kind, engine, amount, reason, nonce, abi.encodePacked(r, s, v));
    }
}
