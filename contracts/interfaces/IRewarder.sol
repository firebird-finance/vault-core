// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IRewarder {
    function pendingTokens(uint256 pid, address user, uint256 sushiAmount) external view returns (address[] memory, uint256[] memory);
    function pendingToken(uint256 _pid, address _user) external view returns (uint256 pending);
}
