// SPDX-License-Identifier: MIT
pragma experimental ABIEncoderV2;
pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./StrategyBase.sol";
import "../../interfaces/IBeethovenxMasterChef.sol";
import "../../interfaces/IRewarder.sol";
import "../../interfaces/IBalancerV2Vault.sol";

/*

 A strategy must implement the following calls;

 - deposit()
 - withdraw(address) must exclude any tokens used in the yield - Controller role - withdraw should return to Controller
 - withdraw(uint) - Controller | Vault role - withdraw should always return to vault
 - withdrawAll() - Controller | Vault role - withdraw should always return to vault
 - balanceOf()

 Where possible, strategies must remain as immutable as possible, instead of updating variables, we update the contract by linking it in the controller

*/

contract StrategyBalancerLp is StrategyBase {
    address public farmPool = 0x0895196562C7868C5Be92459FaE7f877ED450452;
    uint public poolId;
    address[] public farmingTokens;

    mapping(address => mapping(address => bytes32)) public balancerPoolPaths; // [input -> output] => pool id

    address public balancerV2Vault;
    uint public totalUnderlyingTokens;
    uint public tokenCompoundIndex; //index to add lp
    bytes32 public poolID_bytes;
    mapping (uint8 => address) public LPs;

    // baseToken       = 0xA527a61703D82139F8a06Bc30097cC9CAA2df5A6 (CAKEBNB-CAKELP)
    // farmingToken = 0x4f47a0d15c1e53f3d94c069c7d16977c29f9cb6b (RAMEN)
    // targetCompound = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c (BNB)
    function initialize(
        address _baseToken, address[] memory _farmingTokens,
        address _farmPool, uint _poolId, address _targetCompound, address _targetProfit, address _balancerV2Vault,
        address _controller
    ) public nonReentrant initializer {
        initialize(_baseToken, address(0), _controller, _targetCompound, _targetProfit);
        farmPool = _farmPool;
        poolId = _poolId;
        farmingTokens = _farmingTokens;

        poolID_bytes = IBasePool(_baseToken).getPoolId();
        balancerV2Vault = _balancerV2Vault;
        //gather underlying tokens
        (address[] memory _lps,,) = IBalancerV2Vault(_balancerV2Vault).getPoolTokens(poolID_bytes);
        totalUnderlyingTokens = uint8(_lps.length);
        for(uint8 i; i < _lps.length; i++){
            LPs[i] = _lps[i];
            if(LPs[i] == _targetCompound){
                tokenCompoundIndex = i;
            }
        }

        IERC20(baseToken).approve(address(farmPool), type(uint256).max);
        IERC20(_targetCompound).approve(address(_balancerV2Vault), type(uint256).max);

        for (uint i=0; i<farmingTokens.length; i++) {
            IERC20(farmingTokens[i]).approve(address(unirouter), type(uint256).max);
            IERC20(farmingTokens[i]).approve(address(firebirdRouter), type(uint256).max);
            IERC20(farmingTokens[i]).approve(_balancerV2Vault, type(uint256).max);
        }
    }

    function getName() public override pure returns (string memory) {
        return "StrategyBalancerLp";
    }

    function deposit() external override nonReentrant {
        _deposit();
    }

    function _deposit() internal {
        uint _baseBal = IERC20(baseToken).balanceOf(address(this));
        if (_baseBal > 0) {
            IBeethovenxMasterChef(farmPool).deposit(poolId, _baseBal, address(this));
            emit Deposit(baseToken, _baseBal);
        }
    }

    function _withdrawSome(uint _amount) internal override returns (uint) {
        (uint _stakedAmount,) = IBeethovenxMasterChef(farmPool).userInfo(poolId, address(this));
        if (_amount > _stakedAmount) {
            _amount = _stakedAmount;
        }

        uint _before = IERC20(baseToken).balanceOf(address(this));
        IBeethovenxMasterChef(farmPool).withdrawAndHarvest(poolId, _amount, address(this));
        uint _after = IERC20(baseToken).balanceOf(address(this));
        _amount = _after.sub(_before);

        return _amount;
    }

    function _withdrawAll() internal override {
        (uint _stakedAmount,) = IBeethovenxMasterChef(farmPool).userInfo(poolId, address(this));
        IBeethovenxMasterChef(farmPool).withdrawAndHarvest(poolId, _stakedAmount, address(this));
    }

    function claimReward() public override {
        IBeethovenxMasterChef(farmPool).harvest(poolId, address(this));

        for (uint i=0; i<farmingTokens.length; i++) {
            address _rewardToken = farmingTokens[i];
            uint _rewardBal = IERC20(_rewardToken).balanceOf(address(this));
            if (_rewardBal > 0) {
                _swapTokens(_rewardToken, targetCompoundToken, _rewardBal);
            }
        }
    }

    function _buyWantAndReinvest() internal override {
        address _baseToken = baseToken;
        uint _before = IERC20(_baseToken).balanceOf(address(this));
        _addLiquidity();
        uint _after = IERC20(_baseToken).balanceOf(address(this));
        if (_after > 0) {
            if (_after > _before && vaultMaster.isStrategy(address(this))) {
                uint _compound = _after.sub(_before);
                vault.addNewCompound(_compound, timeToReleaseCompound);
            }
            _deposit();
        }
    }

    function _swapTokens(address _input, address _output, uint256 _amount, address _receiver) internal override returns (uint) {
        if (_receiver == address(0)) _receiver = address(this);
        if (_input == _output || _amount == 0) {
            if (_receiver != address(this) && _amount != 0) IERC20(_input).safeTransfer(_receiver, _amount);
            return _amount;
        }
        address[] memory path = firebirdPairs[_input][_output];
        bytes32 balancerPoolId = balancerPoolPaths[_input][_output];

        uint before = IERC20(_output).balanceOf(_receiver);
        if (path.length > 0) { // use firebird
            uint8[] memory dexIds = new uint8[](path.length);
            firebirdRouter.swapExactTokensForTokensSupportingFeeOnTransferTokens(_input, _output, _amount, 1, path, dexIds, _receiver, block.timestamp);
        } else if (balancerPoolId.length > 0) { //use balancer
            IBalancerV2Vault.SingleSwap memory singleSwap = IBalancerV2Vault.SingleSwap(
                balancerPoolId, IBalancerV2Vault.SwapKind.GIVEN_IN, _input, _output, _amount, new bytes(0)
            );
            IBalancerV2Vault.FundManagement memory funds = IBalancerV2Vault.FundManagement(address(this), false, _receiver, false);

            IBalancerV2Vault(balancerV2Vault).swap(
                singleSwap,
                funds,
                1,
                block.timestamp
            );
        } else { // use Uniswap
            path = uniswapPaths[_input][_output];
            if (path.length == 0) {
                revert("!path");
            }
            unirouter.swapExactTokensForTokensSupportingFeeOnTransferTokens(_amount, 1, path, _receiver, block.timestamp);
        }
        return IERC20(_output).balanceOf(_receiver).sub(before);
    }

    function _addLiquidity() internal {
        uint depositTokenBalance = IERC20(targetCompoundToken).balanceOf(address(this));

        IBalancerV2Vault.JoinKind joinKind = IBalancerV2Vault.JoinKind.EXACT_TOKENS_IN_FOR_BPT_OUT;
        uint256[] memory amountsIn = new uint256[](totalUnderlyingTokens);
        amountsIn[tokenCompoundIndex] = depositTokenBalance;
        address[] memory _assets = new address[](totalUnderlyingTokens);
        for(uint8 i = 0; i < totalUnderlyingTokens; i++){
            _assets[i] = LPs[i];
        }

        bytes memory userData = abi.encode(joinKind, amountsIn, 1);

        IBalancerV2Vault.JoinPoolRequest memory request;
        request.assets = _assets;
        request.maxAmountsIn = amountsIn;
        request.userData = userData;
        request.fromInternalBalance = false;

        IBalancerV2Vault(balancerV2Vault).joinPool(
            poolID_bytes,
            address(this),
            address(this),
            request
        );
    }

    function balanceOfPool() public override view returns (uint) {
        (uint amount,) = IBeethovenxMasterChef(farmPool).userInfo(poolId, address(this));
        return amount;
    }

    function claimable_tokens() external override view returns (address[] memory farmToken, uint[] memory totalDistributedValue) {
        farmToken = new address[](2);
        totalDistributedValue = new uint[](2);
        farmToken[0] = farmingTokens[0];
        totalDistributedValue[0] = IBeethovenxMasterChef(farmPool).pendingBeets(poolId, address(this));

        address rewarder = IBeethovenxMasterChef(farmPool).rewarder(poolId);
        (address[] memory tokenRewarder,) = IRewarder(rewarder).pendingTokens(poolId, address(this), 0);
        if (tokenRewarder.length > 0) {
            farmToken[1] = tokenRewarder[0];
            totalDistributedValue[1] = IRewarder(rewarder).pendingToken(poolId, address(this));
        }
    }

    function claimable_token() external override view returns (address farmToken, uint totalDistributedValue) {
        farmToken = farmingTokens[0];
        totalDistributedValue = IBeethovenxMasterChef(farmPool).pendingBeets(poolId, address(this));
    }

    function getTargetFarm() external override view returns (address) {
        return farmPool;
    }

    function getTargetPoolId() external override view returns (uint) {
        return poolId;
    }

    /**
     * @dev Function that has to be called as part of strat migration. It sends all the available funds back to the
     * vault, ready to be migrated to the new strat.
     */
    function retireStrat() external override onlyStrategist {
        IBeethovenxMasterChef(farmPool).emergencyWithdraw(poolId, address(this));

        uint256 baseBal = IERC20(baseToken).balanceOf(address(this));
        IERC20(baseToken).safeTransfer(address(vault), baseBal);
    }

    function setBalancerPoolPaths(address _input, address _output, bytes32 _poolId) external onlyStrategist {
        balancerPoolPaths[_input][_output] = _poolId;
    }

    function setFarmPoolContract(address _farmPool) external onlyStrategist {
        farmPool = _farmPool;
        IERC20(baseToken).approve(farmPool, type(uint256).max);
    }

    function setPoolId(uint _poolId) external onlyStrategist {
        poolId = _poolId;
    }

    function setFarmingTokens(address[] calldata _farmingTokens) external onlyStrategist {
        farmingTokens = _farmingTokens;
        for (uint i=0; i<farmingTokens.length; i++) {
            IERC20(farmingTokens[i]).approve(address(unirouter), type(uint256).max);
            IERC20(farmingTokens[i]).approve(address(firebirdRouter), type(uint256).max);
        }
    }

    function setApproveBalancerV2VaultForToken(address _token, uint _amount) public onlyStrategist {
        IERC20(_token).approve(balancerV2Vault, _amount);
    }

    function setBalancerV2Vault(address _balancerV2Vault) external onlyTimelock {
        balancerV2Vault = _balancerV2Vault;
    }

    function setCompoundConfig(uint _totalUnderlyingTokens, uint _tokenCompoundIndex) external onlyStrategist {
        totalUnderlyingTokens = _totalUnderlyingTokens;
        tokenCompoundIndex = _tokenCompoundIndex;
    }
}
