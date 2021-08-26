// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

import "../IVault.sol";
import "../IVaultMaster.sol";
import "../IController.sol";
import "../converters/IDecimals.sol";

abstract contract VaultBase is ERC20Upgradeable, IVault {
    using Address for address;
    using SafeERC20 for IERC20;

    uint256 constant BONE = 10**18;
    IERC20 public basedToken;

    uint public earnLowerlimit; // minimum to invest
    uint public depositLimit; // limit for each deposit (set 0 to disable)
    uint private totalDepositCap; // initial cap (set 0 to disable)

    address public timelock = address(0xe59511c0eF42FB3C419Ac2651406b7b8822328E1);
    address public governance;
    address public controller;

    IVaultMaster vaultMaster;

    bool public acceptContractDepositor;
    mapping(address => bool) public whitelistedContract;
    bool private _mutex;

    // variable used for avoid the call of mint and redeem in the same tx
    bytes32 private _minterBlock;

    uint public totalPendingCompound;
    uint public startReleasingCompoundTime;
    uint public endReleasingCompoundTime;

    //earnBefore: avoid deposit fee in farm, not to use with farm has bonus received when deposit
    //!earnBefore: avoid bonus received when deposit to farm, not to use with farm has deposit fee
    bool public earnBefore;
    bool public override openHarvest;
    uint public lastHarvestAllTimeStamp;

    bool public depositPaused;
    bool public withdrawPaused;

    event LogNewGovernance(address governance);
    event LogNewTimelock(address timelock);

    // name: Vault:BUSDWBNB
    //symbol: vaultBUSDWBNB
    function initialize(
        IERC20 _basedToken, IVaultMaster _vaultMaster,
        string memory _name, string memory _symbol
    ) public initializer {
        __ERC20_init(_name, _symbol);
        _setupDecimals(IDecimals(address(_basedToken)).decimals());

        earnLowerlimit = 1;
        openHarvest = true;

        basedToken = _basedToken;
        vaultMaster = _vaultMaster;
        governance = msg.sender;
        timelock = address(0xe59511c0eF42FB3C419Ac2651406b7b8822328E1);
    }

    /**
     * @dev Throws if called by a not-whitelisted contract while we do not accept contract depositor.
     */
    modifier checkContract() {
        if (!acceptContractDepositor && !whitelistedContract[msg.sender] && msg.sender != vaultMaster.bank(address(this)) && msg.sender != vaultMaster.bankMaster()) {
            require(!address(msg.sender).isContract() && msg.sender == tx.origin, "contract not support");
        }
        _;
    }

    modifier _non_reentrant_() {
        require(!_mutex, "reentry");
        _mutex = true;
        _;
        _mutex = false;
    }

    modifier onlyGovernance() {
        require(msg.sender == governance, "!governance");
        _;
    }

    modifier onlyTimelock() {
        require(msg.sender == timelock, "!timelock");
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

    function setPauseDeposit(bool _depositPaused) external onlyGovernance {
        depositPaused = _depositPaused;
    }

    function setPauseWithdraw(bool _withdrawPaused) external onlyTimelock {
        withdrawPaused = _withdrawPaused;
    }

    function cap() external override view returns (uint) {
        return totalDepositCap;
    }

    function getVaultMaster() external override view returns (address) {
        return address(vaultMaster);
    }

    function accept(address _input) external override view returns (bool) {
        return _input == address(basedToken);
    }

    function addNewCompound(uint _newCompound, uint _timeToReleaseCompound) external override {
        require(msg.sender == governance || vaultMaster.isStrategy(msg.sender), "!authorized");
        if (_timeToReleaseCompound == 0) {
            totalPendingCompound = 0;
            startReleasingCompoundTime = 0;
            endReleasingCompoundTime = 0;
        } else {
            totalPendingCompound = pendingCompound().add(_newCompound);
            startReleasingCompoundTime = block.timestamp;
            endReleasingCompoundTime = block.timestamp.add(_timeToReleaseCompound);
        }
    }

    function pendingCompound() public view returns (uint) {
        if (totalPendingCompound == 0 || endReleasingCompoundTime <= block.timestamp) return 0;
        return totalPendingCompound.mul(endReleasingCompoundTime.sub(block.timestamp)).div(endReleasingCompoundTime.sub(startReleasingCompoundTime).add(1));
    }

    function balance() public override view returns (uint _balance) {
        _balance = basedToken.balanceOf(address(this)).add(IController(controller).balanceOf()).sub(pendingCompound());
    }

    function setGovernance(address _governance) external onlyGovernance {
        governance = _governance;
        emit LogNewGovernance(governance);
    }

    function setTimelock(address _timelock) external onlyTimelock {
        timelock = _timelock;
        emit LogNewTimelock(timelock);
    }

    function setController(address _controller) external onlyGovernance {
        require(IController(_controller).want() == address(basedToken), "!token");
        controller = _controller;
    }

    function setVaultMaster(IVaultMaster _vaultMaster) external onlyGovernance {
        vaultMaster = _vaultMaster;
    }

    function setEarnLowerlimit(uint _earnLowerlimit) external onlyGovernance {
        earnLowerlimit = _earnLowerlimit;
    }

    function setCap(uint _cap) external onlyGovernance {
        totalDepositCap = _cap;
    }

    function setDepositLimit(uint _limit) external onlyGovernance {
        depositLimit = _limit;
    }

    function token() public override view returns (address) {
        return address(basedToken);
    }

    // Custom logic in here for how much the vault allows to be borrowed
    // Sets minimum required on-hand to keep small withdrawals cheap
    function available() public override view returns (uint) {
        return basedToken.balanceOf(address(this));
    }

    function earn() public override {
        if (controller != address(0)) {
            IController _contrl = IController(controller);
            if (!_contrl.investDisabled()) {
                uint _bal = available();
                if (_bal >= earnLowerlimit) {
                    basedToken.safeTransfer(controller, _bal);
                    _contrl.earn(address(basedToken), _bal);
                }
            }
        }
    }

    function withdraw_fee(uint _shares) public override view returns (uint) {
        return (controller == address(0)) ? 0 : IController(controller).withdraw_fee(_shares);
    }

    function calc_token_amount_deposit(uint _amount) external override view returns (uint) {
        return _amount.mul(BONE).div(getPricePerFullShare());
    }

    function calc_token_amount_withdraw(uint _shares) external override view returns (uint) {
        uint _withdrawFee = withdraw_fee(_shares);
        if (_withdrawFee > 0) {
            _shares = _shares.sub(_withdrawFee);
        }
        uint _totalSupply = totalSupply();
        return (_totalSupply == 0) ? _shares : (balance().mul(_shares)).div(_totalSupply);
    }

    function deposit(uint _amount, uint _min_mint_amount) external override returns (uint) {
        return depositFor(msg.sender, _amount, _min_mint_amount);
    }

    function depositFor(address _to, uint _amount, uint _min_mint_amount) public override checkContract() _non_reentrant_ returns (uint _mint_amount) {
        require(!depositPaused, "deposit paused");
        if (controller != address(0)) {
            IController(controller).beforeDeposit();
        }

        uint _pool = balance();
        require(totalDepositCap == 0 || _pool <= totalDepositCap, ">totalDepositCap");
        _mint_amount = _deposit(_to, _pool, _amount);
        require(_mint_amount >= _min_mint_amount, "slippage");
    }

    function _deposit(address _mintTo, uint _pool, uint _amount) internal returns (uint _shares) {
        basedToken.safeTransferFrom(msg.sender, address(this), _amount);
        if (earnBefore) {
            earn();
        }
        uint256 _after = balance();
        _amount = _after.sub(_pool); // additional check for deflationary tokens
        require(depositLimit == 0 || _amount <= depositLimit, ">depositLimit");
        require(_amount > 0, "no token");

        if (totalSupply() == 0) {
            _shares = _amount;
        } else {
            _shares = (_amount.mul(totalSupply())).div(_pool);
        }

        _minterBlock = keccak256(abi.encodePacked(tx.origin, block.number));
        _mint(_mintTo, _shares);
        if (!earnBefore) {
            earn();
        }
    }

    // Used to swap any borrowed reserve over the debt limit to liquidate to 'token'
    function harvest(address reserve, uint amount) external override _non_reentrant_ {
        require(msg.sender == controller, "!controller");
        require(reserve != address(basedToken), "basedToken");
        IERC20(reserve).safeTransfer(controller, amount);
    }

    function harvestStrategy(address _strategy) external override _non_reentrant_ {
        if (!openHarvest) {
            require(msg.sender == governance || msg.sender == vaultMaster.bank(address(this)) || msg.sender == vaultMaster.bankMaster(), "!governance && !bank");
        }
        IController(controller).harvestStrategy(_strategy);
    }

    function harvestAllStrategies() external override _non_reentrant_ {
        if (!openHarvest) {
            require(msg.sender == governance || msg.sender == vaultMaster.bank(address(this)) || msg.sender == vaultMaster.bankMaster(), "!governance && !bank");
        }
        IController(controller).harvestAllStrategies();
        lastHarvestAllTimeStamp = block.timestamp;
    }

    function withdraw(uint _shares, uint _min_output_amount) external override returns (uint) {
        return withdrawFor(msg.sender, _shares, _min_output_amount);
    }

    // No rebalance implementation for lower fees and faster swaps
    function withdrawFor(address _account, uint _shares, uint _min_output_amount) public override _non_reentrant_ checkContract() returns (uint _output_amount) {
        require(!withdrawPaused, "withdraw paused");
        // Check that no mint has been made in the same block from the same EOA
        require(keccak256(abi.encodePacked(tx.origin, block.number)) != _minterBlock, "REENTR MINT-BURN");

        _output_amount = (balance().mul(_shares)).div(totalSupply());
        _burn(msg.sender, _shares);

        uint _withdrawalProtectionFee = vaultMaster.withdrawalProtectionFee();
        if (_withdrawalProtectionFee > 0) {
            uint _withdrawalProtection = _output_amount.mul(_withdrawalProtectionFee).div(10000);
            _output_amount = _output_amount.sub(_withdrawalProtection);
        }

        // Check balance
        uint b = basedToken.balanceOf(address(this));
        if (b < _output_amount) {
            uint _toWithdraw = _output_amount.sub(b);
            uint _withdrawFee = IController(controller).withdraw(_toWithdraw);
            uint _after = basedToken.balanceOf(address(this));
            uint _diff = _after.sub(b);
            if (_diff < _toWithdraw) {
                _output_amount = b.add(_diff);
            }
            if (_withdrawFee > 0) {
                _output_amount = _output_amount.sub(_withdrawFee, "_output_amount < _withdrawFee");
            }
        }

        require(_output_amount >= _min_output_amount, "slippage");
        basedToken.safeTransfer(_account, _output_amount);
    }

    function setOpenHarvest(bool _openHarvest) external onlyGovernance {
        openHarvest = _openHarvest;
    }

    function getPricePerFullShare() public override view returns (uint) {
        return (totalSupply() == 0) ? BONE : balance().mul(BONE).div(totalSupply());
    }

    /**
     * This function allows governance to take unsupported tokens out of the contract. This is in an effort to make someone whole, should they seriously mess up.
     * There is no guarantee governance will vote to return these. It also allows for removal of airdropped tokens.
     */
    function governanceRecoverUnsupported(IERC20 _token, uint amount, address to) external onlyGovernance {
        require(address(_token) != address(basedToken), "token");
        require(address(_token) != address(this), "share");
        _token.safeTransfer(to, amount);
    }
}
