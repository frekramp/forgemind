// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ForgeActionLog} from "../src/ForgeActionLog.sol";

/// @notice Seeds REAL agent decisions into an ALREADY-DEPLOYED ForgeActionLog — e.g. one you
///         deployed via Dappit. Writes one self-attested manual entry plus four cryptographically
///         ✓Verified entries (Claude/Rules), so the on-chain ledger (and the Decisions tab) shows
///         genuine, verifiable data. No funds move; amounts are informational labels only.
///
/// @dev    Your deployer key MUST be the contract's `trustedSigner` (the `initialSigner`
///         constructor arg you set in Dappit) for the attested entries to be accepted.
///         Run:
///           ACTIONLOG_ADDRESS=0xYourDappitContract \
///           forge script script/SeedActionLog.s.sol:SeedActionLog --rpc-url liteforge --broadcast
contract SeedActionLog is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address me = vm.addr(pk);
        ForgeActionLog log = ForgeActionLog(vm.envAddress("ACTIONLOG_ADDRESS"));

        uint256 n = 0; // attestation nonce for `me` (self log() doesn't consume it)
        vm.startBroadcast(pk);

        log.log(ForgeActionLog.Kind.Deposit, ForgeActionLog.Engine.Manual, 0.1 ether, "Initial deposit");
        _attest(log, pk, me, ForgeActionLog.Kind.SetGoal, ForgeActionLog.Engine.Claude, 0.5 ether,
            "Set a halving goal above current balance to track pace", n++);
        _attest(log, pk, me, ForgeActionLog.Kind.SetMode, ForgeActionLog.Engine.Claude, 0,
            "Projected short of goal in Stack - Grow closes the gap", n++);
        _attest(log, pk, me, ForgeActionLog.Kind.Deposit, ForgeActionLog.Engine.Claude, 0.05 ether,
            "DCA top-up toward the halving goal", n++);
        _attest(log, pk, me, ForgeActionLog.Kind.AutoCompound, ForgeActionLog.Engine.Rules, 0,
            "Auto-Compound armed: claim yield once it clears the threshold", n++);

        vm.stopBroadcast();

        console.log("ForgeActionLog :", address(log));
        console.log("Entries total  :", log.total());
        console.log("Trusted signer :", me);
    }

    /// @dev Same digest the contract verifies in logAttested (mirrors ForgeActionLog.t.sol::_sign).
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
