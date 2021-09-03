// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./StrategyBase.sol";
import "../../interfaces/IWETH.sol";
import "../../interfaces/IUnipool.sol";
import "../../interfaces/ILQTYStaking.sol";

/*

 A strategy must implement the following calls;

 - deposit()
 - withdraw(address) must exclude any tokens used in the yield - Controller role - withdraw should return to Controller
 - withdraw(uint) - Controller | Vault role - withdraw should always return to vault
 - withdrawAll() - Controller | Vault role - withdraw should always return to vault
 - balanceOf()

 Where possible, strategies must remain as immutable as possible, instead of updating variables, we update the contract by linking it in the controller

*/

contract StrategyLQTYStakingLp is StrategyBase {
    address public farmPool = 0x0895196562C7868C5Be92459FaE7f877ED450452;
    address[] public farmingTokens;

    address public token0 = 0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82;
    address public token1 = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;

    address public lqtyToken = 0x3Dc7B06dD0B1f08ef9AcBbD2564f8605b4868EEA;
    address public lqtyStaking = 0x3509f19581aFEDEff07c53592bc0Ca84e4855475;

    address public wmatic = 0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270;
    bool public shouldClaim = true;

    // baseToken       = 0xA527a61703D82139F8a06Bc30097cC9CAA2df5A6 (CAKEBNB-CAKELP)
    // farmingToken = 0x4f47a0d15c1e53f3d94c069c7d16977c29f9cb6b (RAMEN)
    // targetCompound = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c (BNB)
    // token0 = 0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82 (CAKE)
    // token1 = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c (BNB)
    function initialize(
        address _baseToken, address[] memory _farmingTokens,
        address _farmPool, address _targetCompound, address _targetProfit, address _token0, address _token1,
        address _controller
    ) public nonReentrant initializer {
        unirouter = IUniswapV2Router(0xA102072A4C07F06EC3B4900FDC4C7B80b6c57429);
        initialize(_baseToken, address(0), _controller, _targetCompound, _targetProfit);
        farmPool = _farmPool;
        farmingTokens = _farmingTokens;
        token0 = _token0;
        token1 = _token1;

        IERC20(baseToken).approve(farmPool, type(uint256).max);
        IERC20(lqtyToken).approve(lqtyStaking, type(uint256).max);
        IERC20(token0).approve(address(unirouter), type(uint256).max);
        IERC20(token0).approve(address(firebirdRouter), type(uint256).max);
        IERC20(token1).approve(address(unirouter), type(uint256).max);
        IERC20(token1).approve(address(firebirdRouter), type(uint256).max);

        for (uint i=0; i<farmingTokens.length; i++) {
            IERC20(farmingTokens[i]).approve(address(unirouter), type(uint256).max);
            IERC20(farmingTokens[i]).approve(address(firebirdRouter), type(uint256).max);
        }
    }

    function getName() public override pure returns (string memory) {
        return "StrategyLQTYStakingLp";
    }

    function deposit() external override nonReentrant {
        _deposit();
    }

    function _deposit() internal {
        uint _baseBal = IERC20(baseToken).balanceOf(address(this));
        if (_baseBal > 0) {
            IUnipool(farmPool).stake(_baseBal);
            emit Deposit(baseToken, _baseBal);
        }
    }

    function _withdrawSome(uint _amount) internal override returns (uint) {
        uint _stakedAmount = IUnipool(farmPool).balanceOf(address(this));
        if (_amount > _stakedAmount) {
            _amount = _stakedAmount;
        }

        uint _before = IERC20(baseToken).balanceOf(address(this));
        IUnipool(farmPool).withdraw(_amount);
        uint _after = IERC20(baseToken).balanceOf(address(this));
        _amount = _after.sub(_before);

        return _amount;
    }

    function _withdrawAll() internal override {
        if (shouldClaim) {
            IUnipool(farmPool).withdrawAndClaim();
        } else {
            uint _stakedAmount = IUnipool(farmPool).balanceOf(address(this));
            IUnipool(farmPool).withdraw(_stakedAmount);
        }
    }

    function depositStakeLqty() public {
        //deposit and claim reward in lqty staking
        uint lqtyBalance = IERC20(lqtyToken).balanceOf(address(this));
        if (lqtyBalance > 0) {
            ILQTYStaking(lqtyStaking).stake(lqtyBalance);
        } else if (ILQTYStaking(lqtyStaking).stakes(address(this)) > 0) {
            ILQTYStaking(lqtyStaking).unstake(0);
        }
    }

    function claimReward() public override {
        if (shouldClaim) IUnipool(farmPool).claimReward();
        depositStakeLqty();

        if (address(this).balance > 0) {
            IWETH(wmatic).deposit{value: address(this).balance}();
        }
        for (uint i=0; i<farmingTokens.length; i++) {
            address _rewardToken = farmingTokens[i];
            uint _rewardBal = IERC20(_rewardToken).balanceOf(address(this));
            if (_rewardBal > 0) {
                _swapTokens(_rewardToken, targetCompoundToken, _rewardBal);
            }
        }
    }

    /// @dev Fallback function to accept ETH. Workers will send ETH back the pool.
    receive() external payable {}

    function _buyWantAndReinvest() internal override {
        {
            address _targetCompoundToken = targetCompoundToken;
            uint256 _targetCompoundBal = IERC20(_targetCompoundToken).balanceOf(address(this));
            if (_targetCompoundToken != token0) {
                uint256 _compoundToBuyToken0 = _targetCompoundBal.div(2);
                _swapTokens(_targetCompoundToken, token0, _compoundToBuyToken0);
            }
            if (_targetCompoundToken != token1) {
                uint256 _compoundToBuyToken1 = _targetCompoundBal.div(2);
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
                vault.addNewCompound(_compound, timeToReleaseCompound);
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
            IUniswapV2Router(unirouter).addLiquidity(_token0, _token1, _amount0, _amount1, 1, 1, address(this), block.timestamp + 1);
        }
    }

    function balanceOfPool() public override view returns (uint) {
        uint amount = IUnipool(farmPool).balanceOf(address(this));
        return amount;
    }

    function claimable_tokens() external override view returns (address[] memory farmToken, uint[] memory totalDistributedValue) {
        farmToken = new address[](3);
        totalDistributedValue = new uint[](3);
        farmToken[0] = lqtyToken;
        totalDistributedValue[0] = IUnipool(farmPool).earned(address(this));
        farmToken[1] = farmingTokens[0];
        totalDistributedValue[1] = ILQTYStaking(lqtyStaking).getPendingETHGain(address(this));
        farmToken[2] = farmingTokens[1];
        totalDistributedValue[2] = ILQTYStaking(lqtyStaking).getPendingLUSDGain(address(this));
    }

    function claimable_token() external override view returns (address farmToken, uint totalDistributedValue) {}

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
        uint _stakedAmount = IUnipool(farmPool).balanceOf(address(this));
        IUnipool(farmPool).withdraw(_stakedAmount);

        uint256 baseBal = IERC20(baseToken).balanceOf(address(this));
        IERC20(baseToken).safeTransfer(address(vault), baseBal);
    }

    function withdrawAllLQTY() external onlyStrategist {
        ILQTYStaking(lqtyStaking).unstake(uint256(-1));
    }

    function wraptMissEther() external onlyStrategist {
        if (address(this).balance > 0) {
            IWETH(wmatic).deposit{value: address(this).balance}();
        }
    }

    function setFarmPoolContract(address _farmPool) external onlyStrategist {
        require(_farmPool != address(0), "!farmPool");
        farmPool = _farmPool;
        IERC20(baseToken).approve(farmPool, type(uint256).max);
    }

    function setLqty(address _lqtyToken, address _lqtyStaking) external onlyStrategist {
        require(_lqtyToken != address(0), "!lqtyToken");
        require(_lqtyStaking != address(0), "!lqtyStaking");
        lqtyToken = _lqtyToken;
        lqtyStaking = _lqtyStaking;
        IERC20(lqtyToken).approve(lqtyStaking, type(uint256).max);
    }

    function setFarmingTokens(address[] calldata _farmingTokens) external onlyStrategist {
        farmingTokens = _farmingTokens;
        for (uint i=0; i<farmingTokens.length; i++) {
            IERC20(farmingTokens[i]).approve(address(unirouter), type(uint256).max);
            IERC20(farmingTokens[i]).approve(address(firebirdRouter), type(uint256).max);
        }
    }

    function setShouldClaim(bool _shouldClaim) external onlyStrategist {
        shouldClaim = _shouldClaim;
    }
}
