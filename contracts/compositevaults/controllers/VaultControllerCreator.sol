pragma solidity =0.6.12;

import './VaultController.sol';

contract VaultControllerCreator {
    event NewController(address controller);

    function create() external returns (address) {
        VaultController controller = new VaultController();
        emit NewController(address(controller));

        return address(controller);
    }
}