// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./StrategyBase.sol";
import "../../interfaces/IVenusComptroller.sol";
import "../../interfaces/IVToken.sol";
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

contract StrategyVenusLeverage is StrategyBase {

    address public venusComptroller = address(0xF20fcd005AFDd3AD48C85d0222210fe168DDd10c);
    address public vToken;

    uint256 public targetBorrowLimit;
    uint256 public targetBorrowLimitHysteresis;

    bool public venusRedemptionFeeActive;
    bool public paused;
    bool public wantIsWMATIC;

    address public wmatic = 0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270;

    // baseToken       = 0xA527a61703D82139F8a06Bc30097cC9CAA2df5A6 (CAKEBNB-CAKELP)
    // farmingToken = 0x4f47a0d15c1e53f3d94c069c7d16977c29f9cb6b (RAMEN)
    // targetCompound = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c (BNB)
    // token0 = 0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82 (CAKE)
    // token1 = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c (BNB)
    function initialize(
        address _baseToken, address _farmingToken,
        address _vToken, address _targetCompound, address _targetProfit,
        uint _targetBorrowLimit, uint _targetBorrowLimitHysteresis,
        address _controller
    ) public nonReentrant initializer {
        initialize(_baseToken, _farmingToken, _controller, _targetCompound, _targetProfit);

        if (baseToken == wmatic) {
            wantIsWMATIC = true;
        }

        vToken = _vToken;
        targetBorrowLimit = _targetBorrowLimit;
        targetBorrowLimitHysteresis = _targetBorrowLimitHysteresis;

        address[] memory _markets = new address[](1);
        _markets[0] = vToken;
        IVenusComptroller(venusComptroller).enterMarkets(_markets);
    }

    function getName() public override pure returns (string memory) {
        return "StrategyVenusLeverage";
    }

    function deposit() external override nonReentrant {
        uint _baseBal = IERC20(baseToken).balanceOf(address(this));
        if (_baseBal > 0) {
            _supplyWant();
            _rebalance(0);
        }
    }

    function _supplyWant() internal {
        if (paused) return;

        if (wantIsWMATIC) {
            IWETH(baseToken).withdraw(IERC20(baseToken).balanceOf(address(this)));
            IVBNB(vToken).mint{value: address(this).balance}();
        } else {
            uint256 _want = IERC20(baseToken).balanceOf(address(this));
            IERC20(baseToken).safeApprove(vToken, 0);
            IERC20(baseToken).safeApprove(vToken, _want);
            uint256 mintResult = IVToken(vToken).mint(_want);
            require(mintResult == 0, "!supply");
        }
    }

    function _withdrawSome(uint _amount) internal override returns (uint) {
        uint256 _amountToRedeem = _amount.mul(1e18).div(uint256(1e18).sub(_venusRedemptionFee()));
        _rebalance(_amountToRedeem);
        require(IVToken(vToken).redeemUnderlying(_amountToRedeem) == 0, "_withdrawSome: !redeem");
        if (wantIsWMATIC) {
            IWETH(baseToken).deposit{value: _amount}();
        }
        return _amount;
    }

    function _withdrawAll() internal override {
        targetBorrowLimit = 0;
        targetBorrowLimitHysteresis = 0;
        _rebalance(0);
        require(IVToken(vToken).redeem(IVToken(vToken).balanceOf(address(this))) == 0, "_withdrawAll: !redeem");
        if (wantIsWMATIC) {
            IWETH(baseToken).deposit{value: address(this).balance}();
        }
    }

    function claimReward() public override {
        address[] memory _markets = new address[](1);
        _markets[0] = vToken;
        IVenusComptroller(venusComptroller).claimReward(address(this), _markets);
    }

    function _rebalance(uint withdrawAmount) internal {
        uint256 _ox = IVToken(vToken).balanceOfUnderlying(address(this));
        if(_ox == 0) return;
        if (withdrawAmount >= _ox) withdrawAmount = _ox.sub(1);
        uint256 _x = _ox.sub(withdrawAmount);
        uint256 _y = IVToken(vToken).borrowBalanceCurrent(address(this));
        uint256 _c = _collateralFactor();
        uint256 _L = _c.mul(targetBorrowLimit).div(1e18);
        uint256 _currentL = _divUp(_y,_x == 0 ? 1 : _x);
        uint256 _liquidityAvailable = IVToken(vToken).getCash();

        if(_currentL.add(targetBorrowLimitHysteresis.mul(_c).div(1e18)) < _L) {
            uint256 _dy = _L.mul(_x).div(1e18).sub(_y).mul(1e18).div(uint256(1e18).sub(_L));
            uint256 _max_dy = _ox.mul(_c).div(1e18).sub(_y);

            if(_dy > _max_dy) _dy = _max_dy;
            if(_dy > _liquidityAvailable) _dy = _liquidityAvailable;

            uint256 _borrowCap = IVenusComptroller(venusComptroller).borrowCaps(vToken);
            if (_borrowCap != 0) {
                uint _maxBorrowCap = 0;
                uint _totalBorrows = IVToken(vToken).totalBorrows();
                if(_totalBorrows < _borrowCap.sub(1)) {
                    _maxBorrowCap = _borrowCap.sub(1).sub(_totalBorrows);
                }
                if(_dy > _maxBorrowCap) _dy = _maxBorrowCap;
            }

            if(_dy > 0) {
                IVToken(vToken).borrow(_dy);
                _supplyWant();
            }
        } else {
            uint256 _fee = _venusRedemptionFee();
            while(_currentL > _L.add(targetBorrowLimitHysteresis.mul(_c).div(1e18))) {
                uint256 _dy = _divUp(_y.sub(_mulUp(_L,_x)),uint256(1e18).sub(_divUp(_L,uint256(1e18).sub(_fee))));
                if(_dy.add(10) > _y) _dy = _y;
                uint256 _dx = _dy.mul(1e18).div(uint256(1e18).sub(_fee));
                uint256 _max_dx = _ox.sub(_divUp(_y,_c));
                if(_dx > _max_dx) _dx = _max_dx;
                if(_dx > _liquidityAvailable) _dx = _liquidityAvailable;
                require(IVToken(vToken).redeemUnderlying(_dx) == 0, "_rebalance: !redeem");

                if (wantIsWMATIC) {
                    _dy = address(this).balance;
                } else {
                    _dy = IERC20(baseToken).balanceOf(address(this));
                }
                //          if(_dy > _y) _dy = _y;

                _ox = _ox.sub(_dx);
                if (withdrawAmount >= _ox) withdrawAmount = _ox.sub(1);
                _x = _ox.sub(withdrawAmount);

                if (wantIsWMATIC) {
                    IVBNB(vToken).repayBorrow{value: _dy}();
                } else {
                    IERC20(baseToken).safeApprove(vToken, 0);
                    IERC20(baseToken).safeApprove(vToken, _dy);
                    IVToken(vToken).repayBorrow(_dy);
                }
                _y = _y.sub(_dy);

                _currentL = _divUp(_y,_x == 0 ? 1 : _x);
                _liquidityAvailable = IVToken(vToken).getCash();
            }
        }
    }

    function _mulUp(uint256 a, uint256 b) internal pure returns (uint256) {
        uint256 product = a.mul(b);
        if (product == 0) {
            return 0;
        } else {
            return product.sub(1).div(1e18).add(1);
        }
    }

    function _divUp(uint256 a, uint256 b) internal pure returns (uint256) {
        if (a == 0) {
            return 0;
        } else {
            return a.mul(1e18).sub(1).div(b).add(1);
        }
    }

    /// @dev Fallback function to accept ETH. Workers will send ETH back the pool.
    receive() external payable {}

    function _buyWantAndReinvest() internal override {
        _supplyWant();
        _rebalance(0);
    }

    function balanceOfPool() public override view returns (uint) {
        return IVToken(vToken).balanceOf(address(this)).mul(IVToken(vToken).exchangeRateStored()).div(1e18)
            .mul(uint256(1e18).sub(_venusRedemptionFee())).div(1e18)
            .sub(IVToken(vToken).borrowBalanceStored(address(this)));
    }

    function borrowLimit() public view returns (uint256) {
        uint256 balanceOfUnderlying = IVToken(vToken).balanceOf(address(this)).mul(IVToken(vToken).exchangeRateStored()).div(1e18);

        return IVToken(vToken).borrowBalanceStored(address(this))
            .mul(1e18).div(balanceOfUnderlying.mul(_collateralFactor()).div(1e18));
    }

    function _collateralFactor() internal view returns (uint256) {
        (,uint256 _cf) = IVenusComptroller(venusComptroller).markets(vToken);
        return _cf;
    }

    function _venusRedemptionFee() internal view returns (uint256) {
        if (!venusRedemptionFeeActive) return 0;
        return venusRedemptionFeeActive ? IVenusComptroller(venusComptroller).treasuryPercent() : 0;
    }

    function claimable_tokens() external override view returns (address[] memory farmToken, uint[] memory totalDistributedValue) {
        farmToken = new address[](1);
        totalDistributedValue = new uint[](1);
        farmToken[0] = farmingToken;
        totalDistributedValue[0] = IVenusComptroller(venusComptroller).rewardAccrued(address(this));
    }

    function claimable_token() external override view returns (address farmToken, uint totalDistributedValue) {}

    function getTargetFarm() external override view returns (address) {
        return vToken;
    }

    function getTargetPoolId() external override view returns (uint) {}

    /**
     * @dev Function that has to be called as part of strat migration. It sends all the available funds back to the
     * vault, ready to be migrated to the new strat.
     */
    function retireStrat() external override onlyStrategist {
        _withdrawAll();

        uint256 baseBal = IERC20(baseToken).balanceOf(address(this));
        IERC20(baseToken).safeTransfer(address(vault), baseBal);
    }

    function wraptMissEther() external onlyGovernance {
        if (address(this).balance > 0) {
            IWETH(wmatic).deposit{value: address(this).balance}();
        }
    }

    function setTargetBorrowLimit(uint256 _targetBorrowLimit, uint256 _targetBorrowLimitHysteresis) external onlyStrategist{
        targetBorrowLimit = _targetBorrowLimit;
        targetBorrowLimitHysteresis = _targetBorrowLimitHysteresis;
    }

    function setVenusRedemptionFeeActive(bool _venusRedemptionFeeActive) external onlyStrategist {
        venusRedemptionFeeActive = _venusRedemptionFeeActive;
    }

    function pause() external onlyStrategist {
        paused = true;
    }

    function unpause() external onlyStrategist {
        paused = false;
    }
}
