pragma solidity =0.6.12;

import './VaultController.sol';

contract VaultControllerCreator {
    event NewController(address controller);

    function create() external {
        _create();
    }

    function batchCreate(uint num) external {
        for (uint i=0; i<num; i++) {
            _create();
        }
    }

    function _create() internal {
        VaultController controller = new VaultController();
        emit NewController(address(controller));
    }
}