pragma solidity =0.6.12;

import './Vault.sol';

contract VaultCreator {
    event NewVault(address vault);

    function create() external returns (address) {
        Vault vault = new Vault();
        emit NewVault(address(vault));

        return address(vault);
    }
}