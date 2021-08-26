// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-upgradeable/GSN/ContextUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "./IVaultMaster.sol";
import "./IVault.sol";
import "../interfaces/IFirebirdZap.sol";
import "../interfaces/IFirebirdRouter.sol";
import "../interfaces/IWETH.sol";
import "../interfaces/IUniswapV2Pair.sol";

contract VaultBankLite is ContextUpgradeable, ReentrancyGuard {
    using Address for address;
    using SafeMath for uint;
    using SafeERC20 for IERC20;

    address public governance;
    address public strategist; // who can call harvestXXX() and update reward rate
    IVaultMaster public vaultMaster;
    IFirebirdZap public zap;
    address public WETH;
    address private constant WETH_ADDRESS = address(0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE);

    bool public acceptContractDepositor = false;
    mapping(address => bool) public whitelistedContract;

    event LogNewGovernance(address governance);

    receive() external payable {
        require(msg.sender != tx.origin, "Bank: Do not send ETH directly");
    }

    function initialize(IVaultMaster _vaultMaster, IFirebirdZap _zap) public initializer {
        vaultMaster = _vaultMaster;
        zap = _zap;
        WETH = zap.WBNB();
        governance = msg.sender;
        strategist = msg.sender;
    }

    modifier onlyGovernance() {
        require(msg.sender == governance, "Bank: !governance");
        _;
    }

    /**
     * @dev Throws if called by a not-whitelisted contract while we do not accept contract depositor.
     */
    modifier checkContract() {
        if (!acceptContractDepositor && !whitelistedContract[msg.sender]) {
            require(!address(msg.sender).isContract() && msg.sender == tx.origin, "Bank: contract not support");
        }
        _;
    }

    modifier checkVault(address vault) {
        require(vaultMaster.isVault(vault), "Bank: !vault");
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
        emit LogNewGovernance(governance);
    }

    function setStrategist(address _strategist) external onlyGovernance {
        strategist = _strategist;
    }

    function setVaultMaster(IVaultMaster _vaultMaster) external onlyGovernance {
        vaultMaster = _vaultMaster;
    }

    function setZap(IFirebirdZap _zap) external onlyGovernance {
        zap = _zap;
        WETH = zap.WBNB();
    }

    function deposit(IVault _vault, uint _amount, uint _min_mint_amount) external checkContract checkVault(address(_vault)) nonReentrant {
        IERC20(_vault.token()).safeTransferFrom(msg.sender, address(this), _amount);

        _depositToVault(_vault, _amount, _min_mint_amount);
    }

    function depositZap(IVault _vault, uint _min_mint_amount, uint tokenInAmount, address tokenIn, uint8 dexId, address router)
        external payable
        checkContract
        checkVault(address(_vault))
        nonReentrant
    {
        if (tokenIn == WETH_ADDRESS) {
            IWETH(WETH).deposit{value: msg.value}();
            tokenInAmount = msg.value;
            tokenIn = WETH;
        } else {
            IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), tokenInAmount);
        }

        address pair = _getVaultPair(_vault, router);
        _approveTokenIfNeeded(tokenIn, address(zap));
        uint[] memory amounts = new uint[](3);
        amounts[0] = tokenInAmount;
        uint lpAmount = zap.zapInToken(tokenIn, amounts, pair, dexId, router, false);

        _depositToVault(_vault, lpAmount, _min_mint_amount);
    }

    // No rebalance implementation for lower fees and faster swaps
    function withdraw(address _vault, uint _shares, uint _min_output_amount) public checkContract nonReentrant {
        uint _wdAmt = _withdraw(_vault, _shares);
        IVault(_vault).withdrawFor(msg.sender, _wdAmt, _min_output_amount);
    }

    function exit(address _vault, uint _min_output_amount) external {
        withdraw(_vault, IERC20(address(_vault)).balanceOf(msg.sender), _min_output_amount);
    }

    function withdrawRemove(address _vault, uint _shares, uint _min_output_amount, address router) external checkContract nonReentrant {
        uint _wdAmt = _withdraw(_vault, _shares);
        uint lpAmount = IVault(_vault).withdraw(_wdAmt, _min_output_amount);

        address pair = _getVaultPair(IVault(_vault), router);
        _approveTokenIfNeeded(pair, address(zap));
        (uint256 amount0, uint256 amount1) = zap.zapOutToPair(pair, lpAmount, router);

        address token0 = IUniswapV2Pair(pair).token0();
        address token1 = IUniswapV2Pair(pair).token1();
        _transferToken(token0 == WETH ? WETH_ADDRESS : token0, msg.sender, amount0);
        _transferToken(token1 == WETH ? WETH_ADDRESS : token1, msg.sender, amount1);
    }

    function withdrawZap(address _vault, uint _shares, uint _minReceiveAmount, address tokenOut, uint8 dexId, address router)
        external
        checkContract
        nonReentrant
    {
        uint _wdAmt = _withdraw(_vault, _shares);
        uint lpAmount = IVault(_vault).withdraw(_wdAmt, 1);

        address pair = _getVaultPair(IVault(_vault), router);
        _approveTokenIfNeeded(pair, address(zap));
        uint256 amountReceive = zap.zapOut(pair, lpAmount, tokenOut, _minReceiveAmount, dexId, router);

        _transferToken(tokenOut, msg.sender, amountReceive);
    }

    function harvestStrategy(IVault _vault, address _strategy) external nonReentrant {
        if (!_vault.openHarvest()) {
            require(msg.sender == strategist || msg.sender == governance, "Bank: !strategist");
        }
        _vault.harvestStrategy(_strategy);
    }

    function harvestAllStrategies(IVault _vault) external nonReentrant {
        if (!_vault.openHarvest()) {
            require(msg.sender == strategist || msg.sender == governance, "Bank: !strategist");
        }
        _vault.harvestAllStrategies();
    }

    /* ========== Private Functions ========== */
    function _depositToVault(IVault _vault, uint _amount, uint _min_mint_amount) internal {
        IERC20(_vault.token()).safeIncreaseAllowance(address(_vault), _amount);
        _vault.depositFor(msg.sender, _amount, _min_mint_amount);
    }

    function _withdraw(address _vault, uint _shares) internal returns (uint) {
        uint _userBal = IERC20(_vault).balanceOf(msg.sender);
        require(_userBal >= _shares, "Bank: _userBal < _shares");

        uint _before = IERC20(_vault).balanceOf(address(this));
        IERC20(_vault).safeTransferFrom(msg.sender, address(this), _shares);
        uint _after = IERC20(_vault).balanceOf(address(this));
        return _after.sub(_before);
    }

    function _getVaultPair (IVault _vault, address router) private view returns (address pair) {
        pair = _vault.token();
        require(IUniswapV2Pair(pair).factory() == IFirebirdRouter(router).factory(), 'Bank: Incompatible liquidity pair factory');
    }

    function _approveTokenIfNeeded(address token, address spender) private {
        if (IERC20(token).allowance(address(this), spender) == 0) {
            IERC20(token).safeApprove(spender, uint256(~0));
        }
    }

    function _transferToken(address token, address to, uint amount) internal {
        if (token == WETH_ADDRESS) {
            (bool success,) = to.call{value: amount}(new bytes(0));
            require(success, 'Bank: ETH_TRANSFER_FAILED');
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
        return;
    }

    /**
     * This function allows governance to take unsupported tokens out of the contract. This is in an effort to make someone whole, should they seriously mess up.
     * There is no guarantee governance will vote to return these. It also allows for removal of airdropped tokens.
     */
    function governanceRecoverUnsupported(address _token, uint amount, address to) external onlyGovernance {
        require(!vaultMaster.isVault(_token), "Bank: vault token");
        _transferToken(_token, to, amount);
    }
}
