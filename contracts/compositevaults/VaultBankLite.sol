// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/GSN/Context.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "./IVaultMaster.sol";
import "./IVault.sol";

contract VaultBankLite is ContextUpgradeSafe, ReentrancyGuard {
    using Address for address;
    using SafeMath for uint;
    using SafeERC20 for IERC20;

    address public governance;
    address public strategist; // who can call harvestXXX() and update reward rate
    IVaultMaster public vaultMaster;

    bool public acceptContractDepositor = false;
    mapping(address => bool) public whitelistedContract;

    function initialize(IVaultMaster _vaultMaster) public initializer {
        vaultMaster = _vaultMaster;
        governance = msg.sender;
        strategist = msg.sender;
    }

    modifier onlyGovernance() {
        require(msg.sender == governance, "!governance");
        _;
    }

    /**
     * @dev Throws if called by a not-whitelisted contract while we do not accept contract depositor.
     */
    modifier checkContract() {
        if (!acceptContractDepositor && !whitelistedContract[msg.sender]) {
            require(!address(msg.sender).isContract() && msg.sender == tx.origin, "contract not support");
        }
        _;
    }

    function setAcceptContractDepositor(bool _acceptContractDepositor) external onlyGovernance {
        acceptContractDepositor = _acceptContractDepositor;
    }

    function whitelistContract(address _contract) external onlyGovernance {
        whitelistedContract[_contract] = true;
    }

    function unwhitelistContract(address _contract) external onlyGovernance {
        whitelistedContract[_contract] = false;
    }

    function setGovernance(address _governance) external onlyGovernance {
        governance = _governance;
    }

    function setStrategist(address _strategist) external onlyGovernance {
        strategist = _strategist;
    }

    function setVaultMaster(IVaultMaster _vaultMaster) external onlyGovernance {
        vaultMaster = _vaultMaster;
    }

    function deposit(IVault _vault, uint _amount, uint _min_mint_amount) public checkContract nonReentrant {
        IERC20(_vault.token()).safeTransferFrom(msg.sender, address(this), _amount);
        IERC20(_vault.token()).safeIncreaseAllowance(address(_vault), _amount);

        uint _mint_amount = _depositToVault(_vault, _amount, _min_mint_amount);

        IERC20(address(_vault)).safeTransfer(msg.sender, _mint_amount);
    }

    function _depositToVault(IVault _vault, uint _amount, uint _min_mint_amount) internal returns (uint _mint_amount) {
        _mint_amount = _vault.deposit(_amount, _min_mint_amount);

    }

    // No rebalance implementation for lower fees and faster swaps
    function withdraw(address _vault, uint _shares, uint _min_output_amount) public nonReentrant {
        uint _wdAmt = _withdraw(_vault, _shares);
        IVault(_vault).withdrawFor(msg.sender, _wdAmt, _min_output_amount);
    }

    function _withdraw(address _vault, uint _shares) internal returns (uint) {
        uint _userBal = IERC20(address(_vault)).balanceOf(msg.sender);
        require(_userBal >= _shares, "_userBal < _shares");

        uint _before = IERC20(address(_vault)).balanceOf(address(this));
        IERC20(address(_vault)).safeTransferFrom(msg.sender, address(this), _shares);
        uint _after = IERC20(address(_vault)).balanceOf(address(this));
        return _after.sub(_before);
    }

    function exit(address _vault, uint _min_output_amount) external {
        withdraw(_vault, IERC20(address(_vault)).balanceOf(msg.sender), _min_output_amount);
    }

    function harvestStrategy(IVault _vault, address _strategy) external nonReentrant {
        if (!_vault.openHarvest()) {
            require(msg.sender == strategist || msg.sender == governance, "!strategist");
        }
        _vault.harvestStrategy(_strategy);
    }

    function harvestAllStrategies(IVault _vault) external nonReentrant {
        if (!_vault.openHarvest()) {
            require(msg.sender == strategist || msg.sender == governance, "!strategist");
        }
        _vault.harvestAllStrategies();
    }

    /**
     * This function allows governance to take unsupported tokens out of the contract. This is in an effort to make someone whole, should they seriously mess up.
     * There is no guarantee governance will vote to return these. It also allows for removal of airdropped tokens.
     */
    function governanceRecoverUnsupported(IERC20 _token, uint amount, address to) external {
        require(msg.sender == governance, "!governance");
        require(!vaultMaster.isVault(address(_token)), "vaultToken");
        _token.safeTransfer(to, amount);
    }
}
