// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface ILpTokenStaker {
    function deposit(uint256 _pid, uint256 _amount) external;
    function withdraw(uint256 _pid, uint256 _amount) external;
    function emergencyWithdraw(uint256 _pid) external;
    function claim(uint256[] calldata _pids) external;

    function claimableReward(uint256 _pid, address _user) external view returns (uint256);
    function userInfo(uint _pid, address _user) external view returns (uint amount, uint rewardDebt);
}
