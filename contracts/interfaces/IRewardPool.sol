// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IRewardPool {
    function deposit(uint _poolId, uint _amount) external;
    function withdraw(uint _poolId, uint _amount) external;
    function pendingReward(uint _pid, address _user) external view returns (uint);
    function userInfo(uint _pid, address _user) external view returns (uint amount, uint rewardDebt);
    function emergencyWithdraw(uint _pid) external;
}
