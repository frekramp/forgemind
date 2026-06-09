// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ForgeActionLog} from "../src/ForgeActionLog.sol";

contract ForgeActionLogTest is Test {
    ForgeActionLog actionLog;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    // The agent/keeper signing key registered as the trusted signer.
    uint256 constant SIGNER_PK = 0xA9E2701; // arbitrary, valid secp256k1 key
    address signer;

    function setUp() public {
        signer = vm.addr(SIGNER_PK);
        actionLog = new ForgeActionLog(signer);
    }

    // ---- self-attested log() ----

    function test_LogAttributesToSenderAndReturnsId() public {
        vm.prank(alice);
        uint256 id = actionLog.log(ForgeActionLog.Kind.Deposit, ForgeActionLog.Engine.Claude, 10 ether, "first forge");
        assertEq(id, 0);
        assertEq(actionLog.total(), 1);
        assertEq(actionLog.userCount(alice), 1);

        ForgeActionLog.Entry memory e = actionLog.getEntry(0);
        assertEq(e.actor, alice);
        assertEq(uint8(e.kind), uint8(ForgeActionLog.Kind.Deposit));
        assertEq(uint8(e.engine), uint8(ForgeActionLog.Engine.Claude));
        assertEq(e.amount, 10 ether);
        assertEq(e.reason, "first forge");
        assertEq(e.timestamp, uint64(block.timestamp));
        assertEq(e.attested, false); // self-attested entries are never "verified"
    }

    function test_RejectsOverlongReason() public {
        bytes memory tooLong = new bytes(161); // MAX_REASON = 160
        vm.prank(alice);
        vm.expectRevert(ForgeActionLog.ReasonTooLong.selector);
        actionLog.log(ForgeActionLog.Kind.AutoCompound, ForgeActionLog.Engine.Rules, 0, string(tooLong));
    }

    function test_AcceptsReasonAtLimit() public {
        bytes memory atLimit = new bytes(160);
        vm.prank(alice);
        actionLog.log(ForgeActionLog.Kind.AutoCompound, ForgeActionLog.Engine.Rules, 0, string(atLimit));
        assertEq(actionLog.total(), 1);
    }

    function test_GetRecentNewestFirst() public {
        vm.startPrank(alice);
        actionLog.log(ForgeActionLog.Kind.Deposit, ForgeActionLog.Engine.Manual, 1 ether, "a");
        actionLog.log(ForgeActionLog.Kind.SetMode, ForgeActionLog.Engine.Claude, 0, "b");
        actionLog.log(ForgeActionLog.Kind.ClaimYield, ForgeActionLog.Engine.Rules, 0, "c");
        vm.stopPrank();

        ForgeActionLog.Entry[] memory recent = actionLog.getRecent(2);
        assertEq(recent.length, 2);
        assertEq(recent[0].reason, "c"); // newest first
        assertEq(recent[1].reason, "b");
    }

    function test_GetRecentClampsToTotal() public {
        vm.prank(alice);
        actionLog.log(ForgeActionLog.Kind.Deposit, ForgeActionLog.Engine.Manual, 1 ether, "only");
        ForgeActionLog.Entry[] memory recent = actionLog.getRecent(50);
        assertEq(recent.length, 1);
        assertEq(recent[0].reason, "only");
    }

    function test_PerUserHistoryIsolatedAndPaginated() public {
        vm.prank(alice);
        actionLog.log(ForgeActionLog.Kind.Deposit, ForgeActionLog.Engine.Manual, 1 ether, "a1");
        vm.prank(bob);
        actionLog.log(ForgeActionLog.Kind.Deposit, ForgeActionLog.Engine.Manual, 2 ether, "b1");
        vm.prank(alice);
        actionLog.log(ForgeActionLog.Kind.SetGoal, ForgeActionLog.Engine.Claude, 0, "a2");

        assertEq(actionLog.userCount(alice), 2);
        assertEq(actionLog.userCount(bob), 1);

        // alice newest first
        ForgeActionLog.Entry[] memory page = actionLog.getByUser(alice, 0, 10);
        assertEq(page.length, 2);
        assertEq(page[0].reason, "a2");
        assertEq(page[1].reason, "a1");

        // offset into alice's history
        ForgeActionLog.Entry[] memory page2 = actionLog.getByUser(alice, 1, 10);
        assertEq(page2.length, 1);
        assertEq(page2[0].reason, "a1");

        // bob untouched
        ForgeActionLog.Entry[] memory bobPage = actionLog.getByUser(bob, 0, 10);
        assertEq(bobPage.length, 1);
        assertEq(bobPage[0].reason, "b1");
    }

    function test_GetByUserOffsetPastEndReturnsEmpty() public {
        vm.prank(alice);
        actionLog.log(ForgeActionLog.Kind.Deposit, ForgeActionLog.Engine.Manual, 1 ether, "a");
        ForgeActionLog.Entry[] memory page = actionLog.getByUser(alice, 5, 10);
        assertEq(page.length, 0);
    }

    function test_EmptyReads() public view {
        assertEq(actionLog.total(), 0);
        assertEq(actionLog.userCount(alice), 0);
        assertEq(actionLog.getRecent(10).length, 0);
        assertEq(actionLog.getByUser(alice, 0, 10).length, 0);
    }

    // ---- agent-attested logAttested() ----

    /// Rebuilds the exact digest the contract signs over, then signs with `pk`.
    function _sign(
        uint256 pk,
        address actor,
        ForgeActionLog.Kind kind,
        ForgeActionLog.Engine engine,
        uint256 amount,
        string memory reason,
        uint256 nonce
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                actor,
                uint8(kind),
                uint8(engine),
                amount,
                keccak256(bytes(reason)),
                nonce,
                block.chainid,
                address(actionLog)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_LogAttested_ValidSignatureRecordsVerifiedEntry() public {
        bytes memory sig =
            _sign(SIGNER_PK, alice, ForgeActionLog.Kind.AutoCompound, ForgeActionLog.Engine.Rules, 5 ether, "auto-compound 0.42", 0);

        // bob relays the keeper's attestation on alice's behalf — msg.sender is irrelevant.
        vm.prank(bob);
        uint256 id = actionLog.logAttested(
            alice, ForgeActionLog.Kind.AutoCompound, ForgeActionLog.Engine.Rules, 5 ether, "auto-compound 0.42", 0, sig
        );

        ForgeActionLog.Entry memory e = actionLog.getEntry(id);
        assertEq(e.actor, alice); // attributed to the subject, not the relayer
        assertEq(e.attested, true);
        assertEq(uint8(e.engine), uint8(ForgeActionLog.Engine.Rules));
        assertEq(actionLog.userCount(alice), 1);
        assertEq(actionLog.attestNonce(alice), 1); // nonce consumed
    }

    function test_LogAttested_WrongSignerReverts() public {
        uint256 attackerPk = 0xBADBAD;
        bytes memory sig =
            _sign(attackerPk, alice, ForgeActionLog.Kind.SetMode, ForgeActionLog.Engine.Claude, 0, "spoof", 0);

        vm.expectRevert(ForgeActionLog.BadSignature.selector);
        actionLog.logAttested(alice, ForgeActionLog.Kind.SetMode, ForgeActionLog.Engine.Claude, 0, "spoof", 0, sig);
    }

    function test_LogAttested_TamperedFieldReverts() public {
        // sign for engine=Rules, but submit engine=Claude => recovered signer won't match.
        bytes memory sig =
            _sign(SIGNER_PK, alice, ForgeActionLog.Kind.SetMode, ForgeActionLog.Engine.Rules, 0, "x", 0);

        vm.expectRevert(ForgeActionLog.BadSignature.selector);
        actionLog.logAttested(alice, ForgeActionLog.Kind.SetMode, ForgeActionLog.Engine.Claude, 0, "x", 0, sig);
    }

    function test_LogAttested_ReplayReverts() public {
        bytes memory sig =
            _sign(SIGNER_PK, alice, ForgeActionLog.Kind.ClaimYield, ForgeActionLog.Engine.Rules, 1 ether, "y", 0);
        actionLog.logAttested(alice, ForgeActionLog.Kind.ClaimYield, ForgeActionLog.Engine.Rules, 1 ether, "y", 0, sig);

        // replaying the same (nonce 0) signature now fails: nonce already consumed.
        vm.expectRevert(ForgeActionLog.BadNonce.selector);
        actionLog.logAttested(alice, ForgeActionLog.Kind.ClaimYield, ForgeActionLog.Engine.Rules, 1 ether, "y", 0, sig);
    }

    function test_LogAttested_WrongNonceReverts() public {
        bytes memory sig =
            _sign(SIGNER_PK, alice, ForgeActionLog.Kind.Deposit, ForgeActionLog.Engine.Rules, 0, "z", 5);
        vm.expectRevert(ForgeActionLog.BadNonce.selector);
        actionLog.logAttested(alice, ForgeActionLog.Kind.Deposit, ForgeActionLog.Engine.Rules, 0, "z", 5, sig);
    }

    function test_LogAttested_SecondEntryUsesNextNonce() public {
        bytes memory sig0 =
            _sign(SIGNER_PK, alice, ForgeActionLog.Kind.Deposit, ForgeActionLog.Engine.Rules, 0, "n0", 0);
        actionLog.logAttested(alice, ForgeActionLog.Kind.Deposit, ForgeActionLog.Engine.Rules, 0, "n0", 0, sig0);

        bytes memory sig1 =
            _sign(SIGNER_PK, alice, ForgeActionLog.Kind.SetMode, ForgeActionLog.Engine.Rules, 0, "n1", 1);
        actionLog.logAttested(alice, ForgeActionLog.Kind.SetMode, ForgeActionLog.Engine.Rules, 0, "n1", 1, sig1);

        assertEq(actionLog.attestNonce(alice), 2);
        assertEq(actionLog.userCount(alice), 2);
    }

    function test_LogAttested_SignerNotSetReverts() public {
        ForgeActionLog noSigner = new ForgeActionLog(address(0));
        bytes memory sig =
            _sign(SIGNER_PK, alice, ForgeActionLog.Kind.Deposit, ForgeActionLog.Engine.Rules, 0, "x", 0);
        vm.expectRevert(ForgeActionLog.SignerNotSet.selector);
        noSigner.logAttested(alice, ForgeActionLog.Kind.Deposit, ForgeActionLog.Engine.Rules, 0, "x", 0, sig);
    }

    function test_LogAttested_MalformedSignatureReverts() public {
        bytes memory badSig = hex"1234"; // wrong length => _recover returns address(0)
        vm.expectRevert(ForgeActionLog.BadSignature.selector);
        actionLog.logAttested(alice, ForgeActionLog.Kind.Deposit, ForgeActionLog.Engine.Rules, 0, "x", 0, badSig);
    }

    // ---- signer rotation ----

    function test_SetTrustedSigner_OnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(ForgeActionLog.NotOwner.selector);
        actionLog.setTrustedSigner(alice);
    }

    function test_SetTrustedSigner_RotatesAndOldKeyRejected() public {
        uint256 newPk = 0xC0FFEE;
        address newSigner = vm.addr(newPk);
        actionLog.setTrustedSigner(newSigner); // test contract is owner (deployer)
        assertEq(actionLog.trustedSigner(), newSigner);

        // old key no longer attests
        bytes memory oldSig =
            _sign(SIGNER_PK, alice, ForgeActionLog.Kind.Deposit, ForgeActionLog.Engine.Rules, 0, "old", 0);
        vm.expectRevert(ForgeActionLog.BadSignature.selector);
        actionLog.logAttested(alice, ForgeActionLog.Kind.Deposit, ForgeActionLog.Engine.Rules, 0, "old", 0, oldSig);

        // new key works
        bytes memory newSig =
            _sign(newPk, alice, ForgeActionLog.Kind.Deposit, ForgeActionLog.Engine.Rules, 0, "new", 0);
        actionLog.logAttested(alice, ForgeActionLog.Kind.Deposit, ForgeActionLog.Engine.Rules, 0, "new", 0, newSig);
        assertEq(actionLog.getEntry(0).attested, true);
    }
}
