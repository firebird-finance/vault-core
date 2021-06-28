// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

interface IKyberRewardLocker {
  struct VestingSchedule {
    uint64 startBlock;
    uint64 endBlock;
    uint128 quantity;
    uint128 vestedQuantity;
  }

  event VestingEntryCreated(
    address indexed token,
    address indexed beneficiary,
    uint256 startBlock,
    uint256 endBlock,
    uint256 quantity,
    uint256 index
  );

  event VestingEntryQueued(
    uint256 indexed index,
    address indexed token,
    address indexed beneficiary,
    uint256 quantity
  );

  event Vested(
    address indexed token,
    address indexed beneficiary,
    uint256 vestedQuantity,
    uint256 index
  );

  /**
   * @dev queue a vesting schedule starting from now
   */
  function lock(
    address token,
    address account,
    uint256 amount
  ) external payable;

  /**
   * @dev queue a vesting schedule
   */
  function lockWithStartBlock(
    address token,
    address account,
    uint256 quantity,
    uint256 startBlock
  ) external payable;

  /**
   * @dev vest all completed schedules for multiple tokens
   */
  function vestCompletedSchedulesForMultipleTokens(address[] calldata tokens)
    external
    returns (uint256[] memory vestedAmounts);

//  /**
//   * @dev claim multiple tokens for specific vesting schedule,
//   *      if schedule has not ended yet, claiming amounts are linear with vesting blocks
//   */
//  function vestScheduleForMultipleTokensAtIndices(
//    address[] calldata tokens,
//    uint256[][] calldata indices
//  )
//    external
//    returns (uint256[] memory vestedAmounts);

  /**
   * @dev for all completed schedule, claim token
   */
  function vestCompletedSchedules(address token) external returns (uint256);

  /**
   * @dev claim token for specific vesting schedule,
   * @dev if schedule has not ended yet, claiming amount is linear with vesting blocks
   */
  function vestScheduleAtIndices(address token, uint256[] calldata indexes)
    external
    returns (uint256);

  /**
   * @dev claim token for specific vesting schedule from startIndex to endIndex
   */
  function vestSchedulesInRange(
    address token,
    uint256 startIndex,
    uint256 endIndex
  ) external returns (uint256);

  /**
   * @dev length of vesting schedules array
   */
  function numVestingSchedules(address account, address token) external view returns (uint256);

  /**
   * @dev get detailed of each vesting schedule
   */
//  function getVestingScheduleAtIndex(
//    address account,
//    address token,
//    uint256 index
//  ) external view returns (VestingSchedule memory);
}