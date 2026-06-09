// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IYieldStrategy} from "./interfaces/IYieldStrategy.sol";

/// @title ForgeVault
/// @notice AI-managed smart vault for zkLTC on LiteForge.
///         Two modes per user:
///           - Stack: funds held safely in the vault.
///           - Grow:  funds deployed into a pluggable yield strategy.
///         Each user can set a Litecoin-Halving goal and read live progress/projection.
/// @dev All amounts are native zkLTC (the LiteForge gas token).
contract ForgeVault {
    error ZeroAmount();
    error InsufficientBalance();
    error TransferFailed();
    error GoalMustExceedBalance();
    error Reentrancy();
    error NotOwner();
    error NoStrategy();
    error StrategyInUse();
    error NotAgent();
    error AgentNotAuthorized();
    error AgentExpiryInPast();

    enum Mode {
        Stack,
        Grow
    }

    /// @notice Per-user grant letting the autonomous keeper act on their behalf, within limits.
    /// @dev `compound` permits agentClaimYield; `rebalance` permits agentSetMode. Both are
    ///      gated by `expiry` (a unix timestamp) and revocable any time. The keeper can only
    ///      ever move a user's OWN funds (yield to them, or Stack<->Grow) — never extract.
    struct AgentAuth {
        bool compound;
        bool rebalance;
        uint64 expiry;
    }

    /// @notice ~Next Litecoin halving: block 3,360,000, est. early August 2027.
    uint256 public constant HALVING_TIMESTAMP = 1_816_934_400;
    uint256 public constant MAX_PROJECTION_DAYS = 1095; // cap projection at ~3y
    uint256 private constant BPS = 10_000;

    address public owner;
    IYieldStrategy public strategy;
    address public agent; // the autonomous keeper authorized to act for opted-in users

    mapping(address => uint256) public stackBalance; // held in vault (Stack mode)
    mapping(address => Mode) public mode;
    mapping(address => uint256) public halvingGoal;
    mapping(address => uint256) public totalDeposited; // lifetime stat
    mapping(address => AgentAuth) public agentAuth; // per-user keeper grant

    // Global aggregates (power the leaderboard + analytics without log indexing).
    address[] public users; // every address that has ever deposited
    mapping(address => bool) public registered;
    uint256 public totalValueLocked; // sum of all custodied principal (stack + grow)

    uint256 private _lock;

    event Deposited(address indexed user, uint256 amount, Mode mode);
    event Withdrawn(address indexed user, uint256 amount, uint256 yieldPaid);
    event ModeChanged(address indexed user, Mode mode, uint256 moved);
    event GoalSet(address indexed user, uint256 goal);
    event YieldClaimed(address indexed user, uint256 amount);
    event StrategyUpdated(address indexed strategy);
    event UserRegistered(address indexed user, uint256 index);
    event AgentUpdated(address indexed agent);
    event AgentAuthorized(address indexed user, bool compound, bool rebalance, uint64 expiry);
    event AgentActed(address indexed user, string action);

    modifier nonReentrant() {
        if (_lock == 1) revert Reentrancy();
        _lock = 1;
        _;
        _lock = 0;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(IYieldStrategy _strategy) {
        owner = msg.sender;
        strategy = _strategy;
    }

    /// @notice Swap the yield strategy. Blocked while the current strategy still custodies
    ///         principal — otherwise Grow-mode users would lose access to funds tracked by
    ///         the outgoing strategy. To migrate, users must exit Grow first.
    function setStrategy(IYieldStrategy _strategy) external onlyOwner {
        if (address(strategy) != address(0) && strategy.totalPrincipal() != 0) revert StrategyInUse();
        strategy = _strategy;
        emit StrategyUpdated(address(_strategy));
    }

    // ---- core actions ----

    function deposit() external payable nonReentrant {
        if (msg.value == 0) revert ZeroAmount();
        _register(msg.sender);
        totalDeposited[msg.sender] += msg.value;
        totalValueLocked += msg.value;
        if (mode[msg.sender] == Mode.Grow) {
            _requireStrategy();
            strategy.deposit{value: msg.value}(msg.sender);
        } else {
            stackBalance[msg.sender] += msg.value;
        }
        emit Deposited(msg.sender, msg.value, mode[msg.sender]);
    }

    /// @notice Withdraw `amount` of principal. In Grow, a proportional share of accrued
    ///         yield is paid alongside (a full-principal withdrawal harvests all of it).
    function withdraw(uint256 amount) external nonReentrant {
        _withdraw(amount);
    }

    /// @notice Withdraw the user's entire withdrawable principal (plus all accrued yield in
    ///         Grow) in one call. Avoids the balanceOf-vs-principal gap that made
    ///         "withdraw my whole balance" revert when the displayed total included yield.
    function withdrawAll() external nonReentrant {
        uint256 amount = withdrawable(msg.sender);
        if (amount == 0) revert ZeroAmount();
        _withdraw(amount);
    }

    function _withdraw(uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        uint256 yieldPaid;
        if (mode[msg.sender] == Mode.Grow) {
            _requireStrategy();
            if (amount > strategy.principalOf(msg.sender)) revert InsufficientBalance();
            (, yieldPaid) = strategy.withdraw(msg.sender, amount); // vault receives amount + yield
        } else {
            if (amount > stackBalance[msg.sender]) revert InsufficientBalance();
            stackBalance[msg.sender] -= amount;
        }
        totalValueLocked -= amount; // principal leaves; yieldPaid comes from the reward pool
        _send(msg.sender, amount + yieldPaid);
        emit Withdrawn(msg.sender, amount, yieldPaid);
    }

    /// @notice Switch modes; funds (and accrued yield) move with the user.
    function setMode(Mode newMode) external nonReentrant {
        _setModeFor(msg.sender, newMode);
    }

    function _setModeFor(address user, Mode newMode) internal {
        Mode cur = mode[user];
        uint256 moved;
        if (newMode != cur) {
            if (newMode == Mode.Grow) {
                _requireStrategy();
                moved = stackBalance[user];
                if (moved > 0) {
                    stackBalance[user] = 0;
                    strategy.deposit{value: moved}(user);
                }
            } else {
                uint256 p = address(strategy) == address(0) ? 0 : strategy.principalOf(user);
                if (p > 0) {
                    (uint256 principalOut, uint256 yieldOut) = strategy.withdraw(user, p);
                    // Only principal re-enters stackBalance, keeping it consistent with
                    // totalValueLocked (principal-only). Accrued yield is paid out now
                    // rather than folded in — otherwise a later stack withdraw would
                    // decrement TVL by more than was ever deposited and underflow.
                    moved = principalOut;
                    stackBalance[user] += principalOut;
                    if (yieldOut > 0) _send(user, yieldOut);
                }
            }
        }
        mode[user] = newMode;
        emit ModeChanged(user, newMode, moved);
    }

    function setHalvingGoal(uint256 goal) external {
        // Floor on withdrawable principal (not balanceOf) so the minimum doesn't drift up
        // as unrealized yield accrues in Grow mode.
        if (goal <= withdrawable(msg.sender)) revert GoalMustExceedBalance();
        halvingGoal[msg.sender] = goal;
        emit GoalSet(msg.sender, goal);
    }

    function claimYield() external nonReentrant {
        _claimYieldFor(msg.sender);
    }

    function _claimYieldFor(address user) internal {
        _requireStrategy();
        uint256 y = strategy.claimYield(user); // vault receives y
        if (y > 0) _send(user, y);
        emit YieldClaimed(user, y);
    }

    // ---- autonomous keeper (opt-in, capped, revocable) ----

    /// @notice Owner sets the single keeper address allowed to act for opted-in users.
    function setAgent(address _agent) external onlyOwner {
        agent = _agent;
        emit AgentUpdated(_agent);
    }

    /// @notice Grant the keeper permission to auto-compound and/or auto-rebalance for you,
    ///         until `expiry`. Re-call to change; {revokeAgent} or a passed expiry ends it.
    function authorizeAgent(bool compound, bool rebalance, uint64 expiry) external {
        // Reject a granted-but-already-dead authorization (would mislead the keeper/UI).
        if ((compound || rebalance) && expiry <= block.timestamp) revert AgentExpiryInPast();
        agentAuth[msg.sender] = AgentAuth(compound, rebalance, expiry);
        emit AgentAuthorized(msg.sender, compound, rebalance, expiry);
    }

    /// @notice Immediately revoke all keeper permissions.
    function revokeAgent() external {
        delete agentAuth[msg.sender];
        emit AgentAuthorized(msg.sender, false, false, 0);
    }

    /// @notice True if the keeper may currently perform `wantRebalance ? rebalance : compound` for `user`.
    function agentCan(address user, bool wantRebalance) public view returns (bool) {
        AgentAuth memory a = agentAuth[user];
        if (a.expiry <= block.timestamp) return false;
        return wantRebalance ? a.rebalance : a.compound;
    }

    /// @notice Keeper claims `user`'s accrued yield to `user`. Requires a live compound grant.
    function agentClaimYield(address user) external nonReentrant {
        if (msg.sender != agent) revert NotAgent();
        if (!agentCan(user, false)) revert AgentNotAuthorized();
        _claimYieldFor(user);
        emit AgentActed(user, "compound");
    }

    /// @notice Keeper switches `user`'s mode (their own funds, within the vault). Requires a live rebalance grant.
    function agentSetMode(address user, Mode newMode) external nonReentrant {
        if (msg.sender != agent) revert NotAgent();
        if (!agentCan(user, true)) revert AgentNotAuthorized();
        _setModeFor(user, newMode);
        emit AgentActed(user, "rebalance");
    }

    // ---- views (frontend + agent) ----

    function balanceOf(address user) public view returns (uint256) {
        if (mode[user] == Mode.Grow && address(strategy) != address(0)) {
            return strategy.principalOf(user) + strategy.pendingYield(user);
        }
        return stackBalance[user];
    }

    /// @notice The principal a user can withdraw right now (excludes still-accruing yield).
    ///         `balanceOf` includes pending yield for display; `withdraw`/`withdrawAll` move
    ///         principal and pay yield on top — use this for "max withdraw" UIs.
    function withdrawable(address user) public view returns (uint256) {
        if (mode[user] == Mode.Grow && address(strategy) != address(0)) {
            return strategy.principalOf(user);
        }
        return stackBalance[user];
    }

    function getProgress(address user)
        external
        view
        returns (uint256 percent, uint256 current, uint256 goal, uint256 daysRemaining)
    {
        current = balanceOf(user);
        goal = halvingGoal[user];
        percent = goal > 0 ? (current * 100) / goal : 0;
        if (percent > 100) percent = 100;
        daysRemaining = _daysToHalving();
    }

    function getProjectedStack(address user) public view returns (uint256) {
        uint256 bal = balanceOf(user);
        if (mode[user] == Mode.Stack || address(strategy) == address(0)) return bal;
        uint256 d = _daysToHalving();
        if (d > MAX_PROJECTION_DAYS) d = MAX_PROJECTION_DAYS;
        uint256 gain = (bal * strategy.aprBps() * d) / (365 * BPS);
        return bal + gain;
    }

    /// @notice One-shot snapshot — the agent's primary read tool.
    function getVaultState(address user)
        external
        view
        returns (
            Mode userMode,
            uint256 stack,
            uint256 growPrincipal,
            uint256 pendingYield,
            uint256 total,
            uint256 goal,
            uint256 daysToHalving,
            uint256 projected
        )
    {
        userMode = mode[user];
        stack = stackBalance[user];
        bool hasStrat = address(strategy) != address(0);
        growPrincipal = hasStrat ? strategy.principalOf(user) : 0;
        pendingYield = hasStrat ? strategy.pendingYield(user) : 0;
        total = balanceOf(user);
        goal = halvingGoal[user];
        daysToHalving = _daysToHalving();
        projected = getProjectedStack(user);
    }

    /// @notice One-shot global snapshot for the analytics dashboard.
    function globalStats()
        external
        view
        returns (uint256 tvl, uint256 userCount, uint256 aprBps_, uint256 daysToHalving)
    {
        tvl = totalValueLocked;
        userCount = users.length;
        aprBps_ = address(strategy) == address(0) ? 0 : strategy.aprBps();
        daysToHalving = _daysToHalving();
    }

    function usersLength() external view returns (uint256) {
        return users.length;
    }

    /// @notice Paginated registry — the leaderboard reads this then multicalls per-user state.
    function getUsers(uint256 offset, uint256 limit) external view returns (address[] memory page) {
        uint256 n = users.length;
        if (offset >= n) return new address[](0);
        uint256 end = offset + limit;
        if (end > n) end = n;
        page = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = users[i];
        }
    }

    // ---- internals ----

    function _register(address user) internal {
        if (!registered[user]) {
            registered[user] = true;
            users.push(user);
            emit UserRegistered(user, users.length - 1);
        }
    }

    function _daysToHalving() internal view returns (uint256) {
        return HALVING_TIMESTAMP > block.timestamp ? (HALVING_TIMESTAMP - block.timestamp) / 1 days : 0;
    }

    function _requireStrategy() internal view {
        if (address(strategy) == address(0)) revert NoStrategy();
    }

    function _send(address to, uint256 amount) internal {
        (bool ok,) = payable(to).call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    receive() external payable {} // accept strategy payouts / reward top-ups
}
