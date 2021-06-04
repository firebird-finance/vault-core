// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IStrategy {
    event Deposit(address token, uint amount);
    event Withdraw(address token, uint amount, address to);
    event Harvest(uint priceShareBefore, uint priceShareAfter, address compoundToken, uint compoundBalance, address profitToken, uint reserveFundAmount);

    function baseToken() external view returns (address);
    function deposit() external;
    function withdraw(address _asset) external returns (uint);
    function withdraw(uint _amount) external returns (uint);
    function withdrawToController(uint _amount) external;
    function skim() external;
    function harvest(address _mergedStrategy) external;
    function withdrawAll() external returns (uint);
    function balanceOf() external view returns (uint);
    function beforeDeposit() external;
}
