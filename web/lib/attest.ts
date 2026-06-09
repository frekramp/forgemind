// Server-side helper to produce ForgeActionLog attestations.
//
// The ForgeMind agent/keeper key (registered on-chain as ForgeActionLog.trustedSigner)
// signs each decision; the contract recovers the signer in logAttested() and records
// `attested = true` only when it matches. This is the off-chain-decision → on-chain-trust
// bridge: an attested entry is cryptographic proof the decision came from the agent, not a
// user spoofing the engine field.
//
// The digest MUST match ForgeActionLog._record / logAttested byte-for-byte:
//   structHash = keccak256(abi.encode(
//     actor, uint8(kind), uint8(engine), amount, keccak256(bytes(reason)),
//     nonce, block.chainid, address(this)))
//   digest     = EIP-191 personal_sign hash of structHash  (signMessage raw)
import {
  encodeAbiParameters,
  keccak256,
  recoverMessageAddress,
  toBytes,
  type Address,
  type Hex,
  type LocalAccount,
} from "viem";

export type DecisionAttestation = {
  actionLog: Address; // address(this) — the ForgeActionLog contract
  chainId: number; // block.chainid
  actor: Address; // the vault owner the decision is about
  kind: number; // ForgeActionLog.Kind
  engine: number; // ForgeActionLog.Engine
  amount: bigint; // wei (0 when not applicable)
  reason: string; // <= 160 bytes
  nonce: bigint; // must equal attestNonce[actor] on-chain
};

/** The 32-byte struct hash the trusted signer signs over (pre EIP-191 prefix). */
export function decisionStructHash(a: DecisionAttestation): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "address" }, // actor
        { type: "uint8" }, // kind
        { type: "uint8" }, // engine
        { type: "uint256" }, // amount
        { type: "bytes32" }, // keccak256(reason)
        { type: "uint256" }, // nonce
        { type: "uint256" }, // chainid
        { type: "address" }, // address(this)
      ],
      [
        a.actor,
        a.kind,
        a.engine,
        a.amount,
        keccak256(toBytes(a.reason)),
        a.nonce,
        BigInt(a.chainId),
        a.actionLog,
      ]
    )
  );
}

/**
 * Sign a decision with the trusted-signer account. `account` must be the key registered as
 * ForgeActionLog.trustedSigner (i.e. the keeper). Returns the 65-byte (r,s,v) signature the
 * contract's logAttested() expects.
 */
export async function signDecision(account: LocalAccount, a: DecisionAttestation): Promise<Hex> {
  // signMessage with a raw 32-byte payload applies the same
  // "\x19Ethereum Signed Message:\n32" prefix the contract hashes with.
  return account.signMessage({ message: { raw: toBytes(decisionStructHash(a)) } });
}

/**
 * Recover the address that signed a decision attestation — the client-side mirror of the
 * contract's ecrecover in logAttested(). Compare the result to the published trusted signer
 * to prove (in the browser, no server) that a decision really came from the agent's key.
 */
export async function recoverDecisionSigner(a: DecisionAttestation, sig: Hex): Promise<Address> {
  return recoverMessageAddress({ message: { raw: toBytes(decisionStructHash(a)) }, signature: sig });
}
