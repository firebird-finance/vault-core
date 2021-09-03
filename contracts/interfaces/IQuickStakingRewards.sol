// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IQuickStakingRewards {
    // Views
    function lastTimeRewardApplicable() external view returns (uint256);
    function rewardPerToken() external view returns (uint256);
    function earned(address account) external view returns (uint256);
    function earned(address account, address rewardToken) external view returns (uint256);
    function bothTokensEarned(address account) external view returns (address[] memory, uint256[] memory);
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);

    // Mutative
    function stake(uint256 amount) external;
    function withdraw(uint256 amount) external;
    function getReward() external;
    function exit() external;
}
