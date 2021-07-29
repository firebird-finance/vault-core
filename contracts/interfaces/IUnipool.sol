// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IUnipool {
    // Views
    function earned(address account) external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);

    // Mutative
    function stake(uint256 amount) external;
    function withdraw(uint256 amount) external;
    function claimReward() external;
    function withdrawAndClaim() external;
}
