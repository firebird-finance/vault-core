// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./StrategyBase.sol";
import "../../interfaces/ICurveLP.sol";
import "../../interfaces/ICurveGauge.sol";

/*

 A strategy must implement the following calls;

 - deposit()
 - withdraw(address) must exclude any tokens used in the yield - Controller role - withdraw should return to Controller
 - withdraw(uint) - Controller | Vault role - withdraw should always return to vault
 - withdrawAll() - Controller | Vault role - withdraw should always return to vault
 - balanceOf()

 Where possible, strategies must remain as immutable as possible, instead of updating variables, we update the contract by linking it in the controller

*/

contract StrategyCurveStable is StrategyBase {
    address public gauge = 0x0895196562C7868C5Be92459FaE7f877ED450452;
    address public curveLp = 0xf157A4799bE445e3808592eDd7E7f72150a7B050;
    uint256 public targetCompoundIndex;

    // baseToken       = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 (USDC)
    // farmingToken = 0x0391d2021f89dc339f60fff84546ea23e337750f (AUTO)
    // targetCompound = 0x0391d2021f89dc339f60fff84546ea23e337750f (USDC)
    function initialize(
        address _baseToken, address _farmingToken,
        address _gauge, address _targetCompound, address _targetProfit,
        uint256 _targetCompoundIndex, address _curveLp,
        address _controller
    ) public nonReentrant initializer {
        initialize(_baseToken, _farmingToken, _controller, _targetCompound, _targetProfit);
        gauge = _gauge;
        curveLp = _curveLp;
        targetCompoundIndex = _targetCompoundIndex;

        IERC20(baseToken).approve(gauge, type(uint256).max);
        IERC20(_targetCompound).approve(curveLp, type(uint256).max);
    }

    function getName() public override pure returns (string memory) {
        return "StrategyCurveStable";
    }

    function deposit() external override nonReentrant {
        _deposit();
    }

    function _deposit() internal {
        uint _baseBal = IERC20(baseToken).balanceOf(address(this));
        if (_baseBal > 0) {
            ICurveGauge(gauge).deposit(_baseBal);
            emit Deposit(baseToken, _baseBal);
        }
    }

    function _withdrawSome(uint _amount) internal override returns (uint) {
        uint _stakedAmount = ICurveGauge(gauge).balanceOf(address(this));
        if (_amount > _stakedAmount) {
            _amount = _stakedAmount;
        }

        uint _before = IERC20(baseToken).balanceOf(address(this));
        ICurveGauge(gauge).withdraw(_amount);
        uint _after = IERC20(baseToken).balanceOf(address(this));
        _amount = _after.sub(_before);

        return _amount;
    }

    function _withdrawAll() internal override {
        uint _stakedAmount = ICurveGauge(gauge).balanceOf(address(this));
        ICurveGauge(gauge).withdraw(_stakedAmount);
    }

    function claimReward() public override {
        ICurveGauge(gauge).claim_rewards();
    }

    function _buyWantAndReinvest() internal override {
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
        uint256 _targetCompoundBal = IERC20(targetCompoundToken).balanceOf(address(this));
        if (_targetCompoundBal > 0) {
            uint256[3] memory amounts;
            amounts[targetCompoundIndex] = _targetCompoundBal;
            ICurveLP(curveLp).add_liquidity(amounts, 1, true);
        }
    }

    function balanceOfPool() public override view returns (uint) {
        uint amount = ICurveGauge(gauge).balanceOf(address(this));
        return amount;
    }

    function claimable_tokens() external override view returns (address[] memory farmToken, uint[] memory totalDistributedValue) {
        farmToken = new address[](1);
        totalDistributedValue = new uint[](1);
        farmToken[0] = farmingToken;
        ICurveGauge _gauge = ICurveGauge(gauge);
        totalDistributedValue[0] = _gauge.integrate_fraction(address(this)).sub(TokenMinter(_gauge.minter()).minted(address(this), gauge));
    }

    function claimable_token() external override view returns (address farmToken, uint totalDistributedValue) {
        farmToken = farmingToken;
        ICurveGauge _gauge = ICurveGauge(gauge);
        totalDistributedValue = _gauge.integrate_fraction(address(this)).sub(TokenMinter(_gauge.minter()).minted(address(this), gauge));
    }

    function getTargetFarm() external override view returns (address) {
        return gauge;
    }

    function getTargetPoolId() external override view returns (uint) {
        return 0;
    }

    /**
     * @dev Function that has to be called as part of strat migration. It sends all the available funds back to the
     * vault, ready to be migrated to the new strat.
     */
    function retireStrat() external override onlyStrategist {
        uint _stakedAmount = ICurveGauge(gauge).balanceOf(address(this));
        ICurveGauge(gauge).withdraw(_stakedAmount);

        uint256 baseBal = IERC20(baseToken).balanceOf(address(this));
        IERC20(baseToken).safeTransfer(address(vault), baseBal);
    }

    function setGaugeContract(address _gauge) external onlyStrategist {
        gauge = _gauge;
        IERC20(baseToken).approve(_gauge, type(uint256).max);
    }

    function setCurveLp(address _curveLp) external onlyStrategist {
        curveLp = _curveLp;
        IERC20(targetCompoundToken).approve(curveLp, type(uint256).max);
    }

    function setTargetCompoundIndex(uint _targetCompoundIndex) external onlyStrategist {
        targetCompoundIndex = _targetCompoundIndex;
    }
}
