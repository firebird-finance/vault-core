pragma solidity =0.6.12;

import './Vault.sol';

contract VaultCreator {

    function create() external returns (address) {
        Vault vault = new Vault();

        return address(vault);
    }
}