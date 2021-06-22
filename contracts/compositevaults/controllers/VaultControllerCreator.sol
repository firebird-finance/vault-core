pragma solidity =0.6.12;

import './VaultController.sol';
import '../../proxy/UpgradableProxy.sol';

contract VaultControllerCreator {
    address public governance;
    address public implementation;
    address public proxyOwner;

    event NewController(address vault);
    event NewControllerProxy(address implement, address proxy);

    constructor() public {
        governance = msg.sender;
        proxyOwner = 0xe59511c0eF42FB3C419Ac2651406b7b8822328E1;
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
        emit NewController(address(controller));

        return address(controller);
    }

    function createProxy() external returns (address) {
        UpgradableProxy controllerProxy = new UpgradableProxy(implementation);
        controllerProxy.transferProxyOwnership(proxyOwner);
        emit NewControllerProxy(implementation, address(controllerProxy));

        return address(controllerProxy);
    }
}