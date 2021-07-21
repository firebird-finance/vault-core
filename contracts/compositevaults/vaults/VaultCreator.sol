pragma solidity =0.6.12;

import './Vault.sol';

contract VaultCreator {
    event NewVault(address vault);

    function create() external {
        _create();
    }

    function batchCreate(uint num) external {
        for (uint i=0; i<num; i++) {
            _create();
        }
    }

    function _create() internal {
        Vault vault = new Vault();
        emit NewVault(address(vault));
    }
}