// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IFulcrumLoanToken {
    function mint(address receiver, uint256 depositAmount) external;
}
