// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./StrategyBase.sol";
import "../../interfaces/IHopeChef.sol";
import "../../interfaces/IStableSwapRouter.sol";

/*

 A strategy must implement the following calls;

 - deposit()
 - withdraw(address) must exclude any tokens used in the yield - Controller role - withdraw should return to Controller
 - withdraw(uint) - Controller | Vault role - withdraw should always return to vault
 - withdrawAll() - Controller | Vault role - withdraw should always return to vault
 - balanceOf()

 Where possible, strategies must remain as immutable as possible, instead of updating variables, we update the contract by linking it in the controller

*/

contract StrategyHopeChefStableSwapLp is StrategyBase {
    uint public blocksToReleaseCompound = 900; // 0 to disable

    address public stakePool;
    uint public poolId;

    address public poolSwap;
    address public basePoolSwap;
    uint public baseCompoundIndex; //index to add lp
    uint public metaLength = 2;
    uint public baseLength = 4;

    IStableSwapRouter public stableSwapRouter = IStableSwapRouter(0xC437B8D65EcdD43Cda92739E09ebd68BBE1965e1);

    // baseToken       = 0xf98313f818c53E40Bd758C5276EF4B434463Bec4 (BUSDWBNB-LP)
    // farmingToken = 0x4f0ed527e8A95ecAA132Af214dFd41F30b361600 (CAKE)
    // targetCompound = 0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56 (BUSD)
    // token0 = 0x0610C2d9F6EbC40078cf081e2D1C4252dD50ad15 (WBNB)
    // token1 = 0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56 (BUSD)
    function initialize(
        address _baseToken, address _farmingToken,
        address _stakePool, uint _poolId, address _targetCompound, address _targetProfit,
        address _poolSwap, address _basePoolSwap, uint _baseCompoundIndex,
        address _controller
    ) public nonReentrant initializer {
        initialize(_baseToken, _farmingToken, _controller, _targetCompound, _targetProfit);
        stakePool = _stakePool;
        poolId = _poolId;
        poolSwap = _poolSwap;
        basePoolSwap = _basePoolSwap;
        baseCompoundIndex = _baseCompoundIndex;

        IERC20(baseToken).approve(stakePool, type(uint256).max);
        if (targetCompoundToken != address(0)) {
            IERC20(targetCompoundToken).approve(address(stableSwapRouter), type(uint256).max);
        }
    }

    function getName() public override pure returns (string memory) {
        return "StrategyStableSwapLp";
    }

    function deposit() public override nonReentrant {
        _deposit();
    }

    function _deposit() internal {
        uint _baseBal = IERC20(baseToken).balanceOf(address(this));
        if (_baseBal > 0) {
            IHopeChef(stakePool).depositWithRef(poolId, _baseBal, vaultMaster.reserveFund());
            emit Deposit(baseToken, _baseBal);
        }
    }

    function _withdrawSome(uint _amount) internal override returns (uint) {
        (uint _stakedAmount,) = IHopeChef(stakePool).userInfo(poolId, address(this));
        if (_amount > _stakedAmount) {
            _amount = _stakedAmount;
        }

        uint _before = IERC20(baseToken).balanceOf(address(this));
        IHopeChef(stakePool).withdraw(poolId, _amount);
        uint _after = IERC20(baseToken).balanceOf(address(this));
        _amount = _after.sub(_before);

        return _amount;
    }

    function _withdrawAll() internal override {
        IHopeChef(stakePool).withdrawAll(poolId);
    }

    function claimReward() public override {
        IHopeChef(stakePool).deposit(poolId, 0);
    }

    function _buyWantAndReinvest() internal override {
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
        uint256 targetCompoundBal = IERC20(targetCompoundToken).balanceOf(address(this));
        if (targetCompoundBal > 0) {
            uint256[] memory meta_amounts = new uint256[](metaLength);
            uint256[] memory base_amounts = new uint256[](baseLength);
            base_amounts[baseCompoundIndex] = targetCompoundBal;

            stableSwapRouter.addLiquidity(poolSwap, basePoolSwap, meta_amounts, base_amounts, 1, block.timestamp);
        }
    }

    function balanceOfPool() public override view returns (uint) {
        (uint amount,) = IHopeChef(stakePool).userInfo(poolId, address(this));
        return amount;
    }

    function claimable_tokens() external override view returns (address[] memory farmToken, uint[] memory totalDistributedValue) {
        farmToken = new address[](1);
        totalDistributedValue = new uint[](1);
        farmToken[0] = farmingToken;
        totalDistributedValue[0] = IHopeChef(stakePool).pendingReward(poolId, address(this));
    }

    function claimable_token() external override view returns (address farmToken, uint totalDistributedValue) {
        farmToken = farmingToken;
        totalDistributedValue = IHopeChef(stakePool).pendingReward(poolId, address(this));
    }

    function getTargetFarm() external override view returns (address) {
        return stakePool;
    }

    function getTargetPoolId() external override view returns (uint) {
        return poolId;
    }

    /**
     * @dev Function that has to be called as part of strat migration. It sends all the available funds back to the
     * vault, ready to be migrated to the new strat.
     */
    function retireStrat() external onlyStrategist {
        IHopeChef(stakePool).emergencyWithdraw(poolId);

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

    function setStableLpInfo(address _poolSwap, address _basePoolSwap, uint _baseCompoundIndex) external onlyStrategist {
        poolSwap = _poolSwap;
        basePoolSwap = _basePoolSwap;
        baseCompoundIndex = _baseCompoundIndex;
    }

    function setStableLength(uint _metaLength, uint _baseLength) external onlyStrategist {
        metaLength = _metaLength;
        baseLength = _baseLength;
    }

    function setStableSwapRouter(IStableSwapRouter _stableSwapRouter) external onlyGovernance {
        stableSwapRouter = _stableSwapRouter;
        if (targetCompoundToken != address(0)) {
            IERC20(targetCompoundToken).approve(address(_stableSwapRouter), type(uint256).max);
        }
    }
}
