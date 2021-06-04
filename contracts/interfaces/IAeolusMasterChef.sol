// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IAeolusMasterChef {
    function deposit(uint256 _amount) external;
    function withdraw(uint256 _amount) external;
    function emergencyWithdraw() external;

    function userInfo(address _user) external view returns (uint amount, uint rewardDebt);
    function pendingReward(address _user) external view returns (uint256);
}
