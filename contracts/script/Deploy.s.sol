// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ForgeVault} from "../src/ForgeVault.sol";
import {MockYieldStrategy} from "../src/MockYieldStrategy.sol";
import {ForgeProfile} from "../src/ForgeProfile.sol";
import {ForgeActionLog} from "../src/ForgeActionLog.sol";
import {IYieldStrategy} from "../src/interfaces/IYieldStrategy.sol";
import {IForgeVault} from "../src/ForgeProfile.sol";

/// @notice Deploys ForgeVault + MockYieldStrategy + ForgeProfile, wires them, seeds rewards.
/// @dev Run: forge script script/Deploy.s.sol:Deploy --rpc-url liteforge --broadcast
///      Env: PRIVATE_KEY (required), REWARD_SEED (optional wei, default 0.02 ether).
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        uint256 rewardSeed = vm.envOr("REWARD_SEED", uint256(0.02 ether));

        // Optional autonomous keeper address (the server wallet that runs Auto-Pilot on-chain).
        address keeper = vm.envOr("KEEPER_ADDRESS", address(0));

        vm.startBroadcast(pk);
        ForgeVault vault = new ForgeVault(IYieldStrategy(address(0)));
        MockYieldStrategy strat = new MockYieldStrategy(address(vault), 500); // 5% APR
        vault.setStrategy(strat);
        if (rewardSeed > 0) strat.fundRewards{value: rewardSeed}();
        if (keeper != address(0)) vault.setAgent(keeper);
        ForgeProfile profile = new ForgeProfile(IForgeVault(address(vault)));
        // The keeper key is registered as the action log's trusted signer, so the keeper can
        // post cryptographically-attested decisions (logAttested). address(0) => attestation
        // disabled until the owner calls setTrustedSigner.
        ForgeActionLog actionLog = new ForgeActionLog(keeper);
        vm.stopBroadcast();

        console.log("CHAIN_ID         :", block.chainid);
        console.log("ForgeVault       :", address(vault));
        console.log("MockYieldStrategy:", address(strat));
        console.log("ForgeProfile     :", address(profile));
        console.log("ForgeActionLog   :", address(actionLog));
        console.log("Keeper (agent)   :", keeper);
        console.log("Reward seeded    :", rewardSeed);
        console.log("Deploy block     :", block.number);
    }
}
