// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IBeltMultiStrategyToken {
    function deposit(uint256 _amount, uint256 _minShares) external;
}
