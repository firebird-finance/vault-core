// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IIronZapPool {
    function zapMint(uint256 _collateral_amount, uint256 _dollar_out_min) external;

    function collateral() external view returns (address);
    function dollar() external view returns (address);
}
