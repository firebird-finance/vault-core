// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IVault {
    function cap() external view returns (uint);
    function getVaultMaster() external view returns (address);
    function balance() external view returns (uint);
    function token() external view returns (address);
    function available() external view returns (uint);
    function accept(address _input) external view returns (bool);
    function openHarvest() external view returns (bool);

    function earn() external;
    function harvest(address reserve, uint amount) external;
    function addNewCompound(uint, uint) external;

    function withdraw_fee(uint _shares) external view returns (uint);
    function calc_token_amount_deposit(uint _amount) external view returns (uint);
    function calc_token_amount_withdraw(uint _shares) external view returns (uint);

    function getPricePerFullShare() external view returns (uint);

    function deposit(uint _amount, uint _min_mint_amount) external returns (uint);
    function depositFor(address _account, address _to, uint _amount, uint _min_mint_amount) external returns (uint _mint_amount);
    function withdraw(uint _shares, uint _min_output_amount) external returns (uint);
    function withdrawFor(address _account, uint _shares, uint _min_output_amount) external returns (uint _output_amount);

    function harvestStrategy(address _strategy) external;
    function harvestAllStrategies() external;
}
