// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/GSN/Context.sol";

import "./IVaultMaster.sol";
import "./IVault.sol";

contract VaultBank is ContextUpgradeSafe {
    using Address for address;
    using SafeMath for uint;
    using SafeERC20 for IERC20;

    address public governance;
    address public strategist; // who can call harvestXXX() and update reward rate

    IVaultMaster public vaultMaster;

    struct UserInfo {
        uint amount;
        uint rewardDebt;
        uint accumulatedEarned; // will accumulate every time user harvest
        uint lastStakeTime;
        uint unclaimedReward;
    }

    struct RewardPoolInfo {
        IERC20 rewardToken;     // Address of rewardPool token contract.
        uint lastRewardBlock;   // Last block number that rewardPool distribution occurs.
        uint endRewardBlock;    // Block number which rewardPool distribution ends.
        uint rewardPerBlock;    // Reward token amount to distribute per block.
        uint rewardLockedTime;  // Time to lock reward (in seconds).
        uint accRewardPerShare; // Accumulated rewardPool per share, times 1e18.
        uint totalPaidRewards;  // for stat only
    }

    mapping(address => RewardPoolInfo) public rewardPoolInfo; // vault address => reward info
    mapping(address => mapping(address => UserInfo)) public userInfo; // vault address => account => userInfo

    bool public acceptContractDepositor = false;
    mapping(address => bool) public whitelistedContract;

    event Deposit(address indexed vault, address indexed user, uint amount);
    event Withdraw(address indexed vault, address indexed user, uint amount);
    event RewardPaid(address indexed vault, address indexed user, uint reward);

    mapping(address => mapping(address => uint256)) public userLastDepositTimestamp; // vault address => user => deposit timestamp
    mapping(address => uint256) public timestampToReleaseLocked;                    // vault address => timestamp locked for balance user deposit

    function initialize(IVaultMaster _vaultMaster) public initializer {
        vaultMaster = _vaultMaster;
        governance = msg.sender;
        strategist = msg.sender;
    }

    modifier onlyGovernance() {
        require(msg.sender == governance, "!governance");
        _;
    }

    /**
     * @dev Throws if called by a not-whitelisted contract while we do not accept contract depositor.
     */
    modifier checkContract() {
        if (!acceptContractDepositor && !whitelistedContract[msg.sender]) {
            require(!address(msg.sender).isContract() && msg.sender == tx.origin, "contract not support");
        }
        _;
    }

    function setAcceptContractDepositor(bool _acceptContractDepositor) external onlyGovernance {
        acceptContractDepositor = _acceptContractDepositor;
    }

    function whitelistContract(address _contract) external onlyGovernance {
        whitelistedContract[_contract] = true;
    }

    function unwhitelistContract(address _contract) external onlyGovernance {
        whitelistedContract[_contract] = false;
    }

    function setGovernance(address _governance) external onlyGovernance {
        governance = _governance;
    }

    function setStrategist(address _strategist) external onlyGovernance {
        strategist = _strategist;
    }

    function setVaultMaster(IVaultMaster _vaultMaster) external onlyGovernance {
        vaultMaster = _vaultMaster;
    }

    function setTimestampToReleaseLocked(address _vault,uint _timeStamp) external onlyGovernance {
        timestampToReleaseLocked[_vault] = _timeStamp;
    }

    function addPool(address _vault, IERC20 _rewardToken, uint _startBlock, uint _endRewardBlock, uint _rewardPerBlock, uint _rewardLockedTime) external onlyGovernance {
        _startBlock = (block.number > _startBlock) ? block.number : _startBlock;
        require(_startBlock <= _endRewardBlock, "sVB>eVB");
        rewardPoolInfo[_vault].rewardToken = _rewardToken;
        rewardPoolInfo[_vault].lastRewardBlock = _startBlock;
        rewardPoolInfo[_vault].endRewardBlock = _endRewardBlock;
        rewardPoolInfo[_vault].rewardPerBlock = _rewardPerBlock;
        rewardPoolInfo[_vault].rewardLockedTime = _rewardLockedTime;
        rewardPoolInfo[_vault].accRewardPerShare = 0;
        rewardPoolInfo[_vault].totalPaidRewards = 0;
    }

    function updatePool(address _vault, uint _endRewardBlock, uint _rewardPerBlock, uint _rewardLockedTime) external {
        require(msg.sender == strategist || msg.sender == governance, "!strategist");
        updateReward(_vault);
        RewardPoolInfo storage rewardPool = rewardPoolInfo[_vault];
        require(block.number <= rewardPool.endRewardBlock, "late");
        rewardPool.endRewardBlock = _endRewardBlock;
        rewardPool.rewardPerBlock = _rewardPerBlock;
        rewardPool.rewardLockedTime = _rewardLockedTime;
    }

    function updatePoolReward(address[] calldata _vaults, uint[] calldata _rewardPerBlocks) external {
        require(msg.sender == strategist || msg.sender == governance, "!strategist");
        uint leng = _vaults.length;
        uint currTotalRwd = 0;
        uint updatedTotalRwd = 0;
        for (uint i = 0; i < leng; i++) {
            address _vault = _vaults[i];
            RewardPoolInfo storage rewardPool = rewardPoolInfo[_vault];
            if (block.number < rewardPool.endRewardBlock) {
                updateReward(_vault);
                currTotalRwd = currTotalRwd.add(rewardPool.rewardPerBlock);
                updatedTotalRwd = updatedTotalRwd.add(_rewardPerBlocks[i]);
                rewardPool.rewardPerBlock = _rewardPerBlocks[i];
            }
        }
        require(currTotalRwd <= updatedTotalRwd.mul(4), "over increased");
        require(currTotalRwd.mul(4) >= updatedTotalRwd, "over decreased");
    }

    function updateReward(address _vault) public {
        RewardPoolInfo storage rewardPool = rewardPoolInfo[_vault];
        uint _endRewardBlockApplicable = block.number > rewardPool.endRewardBlock ? rewardPool.endRewardBlock : block.number;
        if (_endRewardBlockApplicable > rewardPool.lastRewardBlock) {
            uint lpSupply = IERC20(address(_vault)).balanceOf(address(this));
            if (lpSupply > 0) {
                uint _numBlocks = _endRewardBlockApplicable.sub(rewardPool.lastRewardBlock);
                uint _incRewardPerShare = _numBlocks.mul(rewardPool.rewardPerBlock).mul(1e18).div(lpSupply);
                rewardPool.accRewardPerShare = rewardPool.accRewardPerShare.add(_incRewardPerShare);
            }
            rewardPool.lastRewardBlock = _endRewardBlockApplicable;
        }
    }

    function cap(IVault _vault) external view returns (uint) {
        return _vault.cap();
    }

    function approveForSpender(IERC20 _token, address _spender, uint _amount) external onlyGovernance {
        require(!vaultMaster.isVault(address(_token)), "vaultToken");
        _token.safeApprove(_spender, _amount);
    }

    function calculateMultiMinReceive(IVault[] calldata _vaults, uint[] calldata _amounts) external pure returns (uint[] memory minReceives) {
        require(_vaults.length == _amounts.length, "Invalid input length data");
        return _amounts;
    }

    function depositMultiVault(IVault[] calldata _vaults, uint[] calldata _amounts, uint[] calldata _min_mint_amounts, bool _isStake) public {
        uint leng = _vaults.length;
        for (uint i = 0; i < leng; i++) {
            deposit(_vaults[i], _amounts[i], _min_mint_amounts[i], _isStake);
        }
    }

    function deposit(IVault _vault, uint _amount, uint _min_mint_amount, bool _isStake) public checkContract {
        IERC20(_vault.token()).safeTransferFrom(msg.sender, address(this), _amount);
        IERC20(_vault.token()).safeIncreaseAllowance(address(_vault), _amount);

        uint _mint_amount = _depositToVault(_vault, _amount, _min_mint_amount);

        _stakeVault(address(_vault), _mint_amount, _isStake);
    }

    function transferVault(IVault _srcVault, IVault _destVault, uint _srcShares, uint _min_mint_amount, bool _isStake) public checkContract {
        address _srcVaultToken = _srcVault.token();
        require(_destVault.accept(_srcVaultToken), "_destVault does not accept _srcVault asset");

        IERC20 srcVaultBase = IERC20(_srcVaultToken);
        uint _depositAmt;
        {
            uint _wdAmt = _withdraw(address(_srcVault), _srcShares);
            uint _before = srcVaultBase.balanceOf(address(this));
            _srcVault.withdraw(_wdAmt, 1);
            uint _after = srcVaultBase.balanceOf(address(this));
            _depositAmt = _after.sub(_before);
        }

        srcVaultBase.safeIncreaseAllowance(address(_destVault), _depositAmt);

        uint _mint_amount = _depositToVault(_destVault, _depositAmt, _min_mint_amount);

        _stakeVault(address(_destVault), _mint_amount, _isStake);
    }

    function _depositToVault(IVault _vault, uint _amount, uint _min_mint_amount) internal returns (uint _mint_amount) {
        _mint_amount = _vault.deposit(_amount, _min_mint_amount);

        userLastDepositTimestamp[address(_vault)][msg.sender] = block.timestamp;
    }

    function _stakeVault(address _vault, uint _mint_amount, bool _isStake) internal {
        if (!_isStake) {
            IERC20(_vault).safeTransfer(msg.sender, _mint_amount);
        } else {
            _stakeVaultShares(_vault, _mint_amount);
        }
    }

    function stakeVaultShares(address _vault, uint _shares) public {
        uint _before = IERC20(address(_vault)).balanceOf(address(this));
        IERC20(address(_vault)).safeTransferFrom(msg.sender, address(this), _shares);
        uint _after = IERC20(address(_vault)).balanceOf(address(this));
        _shares = _after.sub(_before); // Additional check for deflationary tokens
        _stakeVaultShares(_vault, _shares);
    }

    function _stakeVaultShares(address _vault, uint _shares) internal {
        UserInfo storage user = userInfo[_vault][msg.sender];
        user.lastStakeTime = block.timestamp;
        updateReward(_vault);
        if (user.amount > 0) {
            getReward(_vault, msg.sender);
        }
        user.amount = user.amount.add(_shares);
        RewardPoolInfo storage rewardPool = rewardPoolInfo[_vault];
        user.rewardDebt = user.amount.mul(rewardPool.accRewardPerShare).div(1e18);
        emit Deposit(_vault, msg.sender, _shares);
    }

    function unfrozenStakeTime(address _vault, address _account) public view returns (uint) {
        UserInfo storage user = userInfo[_vault][_account];
        RewardPoolInfo storage rewardPool = rewardPoolInfo[_vault];
        return user.lastStakeTime + rewardPool.rewardLockedTime;
    }

    function unstake(address _vault, uint _amount) public {
        UserInfo storage user = userInfo[_vault][msg.sender];
        RewardPoolInfo storage rewardPool = rewardPoolInfo[_vault];
        updateReward(_vault);
        if (user.amount > 0) {
            getReward(_vault, msg.sender);
            if (user.lastStakeTime + rewardPool.rewardLockedTime > block.timestamp) {
                user.unclaimedReward = 0;
            } else if (user.unclaimedReward > 0) {
                safeTokenTransfer(rewardPool.rewardToken, msg.sender, user.unclaimedReward);
                user.unclaimedReward = 0;
            }
        }
        if (_amount > 0) {
            user.amount = user.amount.sub(_amount);
            IERC20(address(_vault)).safeTransfer(msg.sender, _amount);
        }
        user.rewardDebt = user.amount.mul(rewardPool.accRewardPerShare).div(1e18);
        emit Withdraw(_vault, msg.sender, _amount);
    }

    function claimReward(address _vault) public {
        UserInfo storage user = userInfo[_vault][msg.sender];
        RewardPoolInfo storage rewardPool = rewardPoolInfo[_vault];
        require(user.lastStakeTime + rewardPool.rewardLockedTime <= block.timestamp, "locked rewards");
        getReward(_vault, msg.sender);
        uint _pendingReward = user.unclaimedReward;
        if (_pendingReward > 0) {
            safeTokenTransfer(rewardPool.rewardToken, msg.sender, _pendingReward);
            user.unclaimedReward = 0;
        }
    }

    // using PUSH pattern
    function getReward(address _vault, address _account) public {
        updateReward(_vault);
        UserInfo storage user = userInfo[_vault][_account];
        RewardPoolInfo storage rewardPool = rewardPoolInfo[_vault];
        uint _pendingReward = user.amount.mul(rewardPool.accRewardPerShare).div(1e18).sub(user.rewardDebt);
        if (_pendingReward > 0) {
            user.accumulatedEarned = user.accumulatedEarned.add(_pendingReward);
            rewardPool.totalPaidRewards = rewardPool.totalPaidRewards.add(_pendingReward);
            // safeTokenTransfer(rewardPool.rewardToken, _account, _pendingReward);
            user.unclaimedReward = user.unclaimedReward.add(_pendingReward);
            emit RewardPaid(_vault, _account, _pendingReward);
            user.rewardDebt = user.amount.mul(rewardPool.accRewardPerShare).div(1e18);
        }
    }

    function pendingReward(address _vault, address _account) public view returns (uint _pending) {
        UserInfo storage user = userInfo[_vault][_account];
        RewardPoolInfo storage rewardPool = rewardPoolInfo[_vault];
        uint _accRewardPerShare = rewardPool.accRewardPerShare;
        uint lpSupply = IERC20(_vault).balanceOf(address(this));
        uint _endRewardBlockApplicable = block.number > rewardPool.endRewardBlock ? rewardPool.endRewardBlock : block.number;
        if (_endRewardBlockApplicable > rewardPool.lastRewardBlock && lpSupply != 0) {
            uint _numBlocks = _endRewardBlockApplicable.sub(rewardPool.lastRewardBlock);
            uint _incRewardPerShare = _numBlocks.mul(rewardPool.rewardPerBlock).mul(1e18).div(lpSupply);
            _accRewardPerShare = _accRewardPerShare.add(_incRewardPerShare);
        }
        _pending = user.amount.mul(_accRewardPerShare).div(1e18).sub(user.rewardDebt);
        _pending = _pending.add(user.unclaimedReward);
    }

    function shares_owner(address _vault, address _account) public view returns (uint) {
        return IERC20(_vault).balanceOf(_account).add(userInfo[_vault][_account].amount);
    }

    // No rebalance implementation for lower fees and faster swaps
    function withdraw(address _vault, uint _shares, uint _min_output_amount) public {
        uint _wdAmt = _withdraw(_vault, _shares);
        IVault(_vault).withdrawFor(msg.sender, _wdAmt, _min_output_amount);
    }

    function _withdraw(address _vault, uint _shares) internal returns (uint){
        uint _userBal = IERC20(address(_vault)).balanceOf(msg.sender);
        if (_shares > _userBal) {
            uint _need = _shares.sub(_userBal);
            require(_need <= userInfo[_vault][msg.sender].amount, "_userBal+staked < _shares");
            unstake(_vault, _need);
        }

        if (timestampToReleaseLocked[_vault] > 0) {
            require(block.timestamp >= userLastDepositTimestamp[_vault][msg.sender].add(timestampToReleaseLocked[_vault]), "locked deposit balance");
        }

        uint _before = IERC20(address(_vault)).balanceOf(address(this));
        IERC20(address(_vault)).safeTransferFrom(msg.sender, address(this), _shares);
        uint _after = IERC20(address(_vault)).balanceOf(address(this));
        return _after.sub(_before);
    }

    function exit(address _vault, uint _min_output_amount) external {
        unstake(_vault, userInfo[_vault][msg.sender].amount);
        withdraw(_vault, IERC20(address(_vault)).balanceOf(msg.sender), _min_output_amount);
    }

    function withdraw_fee(IVault _vault, uint _shares) external view returns (uint) {
        return _vault.withdraw_fee(_shares);
    }

    function calc_token_amount_deposit(IVault _vault, uint _amount) external view returns (uint) {
        return _vault.calc_token_amount_deposit(_amount);
    }

    function calc_token_amount_withdraw(IVault _vault, uint _shares) external view returns (uint) {
        return _vault.calc_token_amount_withdraw(_shares);
    }

    function calc_transfer_vault_shares(IVault _srcVault, IVault _destVault, uint _srcShares) external view returns (uint) {
        uint _amount = _srcVault.calc_token_amount_withdraw(_srcShares);
        return _destVault.calc_token_amount_deposit(_amount);
    }

    function harvestStrategy(IVault _vault, address _strategy) external {
        if (!_vault.openHarvest()) {
            require(msg.sender == strategist || msg.sender == governance, "!strategist");
        }
        _vault.harvestStrategy(_strategy);
    }

    function harvestAllStrategies(IVault _vault) external {
        if (!_vault.openHarvest()) {
            require(msg.sender == strategist || msg.sender == governance, "!strategist");
        }
        _vault.harvestAllStrategies();
    }

    // Safe token transfer function, just in case if rounding error causes vinfo to not have enough token.
    function safeTokenTransfer(IERC20 _token, address _to, uint _amount) internal {
        uint bal = _token.balanceOf(address(this));
        if (_amount > bal) {
            _token.safeTransfer(_to, bal);
        } else {
            _token.safeTransfer(_to, _amount);
        }
    }

    /**
     * This function allows governance to take unsupported tokens out of the contract. This is in an effort to make someone whole, should they seriously mess up.
     * There is no guarantee governance will vote to return these. It also allows for removal of airdropped tokens.
     */
    function governanceRecoverUnsupported(IERC20 _token, uint amount, address to) external {
        require(msg.sender == governance, "!governance");
        require(!vaultMaster.isVault(address(_token)), "vaultToken");
        _token.safeTransfer(to, amount);
    }
}
