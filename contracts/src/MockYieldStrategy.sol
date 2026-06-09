// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IYieldStrategy} from "./interfaces/IYieldStrategy.sol";

/// @title MockYieldStrategy
/// @notice Simulated yield backend for ForgeMind's Grow Mode on the LiteForge testnet.
/// @dev Principal is always custodied 1:1 and is fully returnable. "Yield" accrues
///      linearly at `aprBps` and is paid from a pre-funded reward pool (seeded from the
///      faucet). This mirrors how the LiteForge ecosystem itself advertises a simulated
///      ~5% APY on testnet — nothing here is presented as real protocol revenue.
contract MockYieldStrategy is IYieldStrategy {
    error NotVault();
    error InsufficientPrincipal();
    error TransferFailed();

    uint256 private constant YEAR = 365 days;
    uint256 private constant BPS = 10_000;

    address public immutable vault;
    uint256 public aprBps; // 500 = 5.00% APR
    uint256 public rewardPool; // native zkLTC reserved to pay simulated yield
    uint256 public totalPrincipal;

    mapping(address => uint256) private _principal;
    mapping(address => uint256) private _accrued; // credited, not yet paid
    mapping(address => uint256) private _lastAccrual; // timestamp checkpoint

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 principalOut, uint256 yieldOut);
    event YieldClaimed(address indexed user, uint256 yieldOut);
    event RewardsFunded(uint256 amount, uint256 newPool);

    modifier onlyVault() {
        if (msg.sender != vault) revert NotVault();
        _;
    }

    constructor(address _vault, uint256 _aprBps) {
        vault = _vault;
        aprBps = _aprBps;
    }

    function name() external pure returns (string memory) {
        return "ForgeMind Simulated Yield (testnet)";
    }

    // ---- vault-only mutations ----

    function deposit(address user) external payable onlyVault {
        _checkpoint(user);
        _principal[user] += msg.value;
        totalPrincipal += msg.value;
        emit Deposited(user, msg.value);
    }

    function withdraw(address user, uint256 amount)
        external
        onlyVault
        returns (uint256 principalOut, uint256 yieldOut)
    {
        _checkpoint(user);
        uint256 principalBefore = _principal[user];
        if (amount > principalBefore) revert InsufficientPrincipal();
        _principal[user] = principalBefore - amount;
        totalPrincipal -= amount;

        principalOut = amount;
        // Pay yield proportional to the principal withdrawn — a full-principal exit harvests
        // all accrued yield, a partial withdrawal takes only its pro-rata share.
        uint256 share = (_accrued[user] * amount) / principalBefore;
        yieldOut = _payYield(user, share);

        (bool ok,) = payable(msg.sender).call{value: principalOut + yieldOut}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(user, principalOut, yieldOut);
    }

    function claimYield(address user) external onlyVault returns (uint256 yieldOut) {
        _checkpoint(user);
        yieldOut = _drainYield(user);
        if (yieldOut > 0) {
            (bool ok,) = payable(msg.sender).call{value: yieldOut}("");
            if (!ok) revert TransferFailed();
        }
        emit YieldClaimed(user, yieldOut);
    }

    /// @notice Top up the reward pool that backs simulated yield.
    function fundRewards() external payable {
        rewardPool += msg.value;
        emit RewardsFunded(msg.value, rewardPool);
    }

    // ---- views ----

    function principalOf(address user) external view returns (uint256) {
        return _principal[user];
    }

    function pendingYield(address user) external view returns (uint256) {
        return _accrued[user] + _live(user);
    }

    // ---- internals ----

    function _live(address user) internal view returns (uint256) {
        uint256 p = _principal[user];
        if (p == 0) return 0;
        uint256 dt = block.timestamp - _lastAccrual[user];
        return (p * aprBps * dt) / (YEAR * BPS);
    }

    function _checkpoint(address user) internal {
        _accrued[user] += _live(user);
        _lastAccrual[user] = block.timestamp;
    }

    /// @dev Drain all accrued yield, capped by the reward pool (used by claimYield).
    function _drainYield(address user) internal returns (uint256 pay) {
        return _payYield(user, _accrued[user]);
    }

    /// @dev Pay up to `want` of accrued yield, itself capped by the reward pool.
    function _payYield(address user, uint256 want) internal returns (uint256 pay) {
        uint256 avail = _accrued[user];
        uint256 owed = want < avail ? want : avail;
        pay = owed < rewardPool ? owed : rewardPool;
        _accrued[user] -= pay;
        rewardPool -= pay;
    }
}
