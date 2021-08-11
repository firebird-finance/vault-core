// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./StrategyBase.sol";
import "../../interfaces/IFarmingRewards.sol";
import "../../interfaces/IMooniswap.sol";
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

contract Strategy1InchETHLp is StrategyBase {
    address public rewardPool  = 0x5D0EC1F843c1233D304B96DbDE0CAB9Ec04D71EF;
    address public referral = address(this);

    address public token0 = 0x111111111117dC0aa78b770fA6A738034120C302;
    address public token1 = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;
    address public wbnb = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;
    address public bnb = 0x0000000000000000000000000000000000000000;

    // baseToken       = 0xdaF66c0B7e8E2FC76B15B07AD25eE58E04a66796 (1Inch-BNB)
    // farmingToken = 0x111111111117dC0aa78b770fA6A738034120C302 (1Inch)
    // targetCompound = 0x111111111117dC0aa78b770fA6A738034120C302 (1Inch)
    // targetProfit = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c (WBNB)
    // token0 = 0x111111111117dC0aa78b770fA6A738034120C302 (1Inch) //must be
    // token1 = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c (BNB) //must be
    function initialize(
        address _baseToken, address _farmingToken,
        address _rewardPool, address _targetCompound, address _targetProfit, address _token0, address _token1,
        address _controller
    ) public nonReentrant initializer {
        initialize(_baseToken, _farmingToken, _controller, _targetCompound, _targetProfit);
        rewardPool = _rewardPool;
        token0 = _token0;
        token1 = _token1;

        IERC20(baseToken).approve(rewardPool, type(uint256).max);
        if (targetCompoundToken != address(0)) {
            IERC20(targetCompoundToken).approve(baseToken, type(uint256).max);
        }
        IERC20(token0).approve(baseToken, type(uint256).max);
        IERC20(token1).approve(baseToken, type(uint256).max);

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
        return "Strategy1InchLp";
    }

    function deposit() external override nonReentrant {
        _deposit();
    }

    function _deposit() internal {
        uint _baseBal = IERC20(baseToken).balanceOf(address(this));
        if (_baseBal > 0) {
            IFarmingRewards(rewardPool).stake(_baseBal);
            emit Deposit(baseToken, _baseBal);
        }
    }

    function _withdrawSome(uint _amount) internal override returns (uint) {
        uint _stakedAmount = IFarmingRewards(rewardPool).balanceOf(address(this));
        if (_amount > _stakedAmount) {
            _amount = _stakedAmount;
        }

        uint _before = IERC20(baseToken).balanceOf(address(this));
        IFarmingRewards(rewardPool).withdraw(_amount);
        uint _after = IERC20(baseToken).balanceOf(address(this));
        _amount = _after.sub(_before);

        return _amount;
    }

    function _withdrawAll() internal override {
        IFarmingRewards(rewardPool).exit();
    }

    function claimReward() public override {
        IFarmingRewards(rewardPool).getReward();
    }

    function harvest(address _mergedStrategy) external override {
        require(msg.sender == controller || msg.sender == strategist || msg.sender == governance, "!authorized");

        uint256 pricePerFullShareBefore = vault.getPricePerFullShare();
        claimReward();
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
                if (_performanceFee > 0 && _reserveFund != address(0)) {
                    _reserveFundAmount = _targetCompoundBal.mul(_performanceFee).div(10000);
                    _reserveFundAmount = _swap1InchTokens(_targetCompoundToken, bnb, _reserveFundAmount);
                    IWETH(wbnb).deposit{value: address(this).balance}();
                    IERC20(wbnb).safeTransfer(_reserveFund, _reserveFundAmount);
                }

                if (_gasFee > 0 && _performanceReward != address(0)) {
                    uint256 _amount = _targetCompoundBal.mul(_gasFee).div(10000);
                    _amount = _swap1InchTokens(_targetCompoundToken, bnb, _amount);
                    IWETH(wbnb).deposit{value: address(this).balance}();
                    IERC20(wbnb).safeTransfer(_performanceReward, _amount);
                }

                _buyWantAndReinvest();

                uint256 pricePerFullShareAfter = vault.getPricePerFullShare();
                emit Harvest(pricePerFullShareBefore, pricePerFullShareAfter, _targetCompoundToken, _targetCompoundBal, wbnb, _reserveFundAmount);
            }
        }

        lastHarvestTimeStamp = block.timestamp;
    }

    /// @dev Fallback function to accept ETH. Workers will send ETH back the pool.
    receive() external payable {}

    function _buyWantAndReinvest() internal override {
        {
            address _targetCompoundToken = targetCompoundToken;
            uint256 _targetCompoundBal = IERC20(_targetCompoundToken).balanceOf(address(this));
            _swap1InchTokens(_targetCompoundToken, bnb, _targetCompoundBal.div(2));
        }

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

    function _swap1InchTokens(address _input, address _output, uint256 _amount) internal returns (uint) {
        if (_input == _output) return _amount;
        if (_input == bnb) {
            return IMooniswap(baseToken).swap{value: _amount}(_input, _output, _amount, 1, referral);
        } else {
            return IMooniswap(baseToken).swap(_input, _output, _amount, 1, referral);
        }
    }

    function _addLiquidity() internal {
        uint256 bnbBal = address(this).balance;
        uint256 lp1Bal = IERC20(token0).balanceOf(address(this));

        if (bnbBal > 0 && lp1Bal > 0) {
            uint256[2] memory maxAmounts = [bnbBal, lp1Bal];
            uint256[2] memory minAmounts = [uint(1), uint(1)];
            IMooniswap(baseToken).deposit{value: bnbBal}(maxAmounts, minAmounts);
        }
    }

    function balanceOfPool() public override view returns (uint) {
        uint amount = IFarmingRewards(rewardPool).balanceOf(address(this));
        return amount;
    }

    function claimable_tokens() external override view returns (address[] memory farmToken, uint[] memory totalDistributedValue) {
        farmToken = new address[](1);
        totalDistributedValue = new uint[](1);
        farmToken[0] = farmingToken;
        totalDistributedValue[0] = IFarmingRewards(rewardPool).earned(address(this));
    }

    function claimable_token() external override view returns (address farmToken, uint totalDistributedValue) {
        farmToken = farmingToken;
        totalDistributedValue = IFarmingRewards(rewardPool).earned(address(this));
    }

    function getTargetFarm() external override view returns (address) {
        return rewardPool;
    }

    function getTargetPoolId() external override view returns (uint) {
        return 0;
    }

    /**
     * @dev Function that has to be called as part of strat migration. It sends all the available funds back to the
     * vault, ready to be migrated to the new strat.
     */
    function retireStrat() external override onlyStrategist {
        IFarmingRewards(rewardPool).withdraw(balanceOfPool());

        uint256 baseBal = IERC20(baseToken).balanceOf(address(this));
        IERC20(baseToken).safeTransfer(address(vault), baseBal);
    }

    function wraptMissEther() external onlyGovernance {
        if (address(this).balance > 0) {
            IWETH(wbnb).deposit{value: address(this).balance}();
        }
    }

    function setRewardPoolContract(address _rewardPool) external onlyStrategist {
        rewardPool = _rewardPool;
        IERC20(baseToken).approve(rewardPool, type(uint256).max);
    }

    function setReferral(address _referral) external onlyStrategist {
        referral = _referral;
    }

    function setTokenLp(address _token0, address _token1) external onlyStrategist {
        token0 = _token0;
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