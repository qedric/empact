// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;

interface IVault {

    enum State { Locked, Unlocked, Open }

    struct Attr {
        address baseToken;
        uint256 tokenId;
        uint256 unlockTime;
        uint256 startTime;
        uint256 targetBalance;
        string name;
        string description;
    }

    event VaultInitialised(Attr attributes);
    event StateChanged(State newState);
    event Received(address _from, uint _amount);
    event Withdrawal(address who, uint amount, uint balance);
    event WithdrawalFeePaid(address recipient, uint amount);
    event TokenWithdrawal(address indexed token, address who, uint amount, uint fee, uint balance);
    event TargetReached();
    event OptedInForOriginProtocolRebasing();
    event SendToken(address indexed tokenAddress, address recipientAddress, uint amount);
    event SendNativeTokenToTreasury(address treasuryAddress, uint amount);

    function initialize(Attr calldata _data, uint16 _breakVaultBps) external;
    function state() external view returns(State);
    function getTotalBalance() external view returns(uint256 totalBalance);
    function payout(address recipient, address payable feeRecipient, uint256 thisOwnerBalance, uint256 totalSupply) external payable returns(State);
    function sendToTreasury() external payable;
    function attributes() external view returns (Attr memory attributes);
}