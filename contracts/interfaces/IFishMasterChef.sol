// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IFishMasterChef {
    function deposit(uint256 _pid, uint256 _amount, address _referrer) external;
    function withdraw(uint256 _pid, uint256 _amount) external;

    function pendingFish(uint256 _pid, address _user) external view returns (uint);
    function userInfo(uint _pid, address _user) external view returns (uint amount, uint rewardDebt);
    function emergencyWithdraw(uint _pid) external;
}
