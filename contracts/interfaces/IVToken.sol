// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IVToken {
    function _acceptAdmin (  ) external returns ( uint256 );
    function _addReserves ( uint256 addAmount ) external returns ( uint256 );
    function _reduceReserves ( uint256 reduceAmount ) external returns ( uint256 );
    function _setComptroller ( address newComptroller ) external returns ( uint256 );
    function _setImplementation ( address implementation_, bool allowResign, bytes calldata becomeImplementationData ) external;
    function _setInterestRateModel ( address newInterestRateModel ) external returns ( uint256 );
    function _setPendingAdmin ( address newPendingAdmin ) external returns ( uint256 );
    function _setReserveFactor ( uint256 newReserveFactorMantissa ) external returns ( uint256 );
    function accrualBlockNumber (  ) external view returns ( uint256 );
    function accrueInterest (  ) external returns ( uint256 );
    function admin (  ) external view returns ( address );
    function allowance ( address owner, address spender ) external view returns ( uint256 );
    function approve ( address spender, uint256 amount ) external returns ( bool );
    function balanceOf ( address owner ) external view returns ( uint256 );
    function balanceOfUnderlying ( address owner ) external returns ( uint256 );
    function borrow ( uint256 borrowAmount ) external returns ( uint256 );
    function borrowBalanceCurrent ( address account ) external returns ( uint256 );
    function borrowBalanceStored ( address account ) external view returns ( uint256 );
    function borrowIndex (  ) external view returns ( uint256 );
    function borrowRatePerBlock (  ) external view returns ( uint256 );
    function comptroller (  ) external view returns ( address );
    function decimals (  ) external view returns ( uint8 );
    function delegateToImplementation ( bytes calldata data ) external returns ( bytes memory );
    function delegateToViewImplementation ( bytes calldata data ) external view returns ( bytes memory );
    function exchangeRateCurrent (  ) external returns ( uint256 );
    function exchangeRateStored (  ) external view returns ( uint256 );
    function getAccountSnapshot ( address account ) external view returns ( uint256, uint256, uint256, uint256 );
    function getCash (  ) external view returns ( uint256 );
    function implementation (  ) external view returns ( address );
    function interestRateModel (  ) external view returns ( address );
    function isVToken (  ) external view returns ( bool );
    function liquidateBorrow ( address borrower, uint256 repayAmount, address vTokenCollateral ) external returns ( uint256 );
    function mint ( uint256 mintAmount ) external returns ( uint256 );
    function name (  ) external view returns ( string memory );
    function pendingAdmin (  ) external view returns ( address );
    function redeem ( uint256 redeemTokens ) external returns ( uint256 );
    function redeemUnderlying ( uint256 redeemAmount ) external returns ( uint256 );
    function repayBorrow ( uint256 repayAmount ) external returns ( uint256 );
    function repayBorrowBehalf ( address borrower, uint256 repayAmount ) external returns ( uint256 );
    function reserveFactorMantissa (  ) external view returns ( uint256 );
    function seize ( address liquidator, address borrower, uint256 seizeTokens ) external returns ( uint256 );
    function supplyRatePerBlock (  ) external view returns ( uint256 );
    function symbol (  ) external view returns ( string memory );
    function totalBorrows (  ) external view returns ( uint256 );
    function totalBorrowsCurrent (  ) external returns ( uint256 );
    function totalReserves (  ) external view returns ( uint256 );
    function totalSupply (  ) external view returns ( uint256 );
    function transfer ( address dst, uint256 amount ) external returns ( bool );
    function transferFrom ( address src, address dst, uint256 amount ) external returns ( bool );
    function underlying (  ) external view returns ( address );
}

interface IVBNB {
    function mint() external payable;

    function redeem(uint256 redeemTokens) external returns (uint256);

    function redeemUnderlying(uint256 redeemAmount) external returns (uint256);

    function borrow(uint256 borrowAmount) external returns (uint256);

    function repayBorrow() external payable;

    function balanceOfUnderlying(address owner) external returns (uint256);

    function borrowBalanceCurrent(address account) external returns (uint256);
}
