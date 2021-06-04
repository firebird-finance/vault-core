// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IStakePool {
    function stake(uint) external;
    function stakeFor(address _account) external;
    function withdraw(uint) external;
    function exit() external;
    function getReward(uint8 _pid, address _account) external;
    function getAllRewards(address _account) external;
    function claimReward() external;
    function emergencyWithdraw() external;
    function updateReward() external;
    function updateReward(uint8 _pid) external;

    function pendingReward(uint8 _pid, address _account) external view returns (uint);
    function allowRecoverRewardToken(address _token) external view returns (bool);
    function getRewardPerBlock(uint8 pid) external view returns (uint);
    function rewardPoolInfoLength() external view returns (uint);
    function rewardPoolInfo(uint256 index) external view returns (address);
    function unfrozenStakeTime(address _account) external view returns (uint);
    function version() external view returns (uint);
    function stakeToken() external view returns (address);
    function getRewardMultiplier(uint8 _pid, uint _from, uint _to, uint _rewardPerBlock) external view returns (uint);
    function getRewardRebase(uint8 _pid, address _rewardToken, uint _pendingReward) external view returns (uint);
    function getUserInfo(uint8 _pid, address _account) external view returns (uint amount, uint rewardDebt, uint accumulatedEarned, uint lockReward, uint lockRewardReleased);
    function userInfo(address _account) external view returns (uint amount);
}
