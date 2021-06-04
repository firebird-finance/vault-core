pragma solidity ^0.6.0;

interface IACryptoSFarmV2 {
    function deposit(address _lpToken, uint _amount) external;
    function withdraw(address _lpToken, uint _amount) external;
    function userInfo(address _lpToken, address _user) external view returns (uint amount, uint weight, uint rewardDebt, uint rewardCredit);
    function pendingSushi(address _lpToken, address _user) external view returns (uint256);
    function harvest(address _lpToken) external;
    function harvestFee() external view returns (uint256);
}
