// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @dev Minimal read interface into ForgeVault. ForgeProfile only ever READS the
///      vault to verify mission predicates — it never moves funds or holds custody.
interface IForgeVault {
    function totalDeposited(address user) external view returns (uint256);
    function balanceOf(address user) external view returns (uint256);
    function halvingGoal(address user) external view returns (uint256);
    function mode(address user) external view returns (uint8); // 0 = Stack, 1 = Grow
}

/// @title ForgeProfile
/// @notice On-chain gamification for ForgeMind: missions → XP → levels, usernames,
///         and an enumerable participant registry that powers the leaderboard.
/// @dev Every mission predicate is verified by reading live ForgeVault state, so XP
///      is provably earned. Only monotonic / claim-time-snapshot predicates are used
///      (no duration claims that a stateless read can't prove).
contract ForgeProfile {
    error AlreadyClaimed();
    error MissionNotMet();
    error UnknownMission();
    error UsernameTooLong();

    uint256 public constant MISSION_COUNT = 5;

    IForgeVault public immutable vault;

    mapping(address => uint256) public xp;
    mapping(address => mapping(uint8 => bool)) public claimed; // user => missionId => done
    mapping(address => string) public username;

    address[] public users; // everyone who has claimed at least one mission
    mapping(address => bool) public registered;

    event MissionClaimed(address indexed user, uint8 indexed missionId, uint256 xpAwarded);
    event XPAwarded(address indexed user, uint256 newTotal);
    event UsernameSet(address indexed user, string name);

    constructor(IForgeVault _vault) {
        vault = _vault;
    }

    /// @notice Fixed XP reward per mission id.
    function missionXp(uint8 id) public pure returns (uint256) {
        if (id == 0) return 100; // First Forge
        if (id == 1) return 200; // Stacker (≥10 zkLTC deposited)
        if (id == 2) return 100; // Goal-setter
        if (id == 3) return 300; // Halfway to goal
        if (id == 4) return 150; // Yield farmer (in Grow)
        revert UnknownMission();
    }

    /// @notice Is mission `id` currently satisfiable by `user` (live vault read)?
    function missionMet(address user, uint8 id) public view returns (bool) {
        if (id == 0) return vault.totalDeposited(user) > 0;
        if (id == 1) return vault.totalDeposited(user) >= 10 ether;
        if (id == 2) return vault.halvingGoal(user) > 0;
        if (id == 3) {
            uint256 goal = vault.halvingGoal(user);
            return goal > 0 && vault.balanceOf(user) * 2 >= goal;
        }
        if (id == 4) return vault.mode(user) == 1;
        revert UnknownMission();
    }

    /// @notice Claim a mission you've met; awards XP once. Only ever credits msg.sender.
    function claimMission(uint8 id) external {
        if (id >= MISSION_COUNT) revert UnknownMission();
        if (claimed[msg.sender][id]) revert AlreadyClaimed();
        if (!missionMet(msg.sender, id)) revert MissionNotMet();

        claimed[msg.sender][id] = true;
        _register(msg.sender);

        uint256 reward = missionXp(id);
        xp[msg.sender] += reward;
        emit MissionClaimed(msg.sender, id, reward);
        emit XPAwarded(msg.sender, xp[msg.sender]);
    }

    function setUsername(string calldata name) external {
        if (bytes(name).length > 32) revert UsernameTooLong();
        username[msg.sender] = name;
        _register(msg.sender);
        emit UsernameSet(msg.sender, name);
    }

    // ---- views ----

    /// @notice Level derived from XP (250 XP per level, starting at 1).
    function levelOf(address user) public view returns (uint256) {
        return 1 + xp[user] / 250;
    }

    /// @notice Bitmask of claimed missions + per-mission met/claimed flags for the UI.
    function profileOf(address user)
        external
        view
        returns (uint256 totalXp, uint256 level, uint256 claimedCount, bool[] memory met, bool[] memory done)
    {
        totalXp = xp[user];
        level = levelOf(user);
        met = new bool[](MISSION_COUNT);
        done = new bool[](MISSION_COUNT);
        for (uint8 i = 0; i < MISSION_COUNT; i++) {
            met[i] = missionMet(user, i);
            done[i] = claimed[user][i];
            if (done[i]) claimedCount++;
        }
    }

    function usersLength() external view returns (uint256) {
        return users.length;
    }

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

    // ---- internal ----

    function _register(address user) internal {
        if (!registered[user]) {
            registered[user] = true;
            users.push(user);
        }
    }
}
