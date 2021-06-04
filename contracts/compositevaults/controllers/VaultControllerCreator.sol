pragma solidity =0.6.12;

import './VaultController.sol';
import '../../proxy/UpgradableProxy.sol';

contract VaultControllerCreator {
    address public governance;
    address public implementation;
    address public proxyOwner;

    constructor() public {
        governance = msg.sender;
    }

    modifier onlyGovernance() {
        require(msg.sender == governance, "!governance");
        _;
    }

    function setGovernance(address _governance) external onlyGovernance {
        governance = _governance;
    }

    function setImplementation(address _implementation) external onlyGovernance {
        implementation = _implementation;
    }

    function setProxyOwner(address _proxyOwner) external onlyGovernance {
        proxyOwner = _proxyOwner;
    }

    function create() external returns (address) {
        VaultController controller = new VaultController();

        return address(controller);
    }

    function createProxy() external returns (address) {
        UpgradableProxy controllerProxy = new UpgradableProxy(implementation);
        controllerProxy.transferProxyOwnership(proxyOwner);

        return address(controllerProxy);
    }
}