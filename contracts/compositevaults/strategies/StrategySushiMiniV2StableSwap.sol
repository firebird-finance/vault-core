// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./StrategyBase.sol";
import "../../interfaces/IIronChef.sol";
import "../../interfaces/IRewarder.sol";
import "../../interfaces/ISwap.sol";

/*

 A strategy must implement the following calls;

 - deposit()
 - withdraw(address) must exclude any tokens used in the yield - Controller role - withdraw should return to Controller
 - withdraw(uint) - Controller | Vault role - withdraw should always return to vault
 - withdrawAll() - Controller | Vault role - withdraw should always return to vault
 - balanceOf()

 Where possible, strategies must remain as immutable as possible, instead of updating variables, we update the contract by linking it in the controller

*/

contract StrategySushiMiniV2StableSwap is StrategyBase {
    address public farmPool;
    uint public poolId;
    address public basePoolSwap;
    uint public baseCompoundIndex; //index to add lp
    uint public baseLength = 3;
    address[] public farmingTokens;

    // baseToken       = 0xf98313f818c53E40Bd758C5276EF4B434463Bec4 (BUSDWBNB-LP)
    // farmingToken = 0x4f0ed527e8A95ecAA132Af214dFd41F30b361600 (CAKE)
    // targetCompound = 0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56 (BUSD)
    // token0 = 0x0610C2d9F6EbC40078cf081e2D1C4252dD50ad15 (WBNB)
    // token1 = 0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56 (BUSD)
    function initialize(
        address _baseToken, address[] memory _farmingTokens,
        address _farmPool, uint _poolId, address _targetCompound, address _targetProfit,
        address _basePoolSwap, uint _baseCompoundIndex,
        address _controller
    ) public nonReentrant initializer {
        initialize(_baseToken, address(0), _controller, _targetCompound, _targetProfit);
        farmPool = _farmPool;
        poolId = _poolId;
        basePoolSwap = _basePoolSwap;
        baseCompoundIndex = _baseCompoundIndex;
        farmingTokens = _farmingTokens;

        IERC20(baseToken).approve(farmPool, type(uint256).max);
        IERC20(targetCompoundToken).approve(basePoolSwap, type(uint256).max);

        for (uint i=0; i<farmingTokens.length; i++) {
            IERC20(farmingTokens[i]).approve(address(unirouter), type(uint256).max);
            IERC20(farmingTokens[i]).approve(address(firebirdRouter), type(uint256).max);
        }
    }

    function getName() public override pure returns (string memory) {
        return "StrategyStableSwap";
    }

    function deposit() external override nonReentrant {
        _deposit();
    }

    function _deposit() internal {
        uint _baseBal = IERC20(baseToken).balanceOf(address(this));
        if (_baseBal > 0) {
            IIronChef(farmPool).deposit(poolId, _baseBal, address(this));
            emit Deposit(baseToken, _baseBal);
        }
    }

    function _withdrawSome(uint _amount) internal override returns (uint) {
        (uint _stakedAmount,) = IIronChef(farmPool).userInfo(poolId, address(this));
        if (_amount > _stakedAmount) {
            _amount = _stakedAmount;
        }

        uint _before = IERC20(baseToken).balanceOf(address(this));
        IIronChef(farmPool).withdraw(poolId, _amount, address(this));
        uint _after = IERC20(baseToken).balanceOf(address(this));
        _amount = _after.sub(_before);

        return _amount;
    }

    function _withdrawAll() internal override {
        (uint _stakedAmount,) = IIronChef(farmPool).userInfo(poolId, address(this));
        IIronChef(farmPool).withdrawAndHarvest(poolId, _stakedAmount, address(this));
    }

    function claimReward() public override {
        IIronChef(farmPool).harvest(poolId, address(this));

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

    function _addLiquidity() internal {
        uint256 targetCompoundBal = IERC20(targetCompoundToken).balanceOf(address(this));
        if (targetCompoundBal > 0) {
            uint256[] memory amounts = new uint256[](baseLength);
            amounts[baseCompoundIndex] = targetCompoundBal;

            ISwap(basePoolSwap).addLiquidity(amounts, 1, block.timestamp);
        }
    }

    function balanceOfPool() public override view returns (uint) {
        (uint amount,) = IIronChef(farmPool).userInfo(poolId, address(this));
        return amount;
    }

    function claimable_tokens() external override view returns (address[] memory farmToken, uint[] memory totalDistributedValue) {
        farmToken = new address[](2);
        totalDistributedValue = new uint[](2);
        farmToken[0] = farmingTokens[0];
        totalDistributedValue[0] = IIronChef(farmPool).pendingReward(poolId, address(this));

        address rewarder = IIronChef(farmPool).rewarder(poolId);
        if (rewarder != address(0)) {
            (address[] memory tokenRewarder, uint256[] memory rewardAmounts) = IRewarder(rewarder).pendingTokens(poolId, address(this), 0);
            if (tokenRewarder.length > 0) {
                farmToken[1] = tokenRewarder[0];
                totalDistributedValue[1] = rewardAmounts[0];
            }
        }
    }

    function claimable_token() external override view returns (address farmToken, uint totalDistributedValue) {
        farmToken = farmingTokens[0];
        totalDistributedValue = IIronChef(farmPool).pendingReward(poolId, address(this));
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
        IIronChef(farmPool).emergencyWithdraw(poolId, address(this));

        uint256 baseBal = IERC20(baseToken).balanceOf(address(this));
        IERC20(baseToken).safeTransfer(address(vault), baseBal);
    }

    function setFarmPoolContract(address _farmPool) external onlyStrategist {
        farmPool = _farmPool;
        IERC20(baseToken).approve(farmPool, type(uint256).max);
    }

    function setPoolId(uint _poolId) external onlyStrategist {
        poolId = _poolId;
    }

    function setStableLpInfo(address _basePoolSwap, uint _baseCompoundIndex) external onlyStrategist {
        basePoolSwap = _basePoolSwap;
        baseCompoundIndex = _baseCompoundIndex;
    }

    function setStableLength(uint _baseLength) external onlyStrategist {
        baseLength = _baseLength;
    }

    function setFarmingTokens(address[] calldata _farmingTokens) external onlyStrategist {
        farmingTokens = _farmingTokens;
        for (uint i=0; i<farmingTokens.length; i++) {
            IERC20(farmingTokens[i]).approve(address(unirouter), type(uint256).max);
            IERC20(farmingTokens[i]).approve(address(firebirdRouter), type(uint256).max);
        }
    }
}
