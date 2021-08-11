// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IPolycatMasterChef {
    function deposit(uint256 _pid, uint256 _amount, bool _shouldHarvest) external;
    function withdraw(uint256 _pid, uint256 _amount, bool _shouldHarvest) external;
    function emergencyWithdraw(uint256 _pid) external;
    function harvest(uint256 _pid) external;

    function pendingPaw(uint256 _pid, address _user) external view returns (uint256);
    function userInfo(uint _pid, address _user) external view returns (uint amount, uint lastPawPerShare, uint unclaimed);
    function rewardLocker() external view returns (address);
}
