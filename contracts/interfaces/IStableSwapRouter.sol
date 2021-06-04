// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IStableSwapRouter {
    function convert(address fromPool, address toPool, uint256 amount, uint256 minToMint, uint256 deadline) external returns (uint256);
    function addLiquidity(
        address pool,
        address basePool,
        uint256[] memory meta_amounts,
        uint256[] memory base_amounts,
        uint256 minToMint,
        uint256 deadline
    ) external returns (uint256);
    function removeLiquidity(
        address pool,
        address basePool,
        uint256 _amount,
        uint256[] calldata min_amounts_meta,
        uint256[] calldata min_amounts_base,
        uint256 deadline
    ) external;
    function removeBaseLiquidityOneToken(
        address pool,
        address basePool,
        uint256 _token_amount,
        uint8 i,
        uint256 _min_amount,
        uint256 deadline
    ) external;
    function swapFromBase(
        address pool,
        address basePool,
        uint8 tokenIndexFrom,
        uint8 tokenIndexTo,
        uint256 dx,
        uint256 minDy,
        uint256 deadline
    ) external returns (uint256);
    function swapToBase(
        address pool,
        address basePool,
        uint8 tokenIndexFrom,
        uint8 tokenIndexTo,
        uint256 dx,
        uint256 minDy,
        uint256 deadline
    ) external returns (uint256);
}
