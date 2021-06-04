pragma solidity =0.6.12;

import './VaultController.sol';
import "../../interfaces/IVaultControllerCreator.sol";

contract VaultControllerCreator is IVaultControllerCreator {

    function create() external override returns (address) {
        VaultController controller = new VaultController();

        return address(controller);
    }
}