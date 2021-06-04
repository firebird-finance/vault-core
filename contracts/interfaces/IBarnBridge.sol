// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6.0;

interface IStaking {

    function getEpochId(uint timestamp) external view returns (uint); // get epoch id
    function getEpochUserBalance(address user, address token, uint128 epoch) external view returns(uint);
    function getEpochPoolSize(address token, uint128 epoch) external view returns (uint);
    function epoch1Start() external view returns (uint);
    function epochDuration() external view returns (uint);

    function deposit(address tokenAddress, uint256 amount) external;
    function withdraw(address tokenAddress, uint256 amount) external;
    function balanceOf(address user, address token) external view returns (uint256);
    function manualEpochInit(address[] memory tokens, uint128 epochId) external;
}

interface IYieldFarm {
    function massHarvest() external returns (uint);
    function harvest (uint128 epochId) external returns (uint);
    function getCurrentEpoch() external view returns (uint);
    function lastInitializedEpoch() external view returns (uint);
    function getPoolSize(uint128 epochId) external view returns (uint);
    function getEpochStake(address userAddress, uint128 epochId) external view returns (uint);
    function userLastEpochIdHarvested() external view returns (uint);
}