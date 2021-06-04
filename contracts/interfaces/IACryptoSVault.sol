pragma solidity ^0.6.0;

interface IACryptoSVault {
    function deposit(uint256 _amount) external;
    function withdraw(uint256 _shares) external;
    function withdrawAll() external;

    function getPricePerFullShare() external view returns (uint256);
    function earn() external;
}
