// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./StrategyBase.sol";
import "../../interfaces/ICakeMasterChef.sol";

/*

 A strategy must implement the following calls;

 - deposit()
 - withdraw(address) must exclude any tokens used in the yield - Controller role - withdraw should return to Controller
 - withdraw(uint) - Controller | Vault role - withdraw should always return to vault
 - withdrawAll() - Controller | Vault role - withdraw should always return to vault
 - balanceOf()

 Where possible, strategies must remain as immutable as possible, instead of updating variables, we update the contract by linking it in the controller

*/

contract StrategyPancakeCake is StrategyBase {
    address public farmPool = 0x0895196562C7868C5Be92459FaE7f877ED450452;

    // baseToken       = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 (USDC)
    // farmingToken = 0x4f47a0d15c1e53f3d94c069c7d16977c29f9cb6b (RAMEN)
    // targetCompound = 0x0391d2021f89dc339f60fff84546ea23e337750f (USDC) //use for other strategy send into this
    function initialize(
        address _baseToken, address _farmingToken,
        address _farmPool, address _targetCompound, address _targetProfit,
        address _controller
    ) public nonReentrant initializer {
        initialize(_baseToken, _farmingToken, _controller, _targetCompound, _targetProfit);
        farmPool = _farmPool;

        IERC20(baseToken).approve(address(farmPool), type(uint256).max);
    }

    function getName() public override pure returns (string memory) {
        return "StrategyPancakeCake";
    }

    function deposit() public override nonReentrant {
        uint _baseBal = IERC20(baseToken).balanceOf(address(this));
        if (_baseBal > 0) {
            _stakeCake();

            _baseBal = IERC20(baseToken).balanceOf(address(this));
            if (_baseBal > 0) {
                _distributePerformance(_baseBal);
                _stakeCake();
            }
        }
    }

    function _stakeCake() internal {
        uint _baseBal = IERC20(baseToken).balanceOf(address(this));
        ICakeMasterChef(farmPool).enterStaking(_baseBal);
        emit Deposit(baseToken, _baseBal);
    }

    function _withdrawSome(uint _amount) internal override returns (uint) {
        (uint _stakedAmount,) = ICakeMasterChef(farmPool).userInfo(0, address(this));
        if (_amount > _stakedAmount) {
            _amount = _stakedAmount;
        }

        uint _before = IERC20(baseToken).balanceOf(address(this));
        ICakeMasterChef(farmPool).leaveStaking(_amount);
        uint _after = IERC20(baseToken).balanceOf(address(this));

        uint _reward = _after.sub(_before).sub(_amount);
        if (_reward > 0) {
            _distributePerformance(_reward);
        }

        return _amount;
    }

    function _withdrawAll() internal override {
        (uint _stakedAmount,) = ICakeMasterChef(farmPool).userInfo(0, address(this));
        ICakeMasterChef(farmPool).leaveStaking(_stakedAmount);
    }

    function claimReward() public override {
        require(msg.sender == controller || msg.sender == strategist || msg.sender == governance, "!authorized");
        ICakeMasterChef(farmPool).enterStaking(0);
    }

    function harvest(address _mergedStrategy) external override {
        require(msg.sender == controller || msg.sender == strategist || msg.sender == governance, "!authorized");

        uint256 pricePerFullShareBefore = vault.getPricePerFullShare();

        _stakeCake();
        uint _cakeBalance = IERC20(baseToken).balanceOf(address(this));
        if (_cakeBalance > 0) {
            _distributePerformance(_cakeBalance);
            _stakeCake();

            uint256 pricePerFullShareAfter = vault.getPricePerFullShare();
            emit Harvest(pricePerFullShareBefore, pricePerFullShareAfter, baseToken, 0, baseToken, 0);
        }

        // use if other strategy send compound bal to here
        address _targetCompoundToken = targetCompoundToken;
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
                    _reserveFundAmount = _swapTokens(_targetCompoundToken, _targetProfitToken, _reserveFundAmount);
                    IERC20(_targetProfitToken).safeTransfer(_reserveFund, _reserveFundAmount);
                }

                if (_gasFee > 0 && _performanceReward != address(0)) {
                    uint256 _amount = _targetCompoundBal.mul(_gasFee).div(10000);
                    _amount = _swapTokens(_targetCompoundToken, _targetProfitToken, _amount);
                    IERC20(_targetProfitToken).safeTransfer(_performanceReward, _amount);
                }

                _buyWantAndReinvest();

                uint256 pricePerFullShareAfter = vault.getPricePerFullShare();
                emit Harvest(pricePerFullShareBefore, pricePerFullShareAfter, _targetCompoundToken, _targetCompoundBal, _targetProfitToken, _reserveFundAmount);
            }
        }

        lastHarvestTimeStamp = block.timestamp;
    }

    function _distributePerformance(uint256 _rewardBal) internal {
        address _reserveFund = vaultMaster.reserveFund();
        address _performanceReward = vaultMaster.performanceReward();
        uint _performanceFee = getPerformanceFee();
        uint _gasFee = vaultMaster.gasFee();

        uint _reserveFundAmount;
        address _baseToken = baseToken;
        address _targetProfitToken = targetProfitToken;
        if (_performanceFee > 0 && _reserveFund != address(0)) {
            _reserveFundAmount = _rewardBal.mul(_performanceFee).div(10000);
            _reserveFundAmount = _swapTokens(_baseToken, _targetProfitToken, _reserveFundAmount);
            IERC20(_targetProfitToken).safeTransfer(_reserveFund, _reserveFundAmount);
        }

        if (_gasFee > 0 && _performanceReward != address(0)) {
            uint256 _amount = _rewardBal.mul(_gasFee).div(10000);
            _amount = _swapTokens(_baseToken, _targetProfitToken, _amount);
            IERC20(_targetProfitToken).safeTransfer(_performanceReward, _amount);
        }
        emit Harvest(0, 0, _baseToken, _rewardBal, _targetProfitToken, _reserveFundAmount);
    }

    function _buyWantAndReinvest() internal override {
        address _baseToken = baseToken;
        uint256 _targetCompoundBal = IERC20(targetCompoundToken).balanceOf(address(this));
        _swapTokens(targetCompoundToken, _baseToken, _targetCompoundBal);

        uint _after = IERC20(_baseToken).balanceOf(address(this));
        if (_after > 0) {
            if (vaultMaster.isStrategy(address(this))) {
                vault.addNewCompound(_after, timeToReleaseCompound);
            }

            _stakeCake();
        }
    }

    function balanceOfPool() public override view returns (uint) {
        (uint amount,) = ICakeMasterChef(farmPool).userInfo(0, address(this));
        return amount.add(balanceOfPoolPending());
    }

    function balanceOfPoolPending() public view returns (uint256) {
        return ICakeMasterChef(farmPool).pendingCake(0, address(this));
    }

    function claimable_tokens() external override view returns (address[] memory farmToken, uint[] memory totalDistributedValue) {
        farmToken = new address[](1);
        totalDistributedValue = new uint[](1);
        farmToken[0] = farmingToken;
        totalDistributedValue[0] = ICakeMasterChef(farmPool).pendingCake(0, address(this));
    }

    function claimable_token() external override view returns (address farmToken, uint totalDistributedValue) {
        farmToken = farmingToken;
        totalDistributedValue = ICakeMasterChef(farmPool).pendingCake(0, address(this));
    }

    function getTargetFarm() external override view returns (address) {
        return farmPool;
    }

    function getTargetPoolId() external override view returns (uint) {
        return 0;
    }

    /**
     * @dev Function that has to be called as part of strat migration. It sends all the available funds back to the
     * vault, ready to be migrated to the new strat.
     */
    function retireStrat() external override onlyStrategist {
        ICakeMasterChef(farmPool).emergencyWithdraw(0);

        uint256 baseBal = IERC20(baseToken).balanceOf(address(this));
        IERC20(baseToken).safeTransfer(address(vault), baseBal);
    }

    function setFarmPoolContract(address _farmPool) external onlyStrategist {
        farmPool = _farmPool;
        IERC20(baseToken).approve(farmPool, type(uint256).max);
    }
}
