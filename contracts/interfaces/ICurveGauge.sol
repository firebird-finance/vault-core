// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface ICurveGauge {
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external;
    function claim_rewards() external;
    function claim_rewards(address _user) external;

    function claimable_tokens(address _user) external returns (uint amount);
    function claimable_reward(address _user, address _token) external returns (uint amount);
    function integrate_fraction(address) external view returns(uint256);
    function balanceOf(address _user) external view returns (uint amount);
    function minter() external view returns (address);
}

interface TokenMinter {
    function minted(address user, address gauge) external view returns (uint amount);
}