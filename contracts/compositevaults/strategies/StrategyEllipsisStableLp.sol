// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./StrategyBase.sol";
import "../../interfaces/IEllipsisSwap.sol";
import "../../interfaces/ILpTokenStaker.sol";
import "../../interfaces/IMultiFeeDistribution.sol";

/*

 A strategy must implement the following calls;

 - deposit()
 - withdraw(address) must exclude any tokens used in the yield - Controller role - withdraw should return to Controller
 - withdraw(uint) - Controller | Vault role - withdraw should always return to vault
 - withdrawAll() - Controller | Vault role - withdraw should always return to vault
 - balanceOf()

 Where possible, strategies must remain as immutable as possible, instead of updating variables, we update the contract by linking it in the controller

*/

contract StrategyEllipsisStableLp is StrategyBase {
    uint public timeToReleaseCompound = 30 minutes; // 0 to disable

    address public lpTokenStaker = 0xcce949De564fE60e7f96C85e55177F8B9E4CF61b;
    address public ellipsisSwap = 0x160CAed03795365F3A589f10C379FfA7d75d4E76;
    address public multiFeeDistribution = 0x4076CC26EFeE47825917D0feC3A79d0bB9a6bB5c;
    uint256 public targetCompoundIndex;
    uint public poolId;

    // baseToken       = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 (USDC)
    // farmingToken = 0x0391d2021f89dc339f60fff84546ea23e337750f (AUTO)
    // targetCompound = 0x0391d2021f89dc339f60fff84546ea23e337750f (USDC)
    function initialize(
        address _baseToken, address _farmingToken,
        address _lpTokenStaker, uint _poolId, address _targetCompound, address _targetProfit,
        uint256 _targetCompoundIndex, address _ellipsisSwap, address _multiFeeDistribution,
        address _controller
    ) public nonReentrant initializer {
        initialize(_baseToken, _farmingToken, _controller, _targetCompound, _targetProfit);
        lpTokenStaker = _lpTokenStaker;
        poolId = _poolId;
        ellipsisSwap = _ellipsisSwap;
        multiFeeDistribution = _multiFeeDistribution;
        targetCompoundIndex = _targetCompoundIndex;

        IERC20(baseToken).approve(lpTokenStaker, type(uint256).max);
        IERC20(_targetCompound).approve(ellipsisSwap, type(uint256).max);
    }

    function getName() public override pure returns (string memory) {
        return "StrategyEllipsisStableLp";
    }

    function deposit() public override nonReentrant {
        _deposit();
    }

    function _deposit() internal {
        uint _baseBal = IERC20(baseToken).balanceOf(address(this));
        if (_baseBal > 0) {
            ILpTokenStaker(lpTokenStaker).deposit(poolId, _baseBal);
            emit Deposit(baseToken, _baseBal);
        }
    }

    function _withdrawSome(uint _amount) internal override returns (uint) {
        (uint _stakedAmount,) = ILpTokenStaker(lpTokenStaker).userInfo(poolId, address(this));
        if (_amount > _stakedAmount) {
            _amount = _stakedAmount;
        }

        uint _before = IERC20(baseToken).balanceOf(address(this));
        ILpTokenStaker(lpTokenStaker).withdraw(poolId, _amount);
        uint _after = IERC20(baseToken).balanceOf(address(this));
        _amount = _after.sub(_before);

        return _amount;
    }

    function _withdrawAll() internal override {
        (uint _stakedAmount,) = ILpTokenStaker(lpTokenStaker).userInfo(poolId, address(this));
        ILpTokenStaker(lpTokenStaker).withdraw(poolId, _stakedAmount);
    }

    function claimReward() public override {
        uint256[] memory _pids = new uint256[](1);
        _pids[0] = poolId;
        ILpTokenStaker(lpTokenStaker).claim(_pids);
        IMultiFeeDistribution(multiFeeDistribution).exit();
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
            IEllipsisSwap(ellipsisSwap).add_liquidity(amounts, 1);
        }
    }

    function balanceOfPool() public override view returns (uint) {
        (uint amount,) = ILpTokenStaker(lpTokenStaker).userInfo(poolId, address(this));
        return amount;
    }

    function claimable_tokens() external override view returns (address[] memory farmToken, uint[] memory totalDistributedValue) {
        farmToken = new address[](1);
        totalDistributedValue = new uint[](1);
        farmToken[0] = farmingToken;
        (uint _withdrawableAmt,) = IMultiFeeDistribution(multiFeeDistribution).withdrawableBalance(address(this));
        totalDistributedValue[0] = ILpTokenStaker(lpTokenStaker).claimableReward(poolId, address(this)).add(_withdrawableAmt);
    }

    function claimable_token() external override view returns (address farmToken, uint totalDistributedValue) {
        farmToken = farmingToken;
        (uint _withdrawableAmt,) = IMultiFeeDistribution(multiFeeDistribution).withdrawableBalance(address(this));
        totalDistributedValue = ILpTokenStaker(lpTokenStaker).claimableReward(poolId, address(this)).add(_withdrawableAmt);
    }

    function getTargetFarm() external override view returns (address) {
        return lpTokenStaker;
    }

    function getTargetPoolId() external override view returns (uint) {
        return poolId;
    }

    /**
     * @dev Function that has to be called as part of strat migration. It sends all the available funds back to the
     * vault, ready to be migrated to the new strat.
     */
    function retireStrat() external onlyStrategist {
        ILpTokenStaker(lpTokenStaker).emergencyWithdraw(poolId);

        uint256 baseBal = IERC20(baseToken).balanceOf(address(this));
        IERC20(baseToken).safeTransfer(address(vault), baseBal);
    }

    function setTimeToReleaseCompound(uint _timeSeconds) external onlyStrategist {
        timeToReleaseCompound = _timeSeconds;
    }

    function setLPTokenStakerContract(address _lpTokenStaker) external onlyStrategist {
        lpTokenStaker = _lpTokenStaker;
        IERC20(baseToken).approve(_lpTokenStaker, type(uint256).max);
    }

    function setPoolId(uint _poolId) external onlyStrategist {
        poolId = _poolId;
    }

    function setEllipsisSwap(address _ellipsisSwap) external onlyStrategist {
        ellipsisSwap = _ellipsisSwap;
        IERC20(targetCompoundToken).approve(ellipsisSwap, type(uint256).max);
    }

    function setMultiFeeDistributionContract(address _multiFeeDistribution) external onlyStrategist {
        multiFeeDistribution = _multiFeeDistribution;
    }

    function setTargetCompoundIndex(uint _targetCompoundIndex) external onlyStrategist {
        targetCompoundIndex = _targetCompoundIndex;
    }
}
