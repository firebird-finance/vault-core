// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IMultiFeeDistribution {
    // Stake tokens to receive rewards
    // Locked tokens cannot be withdrawn for lockDuration and are eligible to receive stakingReward rewards
    function stake(uint256 amount, bool lock) external;
    // Withdraw staked tokens
    // First withdraws unlocked tokens, then earned tokens. Withdrawing earned tokens
    // incurs a 50% penalty which is distributed based on locked balances.
    function withdraw(uint256 amount) external;
    // Claim all pending staking rewards
    function getReward() external;
    // Withdraw full unlocked balance and claim pending rewards
    function exit() external;
    // Withdraw all currently locked tokens where the unlock time has passed
    function withdrawExpiredLocks() external;


    // Total balance of an account, including unlocked, locked and earned tokens
    function totalBalance(address user) view external returns (uint256 amount);
    // Total withdrawable balance for an account to which no penalty is applied
    function unlockedBalance(address user) view external returns (uint256 amount);
    // Final balance received and penalty balance paid by user upon calling exit
    function withdrawableBalance(address user) view external returns (uint256 amount, uint256 penaltyAmount);
}
