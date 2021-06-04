pragma solidity ^0.6.0;

interface ICodexFairLaunch {
    function deposit(address _for, uint256 _pid, uint256 _amount) external;
    function withdraw(address _for, uint256 _pid, uint256 _amount) external;
    function withdrawAll(address _for, uint256 _pid) external;
    function emergencyWithdraw(uint256 _pid) external;
    // Harvest ALPACAs earn from the pool.
    function harvest(uint256 _pid) external;

    function pendingCodex(uint256 _pid, address _user) external view returns (uint256);
    function userInfo(uint256 _pid, address _user) external view returns (uint256 amount, uint256 rewardDebt, uint256 fundedBy);
}
