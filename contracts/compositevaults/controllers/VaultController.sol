// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "../IStrategy.sol";
import "../IVault.sol";
import "../IController.sol";

contract VaultController is IController, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Address for address;
    using SafeMath for uint;

    address public governance;
    address public strategist;

    struct StrategyInfo {
        address strategy;
        uint quota; // set = 0 to disable
        uint percent;
    }

    IVault public override vault;
    string public name = "VaultController";

    address public override want;
    uint public strategyLength;

    // stratId => StrategyInfo
    mapping(uint => StrategyInfo) public override strategies;

    mapping(address => bool) public approvedStrategies;

    bool public override investDisabled;

    address public lazySelectedBestStrategy; // we pre-set the best strategy to avoid gas cost of iterating the array
    uint public lastHarvestAllTimeStamp;

    uint public withdrawalFee = 0; // over 10000
    bool internal _initialized = false;

    function initialize(IVault _vault, string memory _name) public {
        require(_initialized == false, "Strategy: Initialize must be false.");
        require(address(_vault) != address(0), "!_vault");
        vault = _vault;
        want = vault.token();
        governance = msg.sender;
        strategist = msg.sender;
        name = _name;
        _initialized = true;
    }

    modifier onlyGovernance() {
        require(msg.sender == governance, "!governance");
        _;
    }

    modifier onlyStrategist() {
        require(msg.sender == strategist || msg.sender == governance, "!strategist");
        _;
    }

    modifier onlyAuthorized() {
        require(msg.sender == address(vault) || msg.sender == strategist || msg.sender == governance, "!authorized");
        _;
    }

    function setVault(IVault _vault) external onlyGovernance {
        require(address(_vault) != address(0), "!_vault");
        vault = _vault;
        want = vault.token();
    }

    function setName(string memory _name) external onlyGovernance {
        name = _name;
    }

    function setGovernance(address _governance) external onlyGovernance {
        governance = _governance;
    }

    function setStrategist(address _strategist) external onlyGovernance {
        strategist = _strategist;
    }

    function approveStrategy(address _strategy) external onlyGovernance {
        approvedStrategies[_strategy] = true;
    }

    function revokeStrategy(address _strategy) external onlyGovernance {
        approvedStrategies[_strategy] = false;
    }

    function setWithdrawalFee(uint _withdrawalFee) external onlyGovernance {
        require(_withdrawalFee < 10000, "withdrawalFee too high");
        withdrawalFee = _withdrawalFee;
    }

    function setStrategyLength(uint _length) external onlyStrategist {
        strategyLength = _length;
    }

    // stratId => StrategyInfo
    function setStrategyInfo(uint _sid, address _strategy, uint _quota, uint _percent) external onlyStrategist {
        require(approvedStrategies[_strategy], "!approved");
        strategies[_sid].strategy = _strategy;
        strategies[_sid].quota = _quota;
        strategies[_sid].percent = _percent;
    }

    function setInvestDisabled(bool _investDisabled) external onlyStrategist {
        investDisabled = _investDisabled;
    }

    function setLazySelectedBestStrategy(address _strategy) external onlyStrategist {
        require(approvedStrategies[_strategy], "!approved");
        require(IStrategy(_strategy).baseToken() == want, "!want");
        lazySelectedBestStrategy = _strategy;
    }

    function getStrategyCount() external override view returns(uint _strategyCount) {
        _strategyCount = strategyLength;
    }

    function getBestStrategy() public override view returns (address _strategy) {
        if (lazySelectedBestStrategy != address(0)) {
            return lazySelectedBestStrategy;
        }
        _strategy = address(0);
        if (strategyLength == 0) return _strategy;
        if (strategyLength == 1) return strategies[0].strategy;
        uint _totalBal = balanceOf();
        if (_totalBal == 0) return strategies[0].strategy; // first depositor, simply return the first strategy
        uint _bestDiff = 201;
        for (uint _sid = 0; _sid < strategyLength; _sid++) {
            StrategyInfo storage sinfo = strategies[_sid];
            uint _stratBal = IStrategy(sinfo.strategy).balanceOf();
            if (_stratBal < sinfo.quota) {
                uint _diff = _stratBal.add(_totalBal).mul(100).div(_totalBal).sub(sinfo.percent); // [100, 200] - [percent]
                if (_diff < _bestDiff) {
                    _bestDiff = _diff;
                    _strategy = sinfo.strategy;
                }
            }
        }
        if (_strategy == address(0)) {
            _strategy = strategies[0].strategy;
        }
    }

    function beforeDeposit() external override onlyAuthorized {
        for (uint _sid = 0; _sid < strategyLength; _sid++) {
            IStrategy(strategies[_sid].strategy).beforeDeposit();
        }
    }

    function earn(address _token, uint _amount) external override onlyAuthorized {
        address _strategy = getBestStrategy();
        if (_strategy == address(0) || IStrategy(_strategy).baseToken() != _token) {
            // forward to vault and then call earnExtra() by its governance
            IERC20(_token).safeTransfer(address(vault), _amount);
        } else {
            IERC20(_token).safeTransfer(_strategy, _amount);
            IStrategy(_strategy).deposit();
        }
    }

    function withdraw_fee(uint _amount) external override view returns (uint) {
        address _strategy = getBestStrategy();
        return (_strategy == address(0)) ? 0 : withdrawFee(_amount);
    }

    function balanceOf() public override view returns (uint _totalBal) {
        for (uint _sid = 0; _sid < strategyLength; _sid++) {
            _totalBal = _totalBal.add(IStrategy(strategies[_sid].strategy).balanceOf());
        }
    }

    function withdrawAll(address _strategy) external onlyStrategist {
        // WithdrawAll sends 'want' to 'vault'
        IStrategy(_strategy).withdrawAll();
    }

    function inCaseTokensGetStuck(address _token, uint _amount) external onlyStrategist {
        IERC20(_token).safeTransfer(address(vault), _amount);
    }

    function inCaseStrategyGetStuck(address _strategy, address _token) external onlyStrategist {
        IStrategy(_strategy).withdraw(_token);
        IERC20(_token).safeTransfer(address(vault), IERC20(_token).balanceOf(address(this)));
    }

    // note that some strategies do not allow controller to harvest
    function harvestStrategy(address _strategy) external override onlyAuthorized {
        IStrategy(_strategy).harvest(address(0));
    }

    function harvestAllStrategies() external override onlyAuthorized nonReentrant {
        address _bestStrategy = getBestStrategy(); // to send all harvested WETH and proceed the profit sharing all-in-one here
        for (uint _sid = 0; _sid < strategyLength; _sid++) {
            address _strategy = strategies[_sid].strategy;
            if (_strategy != _bestStrategy) {
                IStrategy(_strategy).harvest(_bestStrategy);
            }
        }
        if (_bestStrategy != address(0)) {
            IStrategy(_bestStrategy).harvest(address(0));
        }
        lastHarvestAllTimeStamp = block.timestamp;
    }

    function switchFund(IStrategy _srcStrat, IStrategy _destStrat, uint _amount) external onlyStrategist {
        require(approvedStrategies[address(_destStrat)], "!approved");
        require(_srcStrat.baseToken() == want, "!_srcStrat.baseToken");
        require(_destStrat.baseToken() == want, "!_destStrat.baseToken");
        _srcStrat.withdrawToController(_amount);
        IERC20(want).safeTransfer(address(_destStrat), IERC20(want).balanceOf(address(this)));
        _destStrat.deposit();
    }

    function withdrawFee(uint _amount) public override view returns (uint) {
        return _amount.mul(withdrawalFee).div(10000);
    }

    function withdraw(uint _amount) external override onlyAuthorized returns (uint _withdrawFee) {
        _withdrawFee = 0;
        uint _toWithdraw = _amount;
        for (uint _sid = 0; _sid < strategyLength; _sid++) {
            IStrategy _strategy = IStrategy(strategies[_sid].strategy);
            uint _stratBal = _strategy.balanceOf();
            if (_toWithdraw < _stratBal) {
                _strategy.withdraw(_toWithdraw);
                _withdrawFee = _withdrawFee.add(withdrawFee(_toWithdraw));
                return _withdrawFee;
            }
            _strategy.withdrawAll();
            _withdrawFee = _withdrawFee.add(withdrawFee(_stratBal));
            if (_stratBal == _toWithdraw) {
                return _withdrawFee;
            }
            _toWithdraw = _toWithdraw.sub(_stratBal);
        }
        return _withdrawFee;
    }
}
