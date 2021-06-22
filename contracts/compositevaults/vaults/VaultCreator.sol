pragma solidity =0.6.12;

import './Vault.sol';
import '../../proxy/UpgradableProxy.sol';

contract VaultCreator {
    address public governance;
    address public implementation;
    address public proxyOwner;

    event NewVault(address vault);
    event NewVaultProxy(address implement, address proxy);

    constructor() public {
        governance = msg.sender;
        proxyOwner = 0xF76b15ED18c487d8528a295171Dbec24E4A7A0De;
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
        Vault vault = new Vault();
        emit NewVault(address(vault));

        return address(vault);
    }

    function createProxy() external returns (address) {
        UpgradableProxy vaultProxy = new UpgradableProxy(implementation);
        vaultProxy.transferProxyOwnership(proxyOwner);
        emit NewVaultProxy(implementation, address(vaultProxy));

        return address(vaultProxy);
    }
}