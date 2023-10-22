// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;

interface IFund {

    enum State { Locked, Unlocked, Open }

    struct Attr { 
        uint256 tokenId;
        uint256 unlockTime;
        uint256 startTime;
        uint256 targetBalance;
        string name;
        string description;
    }

    event FundInitialised(Attr attributes);
    event Received(address _from, uint _amount);
    event Withdrawal(address who, uint amount, uint balance);
    event SupportedTokenWithdrawal(address indexed token, address who, uint amount, uint balance);
    event TargetReached();
    event OptedInForOriginProtocolRebasing();
    event SendETHToTreasury(address treasury, uint amount);
    event SendSupportedTokenToTreasury(address treasury, address tokenAddress, uint tokenBalance);

    function initialize(Attr calldata _data, uint16 _breakFundBps) external;
    function currentState() external view returns(State);
    function getTotalBalance() external view returns(uint256 totalBalance);
    function payout(address recipient, address payable feeRecipient, uint256 thisOwnerBalance, uint256 totalSupply) external payable returns(State);
    function sendToTreasury() external payable;
    function attributes() external view returns (Attr calldata attributes);
}