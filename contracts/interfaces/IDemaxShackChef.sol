pragma solidity ^0.6.0;

interface IDemaxShackChef {
    function deposit(uint256 _pid, uint256 _amount) payable external;
    function withdraw(uint256 _pid, uint256 _amount) external;
    function emergencyWithdraw(uint256 _pid) external;
    function harvest(uint256 _pid) external;

    function pendingReward(uint256 _pid, address _user) external view returns (uint256);
    function pendingEarn(uint256 _pid, address _user) external view returns (uint256);
    function canDeposit(uint256 _pid, address _user) external view returns (uint256);
    function userInfo(uint256 _pid, address _user) external view returns (uint256 amount, uint256 rewardDebt, uint256 earnDebt);
    function tokenRouters(address _token) external view returns (address);
    function swapTokens(address _token) external view returns (address);
    function poolInfo(uint256 _pid) external view returns (uint256, address, address);
}
