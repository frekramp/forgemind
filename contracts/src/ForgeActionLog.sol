// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title ForgeActionLog
/// @notice An on-chain, tamper-evident record of the ForgeMind agent's decisions.
///         The vault already emits WHAT happened (Deposited, ModeChanged, …); this log
///         captures WHY — the engine that decided (Claude vs. the rule-based fallback)
///         and a short human-readable reason — paired to each action the agent proposes.
/// @dev Companion contract. It NEVER moves funds and never touches ForgeVault state, so
///      it requires no changes to (or re-audit of) the custody-critical vault.
///
///      Two ways to write a decision:
///        - log(...)         — self-attested. `actor = msg.sender`, so a wallet logs as
///                             itself. Honest, but the claimed `engine` is unprovable: a
///                             user could mark a manual move as "Claude".
///        - logAttested(...) — agent-attested. The entry is accompanied by an ECDSA
///                             signature from the registered `trustedSigner` (the ForgeMind
///                             agent/keeper key) over the full decision. The contract
///                             recovers the signer and records `attested = true` only when
///                             it matches. An attested entry is therefore *cryptographic
///                             proof* the decision originated from the agent — it cannot be
///                             spoofed by a user. Per-actor nonces prevent replay, and the
///                             digest binds `block.chainid` + `address(this)` so a signature
///                             can't be replayed onto another chain or a forked contract.
contract ForgeActionLog {
    error ReasonTooLong();
    error NotOwner();
    error SignerNotSet();
    error BadNonce();
    error BadSignature();

    /// @dev Mirrors the agent's tool surface (see web/lib/agent.ts AgentAction).
    enum Kind {
        Deposit,
        Withdraw,
        SetMode,
        ClaimYield,
        SetGoal,
        ClaimMission,
        AutoCompound,
        AutoDCA
    }

    /// @dev Who drove the decision. Manual = user-typed; Rules/Claude = the agent engines.
    enum Engine {
        Manual,
        Rules,
        Claude
    }

    uint256 public constant MAX_REASON = 160; // bytes; bounds storage gas per entry

    struct Entry {
        // actor(20) + kind(1) + engine(1) + attested(1) + timestamp(8) pack into one slot.
        address actor;
        Kind kind;
        Engine engine;
        bool attested; // true => signature from trustedSigner verified for this entry
        uint64 timestamp;
        uint256 amount; // zkLTC wei involved (0 when not applicable)
        string reason; // short agent rationale, e.g. "yield 0.42 > 0.10 threshold"
    }

    /// @notice Contract owner — may rotate the trusted signer. Set to the deployer.
    address public owner;

    /// @notice The ForgeMind agent/keeper key authorized to attest decisions. May be the
    ///         zero address (attestation disabled) until the owner sets one.
    address public trustedSigner;

    Entry[] private _entries;
    mapping(address => uint256[]) private _byUser; // actor => entry ids

    /// @notice Next expected attestation nonce for an actor (replay protection). Independent
    ///         of the self-attested log() path, which needs no nonce.
    mapping(address => uint256) public attestNonce;

    event ActionLogged(
        uint256 indexed id,
        address indexed actor,
        Kind kind,
        Engine engine,
        bool attested,
        uint256 amount,
        string reason
    );
    event TrustedSignerUpdated(address indexed previousSigner, address indexed newSigner);

    constructor(address initialSigner) {
        owner = msg.sender;
        trustedSigner = initialSigner;
        emit TrustedSignerUpdated(address(0), initialSigner);
    }

    // ---- writes ----

    /// @notice Record an agent decision attributed to msg.sender (self-attested). Returns id.
    function log(Kind kind, Engine engine, uint256 amount, string calldata reason) external returns (uint256 id) {
        return _record(msg.sender, kind, engine, amount, reason, false);
    }

    /// @notice Record an agent decision proven to come from the trusted signer.
    /// @dev    Anyone may relay (msg.sender is irrelevant; the entry is bound to `actor` by
    ///         the signature), so the keeper can notarize on a user's behalf, or a user can
    ///         submit an agent-authored decision gaslessly. `sig` is a 65-byte
    ///         (r,s,v) signature from `trustedSigner` over the EIP-191 personal-sign hash of
    ///         keccak256(abi.encode(actor, kind, engine, amount, keccak256(reason), nonce,
    ///         block.chainid, address(this))).
    /// @param nonce Must equal attestNonce[actor]; consumed on success.
    function logAttested(
        address actor,
        Kind kind,
        Engine engine,
        uint256 amount,
        string calldata reason,
        uint256 nonce,
        bytes calldata sig
    ) external returns (uint256 id) {
        address signer = trustedSigner;
        if (signer == address(0)) revert SignerNotSet();
        if (nonce != attestNonce[actor]) revert BadNonce();

        bytes32 structHash = keccak256(
            abi.encode(
                actor,
                uint8(kind),
                uint8(engine),
                amount,
                keccak256(bytes(reason)),
                nonce,
                block.chainid,
                address(this)
            )
        );
        address recovered = _recover(_ethHash(structHash), sig);
        if (recovered == address(0) || recovered != signer) revert BadSignature();

        // consume the nonce before writing (checks-effects)
        attestNonce[actor] = nonce + 1;
        return _record(actor, kind, engine, amount, reason, true);
    }

    /// @notice Rotate the trusted signer (e.g. to revoke a leaked agent key). Owner only.
    function setTrustedSigner(address newSigner) external {
        if (msg.sender != owner) revert NotOwner();
        emit TrustedSignerUpdated(trustedSigner, newSigner);
        trustedSigner = newSigner;
    }

    function _record(address actor, Kind kind, Engine engine, uint256 amount, string calldata reason, bool attested)
        private
        returns (uint256 id)
    {
        if (bytes(reason).length > MAX_REASON) revert ReasonTooLong();
        id = _entries.length;
        _entries.push(
            Entry({
                actor: actor,
                kind: kind,
                engine: engine,
                attested: attested,
                timestamp: uint64(block.timestamp),
                amount: amount,
                reason: reason
            })
        );
        _byUser[actor].push(id);
        emit ActionLogged(id, actor, kind, engine, attested, amount, reason);
    }

    // ---- signature helpers (no external deps; paris-safe ecrecover) ----

    function _ethHash(bytes32 h) private pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", h));
    }

    /// @dev Returns address(0) on any malformed/malleable signature (caller treats that as
    ///      a failure). Rejects high-s values per EIP-2 to avoid signature malleability.
    function _recover(bytes32 digest, bytes calldata sig) private pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) return address(0);
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            return address(0);
        }
        return ecrecover(digest, v, r, s);
    }

    // ---- views (activity feed + per-user history) ----

    function total() external view returns (uint256) {
        return _entries.length;
    }

    function userCount(address user) external view returns (uint256) {
        return _byUser[user].length;
    }

    function getEntry(uint256 id) external view returns (Entry memory) {
        return _entries[id];
    }

    /// @notice The most recent `limit` entries, newest first.
    function getRecent(uint256 limit) external view returns (Entry[] memory out) {
        uint256 n = _entries.length;
        uint256 k = limit < n ? limit : n;
        out = new Entry[](k);
        for (uint256 i = 0; i < k; i++) {
            out[i] = _entries[n - 1 - i];
        }
    }

    /// @notice A user's entries, newest first, paginated by `offset`/`limit` over their history.
    function getByUser(address user, uint256 offset, uint256 limit) external view returns (Entry[] memory out) {
        uint256[] storage ids = _byUser[user];
        uint256 n = ids.length;
        if (offset >= n) return new Entry[](0);
        uint256 remaining = n - offset;
        uint256 k = limit < remaining ? limit : remaining;
        out = new Entry[](k);
        for (uint256 i = 0; i < k; i++) {
            // newest first: walk backwards from the end, skipping `offset`
            out[i] = _entries[ids[n - 1 - offset - i]];
        }
    }
}
