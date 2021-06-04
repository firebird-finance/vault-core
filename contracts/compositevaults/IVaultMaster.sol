// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IVaultMaster {
    event UpdateBank(address bank, address vault);
    event UpdateVault(address vault, bool isAdd);
    event UpdateController(address controller, bool isAdd);
    event UpdateStrategy(address strategy, bool isAdd);

    function bankMaster() view external returns (address);
    function bank(address) view external returns (address);
    function isVault(address) view external returns (bool);
    function isController(address) view external returns (bool);
    function isStrategy(address) view external returns (bool);

    function slippage(address) view external returns (uint);
    function convertSlippage(address _input, address _output) view external returns (uint);

    function reserveFund() view external returns (address);
    function performanceReward() view external returns (address);

    function performanceFee() view external returns (uint);
    function gasFee() view external returns (uint);

    function withdrawalProtectionFee() view external returns (uint);
}
