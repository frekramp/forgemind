// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IYieldStrategy
/// @notice Pluggable yield backend for ForgeVault's Grow Mode.
/// @dev On the LiteForge testnet we use {MockYieldStrategy} (simulated APY paid from a
///      pre-funded reward pool). The SAME interface can wrap a real protocol on mainnet
///      (e.g. LitStake liquid staking), so the vault never has to change.
interface IYieldStrategy {
    /// @notice Deposit `msg.value` on behalf of `user`.
    function deposit(address user) external payable;

    /// @notice Withdraw up to `amount` of `user`'s principal, plus any payable yield.
    /// @return principalOut principal returned to the vault.
    /// @return yieldOut yield paid out of the reward pool.
    function withdraw(address user, uint256 amount)
        external
        returns (uint256 principalOut, uint256 yieldOut);

    /// @notice Pay out only the accrued yield for `user`.
    function claimYield(address user) external returns (uint256 yieldOut);

    function principalOf(address user) external view returns (uint256);
    function pendingYield(address user) external view returns (uint256);
    /// @notice Total principal custodied across all users (used to block unsafe strategy swaps).
    function totalPrincipal() external view returns (uint256);
    function aprBps() external view returns (uint256);
    function rewardPool() external view returns (uint256);
    function name() external view returns (string memory);
}
