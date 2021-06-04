// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";
import "./IVaultMaster.sol";

contract VaultMaster is IVaultMaster {
    using SafeERC20 for IERC20;

    address public governance;

    address public override reserveFund = 0x7Be4D5A99c903C437EC77A20CB6d0688cBB73c7f; // % profit from Vaults
    address public override performanceReward = 0x7Be4D5A99c903C437EC77A20CB6d0688cBB73c7f; // set to deploy wallet at start

    uint256 public override performanceFee = 500; // 5%
    uint256 public override gasFee = 0; // 0% at start and can be set by governance decision
    uint256 public override withdrawalProtectionFee = 0; // % of withdrawal go back to vault (for auto-compounding) to protect withdrawals

    address public override bankMaster; //use this for all strategy
    mapping(address => address) public override bank;
    mapping(address => bool) public override isVault;
    mapping(address => bool) public override isController;
    mapping(address => bool) public override isStrategy;

    mapping(address => uint) public override slippage; // over 10000

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

    function setBankMaster(address _bankMaster) public onlyGovernance {
        bankMaster = _bankMaster;
        emit UpdateBank(_bankMaster, address(0));
    }

    function setBank(address _vault, address _bank) public onlyGovernance {
        bank[_vault] = _bank;
        emit UpdateBank(_bank, _vault);
    }

    function setBanks(address[] memory _vaults, address _bank) external {
        for (uint i=0; i < _vaults.length; i++) {
            setBank(_vaults[i], _bank);
        }
    }

    function addVault(address _vault) public onlyGovernance {
        isVault[_vault] = true;
        emit UpdateVault(_vault, true);
    }

    function addVaults(address[] memory _vaults) external {
        for (uint i=0; i < _vaults.length; i++) {
            addVault(_vaults[i]);
        }
    }

    function removeVault(address _vault) public onlyGovernance {
        isVault[_vault] = false;
        emit UpdateVault(_vault, false);
    }

    function removeVaults(address[] memory _vaults) external {
        for (uint i=0; i < _vaults.length; i++) {
            removeVault(_vaults[i]);
        }
    }

    function addController(address _controller) public onlyGovernance {
        isController[_controller] = true;
        emit UpdateController(_controller, true);
    }

    function addControllers(address[] memory _controllers) external {
        for (uint i=0; i < _controllers.length; i++) {
            addController(_controllers[i]);
        }
    }

    function removeController(address _controller) public onlyGovernance {
        isController[_controller] = true;
        emit UpdateController(_controller, false);
    }

    function removeControllers(address[] memory _controllers) external {
        for (uint i=0; i < _controllers.length; i++) {
            removeController(_controllers[i]);
        }
    }

    function addStrategy(address _strategy) public onlyGovernance {
        isStrategy[_strategy] = true;
        emit UpdateStrategy(_strategy, true);
    }

    function addStrategies(address[] memory _strategies) external {
        for (uint i=0; i < _strategies.length; i++) {
            addStrategy(_strategies[i]);
        }
    }

    function removeStrategy(address _strategy) public onlyGovernance {
        isStrategy[_strategy] = false;
        emit UpdateStrategy(_strategy, false);
    }

    function removeStrategies(address[] memory _strategies) external {
        for (uint i=0; i < _strategies.length; i++) {
            removeStrategy(_strategies[i]);
        }
    }

    function setReserveFund(address _reserveFund) public onlyGovernance {
        reserveFund = _reserveFund;
    }

    function setPerformanceReward(address _performanceReward) public onlyGovernance {
        performanceReward = _performanceReward;
    }

    function setPerformanceFee(uint256 _performanceFee) public onlyGovernance {
        require(_performanceFee <= 3000, "_performanceFee over 30%");
        performanceFee = _performanceFee;
    }

    function setGasFee(uint256 _gasFee) public onlyGovernance {
        require(_gasFee <= 500, "_gasFee over 5%");
        gasFee = _gasFee;
    }

    function setWithdrawalProtectionFee(uint256 _withdrawalProtectionFee) public onlyGovernance {
        require(_withdrawalProtectionFee <= 100, "_withdrawalProtectionFee over 1%");
        withdrawalProtectionFee = _withdrawalProtectionFee;
    }

    function setSlippage(address _token, uint _slippage) external onlyGovernance {
        require(_slippage <= 1000, ">10%");
        slippage[_token] = _slippage;
    }

    function convertSlippage(address _input, address _output) external override view  returns (uint) {
        uint _is = slippage[_input];
        uint _os = slippage[_output];
        return (_is > _os) ? _is : _os;
    }

    /**
     * This function allows governance to take unsupported tokens out of the contract. This is in an effort to make someone whole, should they seriously mess up.
     * There is no guarantee governance will vote to return these. It also allows for removal of airdropped tokens.
     */
    function governanceRecoverUnsupported(IERC20 _token, uint256 amount, address to) external onlyGovernance {
        _token.safeTransfer(to, amount);
    }
}
