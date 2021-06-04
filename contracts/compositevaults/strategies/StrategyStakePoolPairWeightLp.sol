// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./StrategyBase.sol";
import "../../interfaces/IStakePool.sol";

/*

 A strategy must implement the following calls;

 - deposit()
 - withdraw(address) must exclude any tokens used in the yield - Controller role - withdraw should return to Controller
 - withdraw(uint) - Controller | Vault role - withdraw should always return to vault
 - withdrawAll() - Controller | Vault role - withdraw should always return to vault
 - balanceOf()

 Where possible, strategies must remain as immutable as possible, instead of updating variables, we update the contract by linking it in the controller

*/

contract StrategyStakePoolPairWeightLp is StrategyBase {
    uint public blocksToReleaseCompound = 0; // disable

    address public stakePool;

    address public token0;
    address public token1;
    uint public token0Weight; //max 100
    uint public token1Weight; //max 100

    // baseToken       = 0xf98313f818c53E40Bd758C5276EF4B434463Bec4 (BUSDWBNB-LP)
    // farmingToken = 0x0 (dynamic)
    // targetCompound = 0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56 (BUSD)
    // token0 = 0x0610C2d9F6EbC40078cf081e2D1C4252dD50ad15 (WBNB)
    // token1 = 0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56 (BUSD)
    function initialize(
        address _baseToken,
        address _stakePool, address _targetCompound, address _targetProfit, uint _token0Weight, address _token0, address _token1,
        address _controller
    ) public {
        require(_initialized == false, "Strategy: Initialize must be false.");
        initialize(_baseToken, address(0), _controller, _targetCompound, _targetProfit);
        stakePool = _stakePool;
        token0 = _token0;
        token0Weight = _token0Weight;
        token1Weight = 100 - _token0Weight;
        token1 = _token1;

        IERC20(baseToken).approve(stakePool, type(uint256).max);
        if (token0 != farmingToken && token0 != targetCompoundToken) {
            IERC20(token0).approve(address(unirouter), type(uint256).max);
            IERC20(token0).approve(address(firebirdRouter), type(uint256).max);
        }
        if (token1 != farmingToken && token1 != targetCompoundToken && token1 != token0) {
            IERC20(token1).approve(address(unirouter), type(uint256).max);
            IERC20(token1).approve(address(firebirdRouter), type(uint256).max);
        }

        uint rewardPoolLength = IStakePool(_stakePool).rewardPoolInfoLength();
        for (uint index=0; index<rewardPoolLength; index++) {
            address _rewardToken = IStakePool(_stakePool).rewardPoolInfo(index);
            IERC20(_rewardToken).approve(address(unirouter), type(uint256).max);
            IERC20(_rewardToken).approve(address(firebirdRouter), type(uint256).max);
        }
        _initialized = true;
    }

    function getName() public override pure returns (string memory) {
        return "StrategyStakePoolPairWeightLp";
    }

    function deposit() public override {
        uint _baseBal = IERC20(baseToken).balanceOf(address(this));
        if (_baseBal > 0) {
            IStakePool(stakePool).stake(_baseBal);
            emit Deposit(baseToken, _baseBal);
        }
    }

    function _withdrawSome(uint _amount) internal override returns (uint) {
        uint _stakedAmount = IStakePool(stakePool).userInfo(address(this));
        if (_amount > _stakedAmount) {
            _amount = _stakedAmount;
        }

        uint _before = IERC20(baseToken).balanceOf(address(this));
        IStakePool(stakePool).withdraw(_amount);
        uint _after = IERC20(baseToken).balanceOf(address(this));
        _amount = _after.sub(_before);

        return _amount;
    }

    function _withdrawAll() internal override {
        IStakePool(stakePool).exit();
    }

    function claimReward() public override {
        address _stakePool = stakePool;
        IStakePool(_stakePool).claimReward();

        uint rewardPoolLength = IStakePool(_stakePool).rewardPoolInfoLength();
        for (uint index=0; index<rewardPoolLength; index++) {
            address _rewardToken = IStakePool(_stakePool).rewardPoolInfo(index);
            uint _rewardBal = IERC20(_rewardToken).balanceOf(address(this));
            if (_rewardBal > 0) {
                _swapTokens(_rewardToken, targetCompoundToken, _rewardBal);
            }
        }
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
            deposit();
        }
    }

    function _addLiquidity() internal {
        address _token0 = token0;
        address _token1 = token1;
        uint _amount0 = IERC20(_token0).balanceOf(address(this));
        uint _amount1 = IERC20(_token1).balanceOf(address(this));
        if (_amount0 > 0 && _amount1 > 0) {
            IFirebirdRouter(firebirdRouter).addLiquidity(baseToken, _token0, _token1, _amount0, _amount1, 0, 0, address(this), block.timestamp + 1);
        }
    }

    function balanceOfPool() public override view returns (uint) {
        uint amount = IStakePool(stakePool).userInfo(address(this));
        return amount;
    }

    function claimable_tokens() external override view returns (address[] memory farmToken, uint[] memory totalDistributedValue) {
        uint rewardPoolLength = IStakePool(stakePool).rewardPoolInfoLength();
        farmToken = new address[](rewardPoolLength);
        totalDistributedValue = new uint[](rewardPoolLength);

        for (uint index=0; index<rewardPoolLength; index++) {
            address _rewardToken = IStakePool(stakePool).rewardPoolInfo(index);
            farmToken[index] = _rewardToken;
            totalDistributedValue[index] = IStakePool(stakePool).pendingReward(uint8(index), address(this));
        }
    }

    function claimable_token() external override view returns (address farmToken, uint totalDistributedValue) {
        uint rewardPoolLength = IStakePool(stakePool).rewardPoolInfoLength();
        if (rewardPoolLength > 0) {
            address _rewardToken = IStakePool(stakePool).rewardPoolInfo(0);
            farmToken = _rewardToken;
            totalDistributedValue = IStakePool(stakePool).pendingReward(0, address(this));
        }
    }

    function getTargetFarm() external override view returns (address) {
        return stakePool;
    }

    function getTargetPoolId() external override view returns (uint) {
        return 0;
    }

    /**
     * @dev Function that has to be called as part of strat migration. It sends all the available funds back to the
     * vault, ready to be migrated to the new strat.
     */
    function retireStrat() external onlyStrategist {
        IStakePool(stakePool).emergencyWithdraw();

        uint256 baseBal = IERC20(baseToken).balanceOf(address(this));
        IERC20(baseToken).safeTransfer(address(vault), baseBal);
    }

    function setBlocksToReleaseCompound(uint _blocks) external onlyStrategist {
        blocksToReleaseCompound = _blocks;
    }

    function setStakePoolContract(address _stakePool) external onlyStrategist {
        stakePool = _stakePool;
        IERC20(baseToken).approve(stakePool, type(uint256).max);
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

    function updateApproveReward() external onlyStrategist {
        uint rewardPoolLength = IStakePool(stakePool).rewardPoolInfoLength();
        for (uint index=0; index<rewardPoolLength; index++) {
            address _rewardToken = IStakePool(stakePool).rewardPoolInfo(index);
            IERC20(_rewardToken).approve(address(unirouter), type(uint256).max);
            IERC20(_rewardToken).approve(address(firebirdRouter), type(uint256).max);
        }
    }
}
