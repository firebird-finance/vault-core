// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface ILQTYStaking {
    // Views
    function getPendingETHGain(address _user) external view returns (uint);
    function getPendingLUSDGain(address _user) external view returns (uint);
    function stakes(address account) external view returns (uint256);

    // Mutative
    function stake(uint _LQTYamount) external;
    function unstake(uint _LQTYamount) external;
}
