// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

import "../../interfaces/IUniswapV2Router.sol";
import "../../interfaces/Balancer.sol";

import "../IVault.sol";
import "../IController.sol";
import "../IVaultMaster.sol";
import "../../interfaces/IFirebirdRouter.sol";
import "../IStrategy.sol";

/*

 A strategy must implement the following calls;

 - deposit()
 - withdraw(address) must exclude any tokens used in the yield - Controller role - withdraw should return to Controller
 - withdraw(uint) - Controller | Vault role - withdraw should always return to vault
 - withdrawAll() - Controller | Vault role - withdraw should always return to vault
 - balanceOf()

 Where possible, strategies must remain as immutable as possible, instead of updating variables, we update the contract by linking it in the controller

*/

abstract contract StrategyBase is IStrategy, ReentrancyGuard, Initializable {
    using SafeERC20 for IERC20;
    using Address for address;
    using SafeMath for uint;

    IUniswapV2Router public unirouter = IUniswapV2Router(0xF491e7B69E4244ad4002BC14e878a34207E38c29);
    IFirebirdRouter public firebirdRouter = IFirebirdRouter(0xe0C38b2a8D09aAD53f1C67734B9A95E43d5981c0);

    address public override baseToken;
    address public farmingToken;
    address public targetCompoundToken; // farmingToken -> compoundToken -> baseToken
    address public targetProfitToken; // compoundToken -> profit

    address public governance;
    uint public timeToReleaseCompound = 30 minutes; // 0 to disable
    address public timelock = address(0x6eB5BBE1CE4b156Bdd6211E5E69CD637377a6C1A);

    address public controller;
    address public strategist;

    IVault public vault;
    IVaultMaster public vaultMaster;

    mapping(address => mapping(address => address[])) public uniswapPaths; // [input -> output] => uniswap_path
    mapping(address => mapping(address => address[])) public firebirdPairs; // [input -> output] => firebird pair

    uint256 public performanceFee = 0; //1400 <-> 14.0%
    uint public lastHarvestTimeStamp;

    function initialize(address _baseToken, address _farmingToken, address _controller, address _targetCompoundToken, address _targetProfitToken) internal {
        baseToken = _baseToken;
        farmingToken = _farmingToken;
        targetCompoundToken = _targetCompoundToken;
        targetProfitToken = _targetProfitToken;
        controller = _controller;
        vault = IController(_controller).vault();
        require(address(vault) != address(0), "!vault");
        vaultMaster = IVaultMaster(vault.getVaultMaster());
        governance = msg.sender;
        strategist = msg.sender;

        if (farmingToken != address(0)) {
            IERC20(farmingToken).approve(address(unirouter), type(uint256).max);
            IERC20(farmingToken).approve(address(firebirdRouter), type(uint256).max);
        }
        if (targetCompoundToken != farmingToken) {
            IERC20(targetCompoundToken).approve(address(unirouter), type(uint256).max);
            IERC20(targetCompoundToken).approve(address(firebirdRouter), type(uint256).max);
        }
        if (targetProfitToken != targetCompoundToken && targetProfitToken != farmingToken) {
            IERC20(targetProfitToken).approve(address(unirouter), type(uint256).max);
            IERC20(targetProfitToken).approve(address(firebirdRouter), type(uint256).max);
        }
    }

    modifier onlyTimelock() {
        require(msg.sender == timelock, "!timelock");
        _;
    }

    modifier onlyGovernance() {
        require(msg.sender == governance, "!governance");
        _;
    }

    modifier onlyStrategist() {
        require(msg.sender == strategist || msg.sender == governance, "!strategist");
        _;
    }

    modifier onlyAuthorized() {
        require(msg.sender == address(controller) || msg.sender == strategist || msg.sender == governance, "!authorized");
        _;
    }

    function getName() public virtual pure returns (string memory);

    function approveForSpender(IERC20 _token, address _spender, uint _amount) external onlyTimelock {
        _token.approve(_spender, _amount);
    }

    function setUnirouter(IUniswapV2Router _unirouter) external onlyTimelock {
        unirouter = _unirouter;
    }

    function setFirebirdRouter(IFirebirdRouter _firebirdRouter) external onlyTimelock {
        firebirdRouter = _firebirdRouter;
    }

    function setUnirouterPath(address _input, address _output, address [] memory _path) external onlyStrategist {
        uniswapPaths[_input][_output] = _path;
    }

    function setFirebirdPairs(address _input, address _output, address [] memory _pair) external onlyStrategist {
        firebirdPairs[_input][_output] = _pair;
    }

    function beforeDeposit() external override virtual onlyAuthorized {}

    function deposit() external override virtual;

    function skim() external override {
        IERC20(baseToken).safeTransfer(controller, IERC20(baseToken).balanceOf(address(this)));
    }

    function withdraw(address _asset) external override onlyAuthorized returns (uint balance) {
        require(baseToken != _asset, "lpPair");

        balance = IERC20(_asset).balanceOf(address(this));
        IERC20(_asset).safeTransfer(controller, balance);
        emit Withdraw(_asset, balance, controller);
    }

    function withdrawToController(uint _amount) external override onlyAuthorized {
        require(controller != address(0), "!controller"); // additional protection so we don't burn the funds

        uint _balance = IERC20(baseToken).balanceOf(address(this));
        if (_balance < _amount) {
            _amount = _withdrawSome(_amount.sub(_balance));
            _amount = _amount.add(_balance);
        }

        IERC20(baseToken).safeTransfer(controller, _amount);
        emit Withdraw(baseToken, _amount, controller);
    }

    function _withdrawSome(uint _amount) internal virtual returns (uint);

    // Withdraw partial funds, normally used with a vault withdrawal
    function withdraw(uint _amount) external override onlyAuthorized returns (uint) {
        return _withdraw(_amount);
    }

    // For abi detection
    function withdrawToVault(uint _amount) external onlyAuthorized returns (uint) {
        return _withdraw(_amount);
    }

    function _withdraw(uint _amount) internal returns (uint) {
        uint _balance = IERC20(baseToken).balanceOf(address(this));
        if (_balance < _amount) {
            _amount = _withdrawSome(_amount.sub(_balance));
            _amount = _amount.add(_balance);
        }

        IERC20(baseToken).safeTransfer(address(vault), _amount);
        emit Withdraw(baseToken, _amount, address(vault));
        return _amount;
    }

    // Withdraw all funds, normally used when migrating strategies
    function withdrawAll() external override onlyAuthorized returns (uint balance) {
        _withdrawAll();
        balance = IERC20(baseToken).balanceOf(address(this));
        IERC20(baseToken).safeTransfer(address(vault), balance);
        emit Withdraw(baseToken, balance, address(vault));
    }

    function _withdrawAll() internal virtual;

    function claimReward() public virtual;

    function retireStrat() external virtual;

    function _swapTokens(address _input, address _output, uint256 _amount) internal returns (uint) {
        return _swapTokens(_input, _output, _amount, address(this));
    }

    function _swapTokens(address _input, address _output, uint256 _amount, address _receiver) internal virtual returns (uint) {
        if (_receiver == address(0)) _receiver = address(this);
        if (_input == _output || _amount == 0) {
            if (_receiver != address(this) && _amount != 0) IERC20(_input).safeTransfer(_receiver, _amount);
            return _amount;
        }
        address[] memory path = firebirdPairs[_input][_output];
        uint before = IERC20(_output).balanceOf(_receiver);
        if (path.length > 0) { // use firebird
            uint8[] memory dexIds = new uint8[](path.length);
            firebirdRouter.swapExactTokensForTokensSupportingFeeOnTransferTokens(_input, _output, _amount, 1, path, dexIds, _receiver, block.timestamp);
        } else { // use Uniswap
            path = uniswapPaths[_input][_output];
            if (path.length == 0) {
                // path: _input -> _output
                path = new address[](2);
                path[0] = _input;
                path[1] = _output;
            }
            unirouter.swapExactTokensForTokensSupportingFeeOnTransferTokens(_amount, 1, path, _receiver, block.timestamp);
        }
        return IERC20(_output).balanceOf(_receiver).sub(before);
    }

    function _buyWantAndReinvest() internal virtual;

    function harvest(address _mergedStrategy) external override virtual nonReentrant {
        require(msg.sender == controller || msg.sender == strategist || msg.sender == governance, "!authorized");

        uint256 pricePerFullShareBefore = vault.getPricePerFullShare();
        claimReward();
        address _targetCompoundToken = targetCompoundToken;
        {
            address _farmingToken = farmingToken;
            if (_farmingToken != address(0)) {
                uint _farmingTokenBal = IERC20(_farmingToken).balanceOf(address(this));
                if (_farmingTokenBal > 0) {
                    _swapTokens(_farmingToken, _targetCompoundToken, _farmingTokenBal);
                }
            }
        }

        uint256 _targetCompoundBal = IERC20(_targetCompoundToken).balanceOf(address(this));

        if (_targetCompoundBal > 0) {
            if (_mergedStrategy != address(0)) {
                require(vaultMaster.isStrategy(_mergedStrategy), "!strategy"); // additional protection so we don't burn the funds
                IERC20(_targetCompoundToken).safeTransfer(_mergedStrategy, _targetCompoundBal); // forward WETH to one strategy and do the profit split all-in-one there (gas saving)
            } else {
                address _reserveFund = vaultMaster.reserveFund();
                address _performanceReward = vaultMaster.performanceReward();
                uint _performanceFee = getPerformanceFee();
                uint _gasFee = vaultMaster.gasFee();

                uint _reserveFundAmount;
                address _targetProfitToken = targetProfitToken;
                if (_performanceFee > 0 && _reserveFund != address(0)) {
                    _reserveFundAmount = _targetCompoundBal.mul(_performanceFee).div(10000);
                    _reserveFundAmount = _swapTokens(_targetCompoundToken, _targetProfitToken, _reserveFundAmount, _reserveFund);
                }

                if (_gasFee > 0 && _performanceReward != address(0)) {
                    _swapTokens(_targetCompoundToken, _targetProfitToken, _targetCompoundBal.mul(_gasFee).div(10000), _performanceReward);
                }

                _buyWantAndReinvest();

                uint256 pricePerFullShareAfter = vault.getPricePerFullShare();
                emit Harvest(pricePerFullShareBefore, pricePerFullShareAfter, _targetCompoundToken, _targetCompoundBal, _targetProfitToken, _reserveFundAmount);
            }
        }

        lastHarvestTimeStamp = block.timestamp;
    }

    // Only allows to earn some extra yield from non-core tokens
    function earnExtra(address _token) external {
        require(msg.sender == address(this) || msg.sender == controller || msg.sender == strategist || msg.sender == governance, "!authorized");
        require(address(_token) != address(baseToken), "token");
        uint _amount = IERC20(_token).balanceOf(address(this));
        _swapTokens(_token, targetCompoundToken, _amount);
    }

    function balanceOfPool() public virtual view returns (uint);

    function balanceOf() public override view returns (uint) {
        return IERC20(baseToken).balanceOf(address(this)).add(balanceOfPool());
    }

    function claimable_tokens() external virtual view returns (address[] memory, uint[] memory);

    function claimable_token() external virtual view returns (address, uint);

    function getTargetFarm() external virtual view returns (address);

    function getTargetPoolId() external virtual view returns (uint);

    function getPerformanceFee() public view returns (uint) {
        if (performanceFee > 0) {
            return performanceFee;
        } else {
            return vaultMaster.performanceFee();
        }
    }

    function setGovernance(address _governance) external onlyGovernance {
        governance = _governance;
    }

    function setTimelock(address _timelock) external onlyTimelock {
        timelock = _timelock;
    }

    function setStrategist(address _strategist) external onlyStrategist {
        strategist = _strategist;
    }

    function setController(address _controller) external onlyTimelock {
        controller = _controller;
        vault = IVault(IController(_controller).vault());
        require(address(vault) != address(0), "!vault");
        vaultMaster = IVaultMaster(vault.getVaultMaster());
        baseToken = vault.token();
    }

    function setPerformanceFee(uint256 _performanceFee) external onlyGovernance {
        require(_performanceFee < 10000, "performanceFee too high");
        performanceFee = _performanceFee;
    }

    function setTimeToReleaseCompound(uint _timeSeconds) external onlyStrategist {
        timeToReleaseCompound = _timeSeconds;
    }

    function setFarmingToken(address _farmingToken) external onlyStrategist {
        farmingToken = _farmingToken;
    }

    function setTargetCompoundToken(address _targetCompoundToken) external onlyStrategist {
        require(_targetCompoundToken != address(0), "!targetCompoundToken");
        targetCompoundToken = _targetCompoundToken;
    }

    function setTargetProfitToken(address _targetProfitToken) external onlyStrategist {
        require(_targetProfitToken != address(0), "!targetProfitToken");
        targetProfitToken = _targetProfitToken;
    }

    function setApproveRouterForToken(address _token, uint _amount) external onlyStrategist {
        IERC20(_token).approve(address(unirouter), _amount);
        IERC20(_token).approve(address(firebirdRouter), _amount);
    }

    event ExecuteTransaction(address indexed target, uint value, string signature, bytes data);

    /**
     * @dev This is from Timelock contract.
     */
    function executeTransaction(address target, uint value, string memory signature, bytes memory data) external onlyTimelock returns (bytes memory) {
        bytes memory callData;

        if (bytes(signature).length == 0) {
            callData = data;
        } else {
            callData = abi.encodePacked(bytes4(keccak256(bytes(signature))), data);
        }

        // solium-disable-next-line security/no-call-value
        (bool success, bytes memory returnData) = target.call{value : value}(callData);
        require(success, string(abi.encodePacked(getName(), "::executeTransaction: Transaction execution reverted.")));

        emit ExecuteTransaction(target, value, signature, data);

        return returnData;
    }
}
