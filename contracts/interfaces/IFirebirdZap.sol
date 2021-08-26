// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IFirebirdZap {
    function zapInToken(address _from, uint[] calldata amounts, address _to, uint8 dexId, address uniRouter, bool transferResidual) external returns (uint256 lpAmt);
    function zapOut(address _from, uint amount, address _toToken, uint256 _minTokensRec, uint8 dexId, address uniRouter) external returns (uint256);
    function zapOutToPair(address _from, uint amount, address uniRouter) external returns (uint256 amountA, uint256 amountB);

    function WBNB() external view returns (address);
}
