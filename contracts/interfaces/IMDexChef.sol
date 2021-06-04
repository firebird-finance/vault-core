// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IMDexChef {
    function deposit(uint256 _pid, uint256 _amount) external;
    function withdraw(uint256 _pid, uint256 _amount) external;
    function emergencyWithdraw(uint256 _pid) external;

    function multLpToken() external view returns (address);
    function mdx() external view returns (address);
    function pending(uint256 _pid, address _user) external view returns (uint256 mdxAmount, uint256 tokenAmount);
    function userInfo(uint _pid, address _user) external view returns (uint amount, uint rewardDebt, uint multLpRewardDebt);
}
