// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IBeltLP {
    function add_liquidity(uint256[4] calldata amounts, uint256 minToMint) external;
}
