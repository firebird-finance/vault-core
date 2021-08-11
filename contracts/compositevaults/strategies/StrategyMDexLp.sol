// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./StrategyBase.sol";
import "../../interfaces/IMDexChef.sol";
import "../../interfaces/IMDexSwapMining.sol";

/*

 A strategy must implement the following calls;

 - deposit()
 - withdraw(address) must exclude any tokens used in the yield - Controller role - withdraw should return to Controller
 - withdraw(uint) - Controller | Vault role - withdraw should always return to vault
 - withdrawAll() - Controller | Vault role - withdraw should always return to vault
 - balanceOf()

 Where possible, strategies must remain as immutable as possible, instead of updating variables, we update the contract by linking it in the controller

*/

contract StrategyMDexLp is StrategyBase {
    address public farmPool = 0x0895196562C7868C5Be92459FaE7f877ED450452;
    IMDexSwapMining public swapMinting = IMDexSwapMining(0x782395303692aBeD877d2737Aa7982345eB44c11);
    uint public poolId;
    address[] public farmingTokens;

    address public token0 = 0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82;
    address public token1 = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;

    // baseToken       = 0xA527a61703D82139F8a06Bc30097cC9CAA2df5A6 (CAKEBNB-CAKELP)
    // farmingToken = 0x4f47a0d15c1e53f3d94c069c7d16977c29f9cb6b (RAMEN)
    // targetCompound = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c (BNB)
    // token0 = 0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82 (CAKE)
    // token1 = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c (BNB)
    function initialize(
        address _baseToken, address[] memory _farmingTokens,
        address _farmPool, uint _poolId, address _targetCompound, address _targetProfit, address _token0, address _token1,
        address _controller
    ) public nonReentrant initializer {
        unirouter = IUniswapV2Router(0x7DAe51BD3E3376B8c7c4900E9107f12Be3AF1bA8);
        initialize(_baseToken, address(0), _controller, _targetCompound, _targetProfit);
        farmPool = _farmPool;
        poolId = _poolId;
        farmingTokens = _farmingTokens;
        token0 = _token0;
        token1 = _token1;

        IERC20(baseToken).approve(address(farmPool), type(uint256).max);
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
        return "StrategyMDexLp";
    }

    function deposit() external override nonReentrant {
        _deposit();
    }

    function _deposit() internal {
        uint _baseBal = IERC20(baseToken).balanceOf(address(this));
        if (_baseBal > 0) {
            IMDexChef(farmPool).deposit(poolId, _baseBal);
            emit Deposit(baseToken, _baseBal);
        }
    }

    function _withdrawSome(uint _amount) internal override returns (uint) {
        (uint _stakedAmount,,) = IMDexChef(farmPool).userInfo(poolId, address(this));
        if (_amount > _stakedAmount) {
            _amount = _stakedAmount;
        }

        uint _before = IERC20(baseToken).balanceOf(address(this));
        IMDexChef(farmPool).withdraw(poolId, _amount);
        uint _after = IERC20(baseToken).balanceOf(address(this));
        _amount = _after.sub(_before);

        return _amount;
    }

    function _withdrawAll() internal override {
        (uint _stakedAmount,,) = IMDexChef(farmPool).userInfo(poolId, address(this));
        IMDexChef(farmPool).withdraw(poolId, _stakedAmount);
    }

    function claimReward() public override {
        IMDexChef(farmPool).deposit(poolId, 0);
        swapMinting.takerWithdraw();

        for (uint i=0; i<farmingTokens.length; i++) {
            address _rewardToken = farmingTokens[i];
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
        (uint amount,,) = IMDexChef(farmPool).userInfo(poolId, address(this));
        return amount;
    }

    function claimable_tokens() external override view returns (address[] memory farmToken, uint[] memory totalDistributedValue) {
        farmToken = new address[](2);
        totalDistributedValue = new uint[](2);
        farmToken[0] = IMDexChef(farmPool).mdx();
        farmToken[1] = IMDexChef(farmPool).multLpToken();
        (uint256 mdxAmount, uint256 tokenAmount) = IMDexChef(farmPool).pending(poolId, address(this));
        totalDistributedValue[0] = mdxAmount;
        totalDistributedValue[1] = tokenAmount;
    }

    function claimable_token() external override view returns (address farmToken, uint totalDistributedValue) {
        farmToken = farmingTokens[0];
        (totalDistributedValue,) = IMDexChef(farmPool).pending(poolId, address(this));
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
        IMDexChef(farmPool).emergencyWithdraw(poolId);

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

    function setSwapMintingContract(address _swapMinting) external onlyStrategist {
        swapMinting = IMDexSwapMining(_swapMinting);
    }

    function setFarmingTokens(address[] calldata _farmingTokens) external onlyStrategist {
        farmingTokens = _farmingTokens;
        for (uint i=0; i<farmingTokens.length; i++) {
            IERC20(farmingTokens[i]).approve(address(unirouter), type(uint256).max);
            IERC20(farmingTokens[i]).approve(address(firebirdRouter), type(uint256).max);
        }
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
