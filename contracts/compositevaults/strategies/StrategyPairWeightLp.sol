// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./StrategyBase.sol";
import "../../interfaces/IRewardPool.sol";

/*

 A strategy must implement the following calls;

 - deposit()
 - withdraw(address) must exclude any tokens used in the yield - Controller role - withdraw should return to Controller
 - withdraw(uint) - Controller | Vault role - withdraw should always return to vault
 - withdrawAll() - Controller | Vault role - withdraw should always return to vault
 - balanceOf()

 Where possible, strategies must remain as immutable as possible, instead of updating variables, we update the contract by linking it in the controller

*/

contract StrategyPairWeightLp is StrategyBase {
    uint public blocksToReleaseCompound = 0; // disable

    address public farmPool;
    uint public poolId;

    address public token0;
    address public token1;
    uint public token0Weight; //max 100
    uint public token1Weight; //max 100

    // baseToken       = 0xf98313f818c53E40Bd758C5276EF4B434463Bec4 (BUSDWBNB-LP)
    // farmingToken = 0x4f0ed527e8A95ecAA132Af214dFd41F30b361600 (CAKE)
    // targetCompound = 0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56 (BUSD)
    // token0 = 0x0610C2d9F6EbC40078cf081e2D1C4252dD50ad15 (WBNB)
    // token1 = 0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56 (BUSD)
    function initialize(
        address _baseToken, address _farmingToken,
        address _farmPool, uint _poolId, address _targetCompound, address _targetProfit, uint _token0Weight, address _token0, address _token1,
        address _controller
    ) public nonReentrant initializer {
        initialize(_baseToken, _farmingToken, _controller, _targetCompound, _targetProfit);
        farmPool = _farmPool;
        poolId = _poolId;
        token0 = _token0;
        token0Weight = _token0Weight;
        token1Weight = 100 - _token0Weight;
        token1 = _token1;

        IERC20(baseToken).approve(address(farmPool), type(uint256).max);
        if (token0 != farmingToken && token0 != targetCompoundToken) {
            IERC20(token0).approve(address(unirouter), type(uint256).max);
            IERC20(token0).approve(address(firebirdRouter), type(uint256).max);
        }
        if (token1 != farmingToken && token1 != targetCompoundToken && token1 != token0) {
            IERC20(token1).approve(address(unirouter), type(uint256).max);
            IERC20(token1).approve(address(firebirdRouter), type(uint256).max);
        }
    }

    function getName() public override pure returns (string memory) {
        return "StrategyPairWeightLp";
    }

    function deposit() public override nonReentrant {
        _deposit();
    }

    function _deposit() internal {
        uint _baseBal = IERC20(baseToken).balanceOf(address(this));
        if (_baseBal > 0) {
            IRewardPool(farmPool).deposit(poolId, _baseBal);
            emit Deposit(baseToken, _baseBal);
        }
    }

    function _withdrawSome(uint _amount) internal override returns (uint) {
        (uint _stakedAmount,) = IRewardPool(farmPool).userInfo(poolId, address(this));
        if (_amount > _stakedAmount) {
            _amount = _stakedAmount;
        }

        uint _before = IERC20(baseToken).balanceOf(address(this));
        IRewardPool(farmPool).withdraw(poolId, _amount);
        uint _after = IERC20(baseToken).balanceOf(address(this));
        _amount = _after.sub(_before);

        return _amount;
    }

    function _withdrawAll() internal override {
        (uint _stakedAmount,) = IRewardPool(farmPool).userInfo(poolId, address(this));
        IRewardPool(farmPool).withdraw(poolId, _stakedAmount);
    }

    function claimReward() public override {
        IRewardPool(farmPool).deposit(poolId, 0);
    }

    function _buyWantAndReinvest() internal override {
        {
            address _targetCompoundToken = targetCompoundToken;
            uint256 _targetCompoundBal = IERC20(_targetCompoundToken).balanceOf(address(this));
            if (_targetCompoundToken != token0) {
                uint256 _compoundToBuyToken0 = _targetCompoundBal.mul(token0Weight).div(100);
                _swapTokens(_targetCompoundToken, token0, _compoundToBuyToken0);
            }
            if (_targetCompoundToken != token1) {
                uint256 _compoundToBuyToken1 = _targetCompoundBal.mul(token1Weight).div(100);
                _swapTokens(_targetCompoundToken, token1, _compoundToBuyToken1);
            }
        }

        address _baseToken = baseToken;
        uint _before = IERC20(_baseToken).balanceOf(address(this));
        _addLiquidity();
        uint _after = IERC20(_baseToken).balanceOf(address(this));
        if (_after > 0) {
            if (_after > _before && vaultMaster.isStrategy(address(this))) {
                uint _compound = _after.sub(_before);
                vault.addNewCompound(_compound, blocksToReleaseCompound);
            }
            _deposit();
        }
    }

    function _addLiquidity() internal {
        address _token0 = token0;
        address _token1 = token1;
        uint _amount0 = IERC20(_token0).balanceOf(address(this));
        uint _amount1 = IERC20(_token1).balanceOf(address(this));
        if (_amount0 > 0 && _amount1 > 0) {
            IFirebirdRouter(firebirdRouter).addLiquidity(baseToken, _token0, _token1, _amount0, _amount1, 1, 1, address(this), block.timestamp + 1);
        }
    }

    function balanceOfPool() public override view returns (uint) {
        (uint amount,) = IRewardPool(farmPool).userInfo(poolId, address(this));
        return amount;
    }

    function claimable_tokens() external override view returns (address[] memory farmToken, uint[] memory totalDistributedValue) {
        farmToken = new address[](1);
        totalDistributedValue = new uint[](1);
        farmToken[0] = farmingToken;
        totalDistributedValue[0] = IRewardPool(farmPool).pendingReward(poolId, address(this));
    }

    function claimable_token() external override view returns (address farmToken, uint totalDistributedValue) {
        farmToken = farmingToken;
        totalDistributedValue = IRewardPool(farmPool).pendingReward(poolId, address(this));
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
    function retireStrat() external onlyStrategist {
        IRewardPool(farmPool).emergencyWithdraw(poolId);

        uint256 baseBal = IERC20(baseToken).balanceOf(address(this));
        IERC20(baseToken).safeTransfer(address(vault), baseBal);
    }

    function setBlocksToReleaseCompound(uint _blocks) external onlyStrategist {
        blocksToReleaseCompound = _blocks;
    }

    function setFarmPoolContract(address _farmPool) external onlyStrategist {
        farmPool = _farmPool;
        IERC20(baseToken).approve(farmPool, type(uint256).max);
    }

    function setPoolId(uint _poolId) external onlyStrategist {
        poolId = _poolId;
    }

    function setTokenLp(address _token0, address _token1, uint _token0Weight) external onlyStrategist {
        token0 = _token0;
        token0Weight = _token0Weight;
        token1Weight = 100 - _token0Weight;
        token1 = _token1;

        if (token0 != farmingToken && token0 != targetCompoundToken) {
            IERC20(token0).approve(address(unirouter), type(uint256).max);
            IERC20(token0).approve(address(firebirdRouter), type(uint256).max);
        }
        if (token1 != farmingToken && token1 != targetCompoundToken && token1 != token0) {
            IERC20(token1).approve(address(unirouter), type(uint256).max);
            IERC20(token1).approve(address(firebirdRouter), type(uint256).max);
        }
    }
}
