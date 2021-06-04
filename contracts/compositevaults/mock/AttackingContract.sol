// SPDX-License-Identifier: MIT

pragma solidity ^0.6.2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../IVault.sol";
import "../ILpPairConverter.sol";

interface IBankLite {
    function deposit(address _vault, address _input, uint _amount, uint _min_mint_amount, bool _isStake, uint8 _flag) external;
    function addLiquidity(address _vault, uint _amount0, uint _amount1, uint _min_mint_amount, bool _isStake, uint8 _flag) external;
}

interface IVaultLite {
    function depositFor(address _account, address _to, address _input, uint _amount, uint _min_mint_amount) external;
    function addLiquidityFor(address _account, address _to, uint _amount0, uint _amount1, uint _min_mint_amount) external;
}

contract AttackingContract {
    using SafeERC20 for IERC20;

    function deposit(address _bank, address _vault, address _input, uint _amount, uint _min_mint_amount, bool _isStake) external {
        IERC20(_input).safeIncreaseAllowance(_bank, _amount);

        IBankLite(_bank).deposit(_vault, _input, _amount, _min_mint_amount, _isStake, uint8(0));
    }

    function depositFor(address _vault, address _account, address _to, address _input, uint _amount, uint _min_mint_amount) external {
        IVaultLite(_vault).depositFor(_account, _to, _input, _amount, _min_mint_amount);
    }
}
