// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;

interface IPiggyBank {

    struct Attr { 
        uint256 tokenId;
        uint256 unlockTime;
        uint256 startTime;
        uint256 targetBalance;
        string name;
        string description;
    }

    event PiggyInitialised(Attr attributes);
    event Received(address _from, uint _amount);
    event Withdrawal(address who, uint amount, uint balance);
    event SupportedTokenWithdrawal(address indexed token, address who, uint amount, uint balance);
    event TargetReached();
    event OptedInForOriginProtocolRebasing();

    function initialize(Attr calldata _data, uint16 _breakPiggyBps) external;
    function getTotalBalance() external view returns(uint256 totalBalance);
    function payout(address recipient, address payable feeRecipient, uint256 thisOwnerBalance, uint256 totalSupply, address[] memory supportedTokens) external payable;
}