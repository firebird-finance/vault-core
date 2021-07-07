// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./StrategyBase.sol";
import "../../interfaces/IDMMPool.sol";
import "../../interfaces/IKyberFairLaunch.sol";
import "../../interfaces/IKyberRewardLocker.sol";
import "../../interfaces/IDMMRouter.sol";
import "../../interfaces/IWETH.sol";

/*

 A strategy must implement the following calls;

 - deposit()
 - withdraw(address) must exclude any tokens used in the yield - Controller role - withdraw should return to Controller
 - withdraw(uint) - Controller | Vault role - withdraw should always return to vault
 - withdrawAll() - Controller | Vault role - withdraw should always return to vault
 - balanceOf()

 Where possible, strategies must remain as immutable as possible, instead of updating variables, we update the contract by linking it in the controller

*/

contract StrategyFairLaunchKyberDMMLp is StrategyBase {
    IDMMRouter public kyberRouter = IDMMRouter(0x546C79662E028B661dFB4767664d0273184E4dD1);

    address public farmPool = 0x0895196562C7868C5Be92459FaE7f877ED450452;
    uint public poolId;
    address[] public farmingTokens;

    mapping(address => mapping(address => address[])) public kyberPoolPaths; // [input -> output] => pool path
    mapping(address => mapping(address => address[])) public kyberPaths; // [input -> output] => token path

    address public token0 = 0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82;
    address public token1 = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;
    address public wmatic = 0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270;
    address public matic = 0x0000000000000000000000000000000000000000;

    uint public lastClaimRewardTimestamp;
    uint public limitTimeToClaimReward = 12 hours;

    // baseToken       = 0xA527a61703D82139F8a06Bc30097cC9CAA2df5A6 (CAKEBNB-CAKELP)
    // farmingToken = 0x4f47a0d15c1e53f3d94c069c7d16977c29f9cb6b (RAMEN)
    // targetCompound = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c (BNB)
    // token0 = 0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82 (CAKE)
    // token1 = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c (BNB)
    function initialize(
        address _baseToken,
        address _farmPool, uint _poolId, address _targetCompound, address _targetProfit, address _token0, address _token1,
        address _controller
    ) public initializer {
        initialize(_baseToken, address(0), _controller, _targetCompound, _targetProfit);
        farmPool = _farmPool;
        poolId = _poolId;
        farmingTokens = IKyberFairLaunch(farmPool).getRewardTokens();
        token0 = _token0;
        token1 = _token1;

        IERC20(baseToken).approve(address(farmPool), type(uint256).max);

        //need to run setApproveKyberRouterForToken for targetCompoundToken,targetProfitToken,token0,token1

        for (uint i=0; i<farmingTokens.length; i++) {
            address farming = farmingTokens[i];
            if (farming == matic) farming = wmatic;
            IERC20(farming).approve(address(unirouter), type(uint256).max);
            IERC20(farming).approve(address(firebirdRouter), type(uint256).max);
            IERC20(farming).approve(address(kyberRouter), type(uint256).max);
        }
    }

    function getName() public override pure returns (string memory) {
        return "StrategyFairLaunchKyberDMMLp";
    }

    function deposit() public override nonReentrant {
        _deposit();
    }

    function _deposit() internal {
        uint _baseBal = IERC20(baseToken).balanceOf(address(this));
        if (_baseBal > 0) {
            IKyberFairLaunch(farmPool).deposit(poolId, _baseBal, false);
        }
    }

    function _withdrawSome(uint _amount) internal override returns (uint) {
        (uint _stakedAmount,,) = IKyberFairLaunch(farmPool).getUserInfo(poolId, address(this));
        if (_amount > _stakedAmount) {
            _amount = _stakedAmount;
        }

        uint _before = IERC20(baseToken).balanceOf(address(this));
        IKyberFairLaunch(farmPool).withdraw(poolId, _amount);
        uint _after = IERC20(baseToken).balanceOf(address(this));
        _amount = _after.sub(_before);

        lastClaimRewardTimestamp = block.timestamp;
        return _amount;
    }

    function _withdrawAll() internal override {
        IKyberFairLaunch(farmPool).withdrawAll(poolId);
        lastClaimRewardTimestamp = block.timestamp;
    }

    function claimRewardToLock() public {
        if (block.timestamp > lastClaimRewardTimestamp + limitTimeToClaimReward) {
            IKyberFairLaunch(farmPool).harvest(poolId);
            lastClaimRewardTimestamp = block.timestamp;
        }
    }

    function claimReward() public override {
        claimRewardToLock();
        address rewardLocker = IKyberFairLaunch(farmPool).rewardLocker();

        for (uint i=0; i<farmingTokens.length; i++) {
            address _rewardToken = farmingTokens[i];
            uint256 vestingLength = IKyberRewardLocker(rewardLocker).numVestingSchedules(address(this), _rewardToken);
            if (vestingLength > 0) {
                IKyberRewardLocker(rewardLocker).vestSchedulesInRange(_rewardToken, 0, vestingLength.sub(1));
            }

            if (_rewardToken == matic) {
                _rewardToken = wmatic;
                if (address(this).balance > 0) {
                    IWETH(wmatic).deposit{value: address(this).balance}();
                }
            }

            _swapTokens(_rewardToken, targetCompoundToken, IERC20(_rewardToken).balanceOf(address(this)));
        }
    }

    /// @dev Fallback function to accept ETH. Workers will send ETH back the pool.
    receive() external payable {}

    function _buyWantAndReinvest() internal override {
        {
            address _targetCompoundToken = targetCompoundToken;
            uint256 _targetCompoundBal = IERC20(_targetCompoundToken).balanceOf(address(this));
            uint256 token0Weight = getKyberDMMTokenWeight(token0);

            if (_targetCompoundToken != token0) {
                uint256 _compoundToBuyToken0 = _targetCompoundBal.mul(token0Weight).div(100);
                _swapTokens(_targetCompoundToken, token0, _compoundToBuyToken0);
            }
            if (_targetCompoundToken != token1) {
                uint256 _compoundToBuyToken1 = _targetCompoundBal.mul(100 - token0Weight).div(100);
                _swapTokens(_targetCompoundToken, token1, _compoundToBuyToken1);
            }
        }

        _addLiquidity();
        uint _after = IERC20(baseToken).balanceOf(address(this));
        if (_after > 0) {
            if (vaultMaster.isStrategy(address(this))) {
                vault.addNewCompound(_after, timeToReleaseCompound);
            }
            _deposit();
        }
    }

    function _addLiquidity() internal {
        uint _amount0 = IERC20(token0).balanceOf(address(this));
        uint _amount1 = IERC20(token1).balanceOf(address(this));
        if (_amount0 > 0 && _amount1 > 0) {
            uint256[2] memory vReserveRatioBounds = [0, type(uint256).max];
            kyberRouter.addLiquidity(token0, token1, baseToken, _amount0, _amount1, 1, 1, vReserveRatioBounds, address(this), block.timestamp);
        }
    }

    function _swapTokens(address _input, address _output, uint256 _amount) internal override returns (uint) {
        if (_input == _output || _amount == 0) return _amount;
        address[] memory path = firebirdPairs[_input][_output];
        address[] memory kyberPoolPath = kyberPoolPaths[_input][_output];

        uint before = IERC20(_output).balanceOf(address(this));
        if (path.length > 0) { // use firebird
            firebirdRouter.swapExactTokensForTokensSupportingFeeOnTransferTokens(_input, _output, _amount, 1, path, address(this), block.timestamp);
        } else if (kyberPoolPath.length > 0) { //use kyber DMM
            kyberRouter.swapExactTokensForTokensSupportingFeeOnTransferTokens(_amount, 1, kyberPoolPath, kyberPaths[_input][_output], address(this), block.timestamp);
        } else { // use Uniswap
            path = uniswapPaths[_input][_output];
            if (path.length == 0) {
                revert("!path");
            }
            unirouter.swapExactTokensForTokensSupportingFeeOnTransferTokens(_amount, 1, path, address(this), block.timestamp);
        }
        return IERC20(_output).balanceOf(address(this)).sub(before);
    }

    function getKyberDMMTokenWeight(address token) internal view returns (uint256) {
        IDMMPool dmmPool = IDMMPool(baseToken);
        (uint256 _reserve0, uint256 _reserve1, uint256 _vReserve0, uint256 _vReserve1,) = dmmPool.getTradeInfo();

        if (token == dmmPool.token0()) {
            // (r0/v0) / (r0/v0 + r1/v1)
            return (_reserve0.mul(100).mul(1e18).div(_vReserve0)) / ((_reserve0.mul(1e18).div(_vReserve0)).add(_reserve1.mul(1e18).div(_vReserve1)));
        } else if (token == dmmPool.token1()) {
            // (r1/v1) / (r0/v0 + r1/v1)
            return (_reserve1.mul(100).mul(1e18).div(_vReserve1)) / ((_reserve0.mul(1e18).div(_vReserve0)).add(_reserve1.mul(1e18).div(_vReserve1)));
        } else {
            revert("!poolToken");
        }
    }

    function balanceOfPool() public override view returns (uint) {
        (uint amount,,) = IKyberFairLaunch(farmPool).getUserInfo(poolId, address(this));
        return amount;
    }

    function claimable_tokens() external override view returns (address[] memory farmToken, uint[] memory totalDistributedValue) {
        farmToken = farmingTokens;
        for (uint i=0; i<farmToken.length; i++) {
            if (farmToken[i] == matic) farmToken[i] = wmatic;
        }
        totalDistributedValue = IKyberFairLaunch(farmPool).pendingRewards(poolId, address(this));
    }

    function claimable_token() external override view returns (address farmToken, uint totalDistributedValue) {}

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
        IKyberFairLaunch(farmPool).emergencyWithdraw(poolId);

        IERC20(baseToken).safeTransfer(address(vault), IERC20(baseToken).balanceOf(address(this)));
    }

    function wraptMissEther() external onlyGovernance {
        if (address(this).balance > 0) {
            IWETH(wmatic).deposit{value: address(this).balance}();
        }
    }

    function setKyberPaths(address _input, address _output, address [] memory _poolPath, address [] memory _path) public onlyStrategist {
        kyberPoolPaths[_input][_output] = _poolPath;
        kyberPaths[_input][_output] = _path;
    }

    function setFarmPoolContract(address _farmPool) external onlyStrategist {
        farmPool = _farmPool;
        IERC20(baseToken).approve(farmPool, type(uint256).max);

        farmingTokens = IKyberFairLaunch(farmPool).getRewardTokens();
    }

    function setApproveKyberRouterForToken(address _token, uint _amount) public onlyStrategist {
        IERC20(_token).approve(address(kyberRouter), _amount);
    }

    function setKyberRouter(IDMMRouter _kyberRouter) external onlyTimelock {
        kyberRouter = _kyberRouter;
    }

    function setLimitTimeToClaimReward(uint _limitTimeToClaimReward) external onlyStrategist {
        limitTimeToClaimReward = _limitTimeToClaimReward;
    }
}
