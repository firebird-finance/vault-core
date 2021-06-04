// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IEllipsisSwap {
    function add_liquidity(uint256[3] calldata amounts, uint256 min_mint_amount) external;
}
