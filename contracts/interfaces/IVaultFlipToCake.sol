pragma solidity ^0.6.0;

interface IVaultFlipToCake {
    function deposit(uint amount) external;
    function depositAll() external;
    function withdraw(uint amount) external;
    function withdrawAll() external;
    function withdrawUnderlying(uint _amount) external;
    function getReward() external;

    function balanceOf(address account) external view returns (uint);
    function earned(address account) external view returns (uint);
    function rewardsToken() external view returns (address);
}
