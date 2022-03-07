// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IFantasmChef {
    function deposit(uint256 pid, uint256 amount, address to) external;
    function withdraw(uint256 pid, uint256 amount, address to) external;
    function harvest(uint256 pid, address to) external;
    function withdrawAndHarvest(uint256 pid, uint256 amount, address to) external;
    function emergencyWithdraw(uint256 pid, address to) external;

    function rewarder(uint id) external view returns (address);
    function userInfo(uint _pid, address _user) external view returns (uint amount, uint rewardDebt);
    function pendingReward(uint256 _pid, address _user) external view returns (uint256 pending);
    function rewardMinter() external view returns (address);
}
