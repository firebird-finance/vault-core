// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IHopeChef {
    function deposit(uint _poolId, uint _amount) external;
    function depositWithRef(uint256 _pid, uint256 _amount, address _referrer) external;
    function withdraw(uint _poolId, uint _amount) external;
    function withdrawAll(uint256 _pid) external;
    function emergencyWithdraw(uint _pid) external;

    function pendingReward(uint _pid, address _user) external view returns (uint);
    function userInfo(uint _pid, address _user) external view returns (uint amount, uint rewardDebt);
}
