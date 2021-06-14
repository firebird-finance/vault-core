// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./StrategyBase.sol";
import "../../interfaces/IAutoFarmV2.sol";
import "../../interfaces/ICakeMasterChef.sol";
import "../../interfaces/IStratX.sol";

/*

 A strategy must implement the following calls;

 - deposit()
 - withdraw(address) must exclude any tokens used in the yield - Controller role - withdraw should return to Controller
 - withdraw(uint) - Controller | Vault role - withdraw should always return to vault
 - withdrawAll() - Controller | Vault role - withdraw should always return to vault
 - balanceOf()

 Where possible, strategies must remain as immutable as possible, instead of updating variables, we update the contract by linking it in the controller

*/

contract StrategyAutoCake is StrategyBase {
    uint public blocksToReleaseCompound = 900; // 0 to disable

    address public autoFarm = 0x0895196562C7868C5Be92459FaE7f877ED450452;
    //PancakeSwap MasterChef contract
    address public masterchef = address(0x73feaa1eE314F8c655E354234017bE2193C9E24E);
    address public autoStrat;
    uint public poolId;

    // baseToken       = 0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82 (CAKE)
    // farmingToken = 0x0391d2021f89dc339f60fff84546ea23e337750f (AUTO)
    // targetCompound = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c (WBNB)
    function initialize(
        address _baseToken, address _farmingToken,
        address _autoFarm, uint _poolId, address _targetCompound, address _targetProfit,
        address _controller
    ) public nonReentrant initializer {
        initialize(_baseToken, _farmingToken, _controller, _targetCompound, _targetProfit);
        autoFarm = _autoFarm;
        poolId = _poolId;

        (, , , , address _autoStrat) = IAutoFarmV2(_autoFarm).poolInfo(poolId);
        autoStrat = _autoStrat;

        IERC20(baseToken).approve(autoFarm, type(uint256).max);
    }

    function getName() public override pure returns (string memory) {
        return "StrategyAutoCake";
    }

    function deposit() public override nonReentrant {
        _deposit();
    }

    function _deposit() internal {
        uint _baseBal = IERC20(baseToken).balanceOf(address(this));
        if (_baseBal > 0) {
            IAutoFarmV2(autoFarm).deposit(poolId, _baseBal);
            emit Deposit(baseToken, _baseBal);
        }
    }

    function _withdrawSome(uint _amount) internal override returns (uint) {
        IStratX(autoStrat).farm();
        IStratX(autoStrat).farm();

        uint _stakedAmount = IAutoFarmV2(autoFarm).stakedWantTokens(poolId, address(this));
        if (_amount > _stakedAmount) {
            _amount = _stakedAmount;
        }
        uint _before = IERC20(baseToken).balanceOf(address(this));
        IAutoFarmV2(autoFarm).withdraw(poolId, _amount);
        uint _after = IERC20(baseToken).balanceOf(address(this));
        _amount = _after.sub(_before);

        return _amount;
    }

    function _withdrawAll() internal override {
        IStratX(autoStrat).farm();
        IStratX(autoStrat).farm();

        IAutoFarmV2(autoFarm).withdraw(poolId, uint256(-1));
    }

    function claimReward() public override {
        IAutoFarmV2(autoFarm).deposit(poolId, 0);
    }

    function _buyWantAndReinvest() internal override {
        address _baseToken = baseToken;
        uint256 _targetCompoundBal = IERC20(targetCompoundToken).balanceOf(address(this));
        _swapTokens(targetCompoundToken, _baseToken, _targetCompoundBal);

        uint _after = IERC20(_baseToken).balanceOf(address(this));
        if (_after > 0) {
            if (vaultMaster.isStrategy(address(this))) {
                vault.addNewCompound(_after, blocksToReleaseCompound);
            }

            _deposit();
        }
    }

    function balanceOfPool() public override view returns (uint) {
        uint amount = IAutoFarmV2(autoFarm).stakedWantTokens(poolId, address(this));
        return amount.add(balanceOfPoolPending());
    }

    function balanceOfPoolPending() public view returns (uint256) {
        (uint256 shares,) = IAutoFarmV2(autoFarm).userInfo(poolId, address(this));
        uint256 totalShares = IStratX(autoStrat).sharesTotal();

        uint256 wantBalInAuto = IERC20(baseToken).balanceOf(autoStrat);
        uint256 harvestedBal = wantBalInAuto.mul(shares).div(totalShares);

        uint256 wantPendingInPCS = ICakeMasterChef(masterchef).pendingCake(0, autoStrat);
        uint256 pendingBal = wantPendingInPCS.mul(shares).div(totalShares);

        return harvestedBal.add(pendingBal);
    }

    function claimable_tokens() external override view returns (address[] memory farmToken, uint[] memory totalDistributedValue) {
        farmToken = new address[](1);
        totalDistributedValue = new uint[](1);
        farmToken[0] = farmingToken;
        totalDistributedValue[0] = IAutoFarmV2(autoFarm).pendingAUTO(poolId, address(this));
    }

    function claimable_token() external override view returns (address farmToken, uint totalDistributedValue) {
        farmToken = farmingToken;
        totalDistributedValue = IAutoFarmV2(autoFarm).pendingAUTO(poolId, address(this));
    }

    function getTargetFarm() external override view returns (address) {
        return autoFarm;
    }

    function getTargetPoolId() external override view returns (uint) {
        return poolId;
    }

    /**
     * @dev Function that has to be called as part of strat migration. It sends all the available funds back to the
     * vault, ready to be migrated to the new strat.
     */
    function retireStrat() external onlyStrategist {
        IAutoFarmV2(autoFarm).emergencyWithdraw(poolId);

        uint256 baseBal = IERC20(baseToken).balanceOf(address(this));
        IERC20(baseToken).safeTransfer(address(vault), baseBal);
    }

    function setBlocksToReleaseCompound(uint _blocks) external onlyStrategist {
        blocksToReleaseCompound = _blocks;
    }

    function setAutoFarmContract(address _autoFarm) external onlyStrategist {
        autoFarm = _autoFarm;

        (, , , , address _autoStrat) = IAutoFarmV2(_autoFarm).poolInfo(poolId);
        autoStrat = _autoStrat;

        IERC20(baseToken).approve(_autoFarm, type(uint256).max);
    }

    function setPoolId(uint _poolId) external onlyStrategist {
        poolId = _poolId;
    }

    function setMasterchef(address _masterchef) external onlyStrategist {
        masterchef = _masterchef;
    }
}
