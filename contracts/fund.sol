// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.11;

import "@thirdweb-dev/contracts/extension/Initializable.sol";
import "@IFund.sol";
import "@ITreasury";

interface ISupportedToken {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

interface IOETHToken {
    function rebaseOptIn() external;
}

contract Fund is IFund, Initializable {

    State public currentState = State.Locked; // Initialize as locked
    bool private _targetReached;
    bool public oETHRebasingEnabled = false;
    Attr public attributes;
    address public immutable factory;
    address public immutable treasury;

    /// @notice Cannot be modified after initialisation
    uint16 public breakFundFeeBps;

    /// @notice Checks that the `msg.sender` is the factory.
    modifier onlyFactory() {
        require(msg.sender == address(factory), "onlyFactory");
        _;
    }

    /// @notice Checks that the `msg.sender` is the treasury.
    modifier onlyTreasury() {
        require(msg.sender == address(treasury), "onlyTreasury");
        _;
    }

    constructor(address _factory, address, _treasury) {
        factory = _factory;
        treasury = _treasury;
        _disableInitializers();
    }

    function initialize(Attr calldata _data, uint16 _breakFundBps) external onlyFactory initializer {
        attributes = _data;
        breakFundFeeBps = _breakFundBps;
        emit FundInitialised(_data);
    }

    /// @notice this needs to be called if some of the target balance comes from non-ETH supported tokens.
    /// @notice this call is not necessary if the target is reached with native ETH only.
    function setTargetReached() external {
        require(getStakedTokenBalance() + address(this).balance >= attributes.targetBalance,
            'Fund is still hungry!');
        _targetReached = true;
        emit TargetReached();
    }

    /// @notice Supported staked tokens can contribute to the target balance.
    function getTotalBalance() external view returns(uint256 totalBalance) {
        totalBalance = getStakedTokenBalance() + address(this).balance;
    }

    function getStakedTokenBalance() internal view returns(uint256 totalStakedTokenBalance) {
        for (uint256 i = 0; i <  ITreasury(treasury).supportedTokens().length; i++) {
            ISupportedToken token = ISupportedToken(ITreasury(treasury).supportedTokens()[i]);
            totalStakedTokenBalance += token.balanceOf(address(this));
        }
    }

    /// opt-in is required to earn yield from oETH (Origin Protocol) tokens held by this fund
    function optInForOETHRebasing() external {
        require(!oETHRebasingEnabled, 'oETH rebasing already enabled');
        require(ITreasury(treasury).oETHTokenAddress() != address(0), "oETH contract address is not set");
        // Make the call to the oETH contract
        IOETHToken oETHToken = IOETHToken(ITreasury(treasury).oETHTokenAddress());
        oETHToken.rebaseOptIn();
        emit OptedInForOriginProtocolRebasing();
        oETHRebasingEnabled = true;
    }

    /// @notice transfers the share of available funds to the recipient and fee recipient
    /// @notice If this is the last payout, set state to Open, otherwise set to unlocked
    function payout(
        address recipient,
        address payable feeRecipient,
        uint256 thisOwnerBalance,
        uint256 totalSupply
    ) external payable onlyFactory returns(int8) {

        require(
            block.timestamp > attributes.unlockTime,
            "You can't withdraw yet"
        );
        
        require(
            _targetReached,
            "Fund is still hungry!"
        );

        // calculate the ETH amount owed
        uint256 payoutAmount = address(this).balance * thisOwnerBalance / totalSupply;
        uint256 payoutFee = payoutAmount * breakFundFeeBps / 10000;

        // set the state to unlocked unless it's the last payout, then set to open
        currentState = ( totalSupply - thisOwnerBalance == 0 ) ? State.Open : State.Unlocked;

        // send the withdrawal event and pay the owner
        emit Withdrawal(recipient, payoutAmount, thisOwnerBalance);

        payable(recipient).transfer(payoutAmount - payoutFee);

        // send the fee to the factory contract owner
        feeRecipient.transfer(payoutFee);

        // Withdraw supported tokens and calculate the amounts
        for (uint256 i = 0; i < ITreasury(treasury).supportedTokens().length; i++) {
            address tokenAddress = ITreasury(treasury).supportedTokens()[i];
            ISupportedToken token = ISupportedToken(tokenAddress);
            uint256 tokenBalance = token.balanceOf(address(this));

            // Calculate the amount of supported tokens to be withdrawn
            uint256 tokenPayoutAmount = tokenBalance * thisOwnerBalance / totalSupply;
            uint256 tokenPayoutFee = tokenPayoutAmount * breakFundFeeBps / 10000;

            // Send the withdrawal event and pay the owner with supported tokens
            emit SupportedTokenWithdrawal(tokenAddress, recipient, tokenPayoutAmount, thisOwnerBalance);
            token.transfer(recipient, tokenPayoutAmount - tokenPayoutFee);

            // send the fee to the factory contract owner
            token.transfer(feeRecipient, tokenPayoutFee);
        }

        return currentState;
    }

    /// @notice transfers all supported tokens to the treasury. Can only be called when the state is Open
    function sendToTreasury() external payable onlyTreasury {

        require(
            currentState == State.Open,
            'Fund must be Open'
        );

        emit SendETHToTreasury(msg.sender, address(this).balance);

        // Transfer native ETH balance to the treasury
        payable(msg.sender).transfer(address(this).balance);

        // Transfer all tokens to the treasury
        for (uint256 i = 0; i < ITreasury(treasury).supportedTokens().length; i++) {
            address tokenAddress = ITreasury(treasury).supportedTokens()[i];
            ISupportedToken token = ISupportedToken(tokenAddress);
            uint256 tokenBalance = token.balanceOf(address(this));
            if (tokenBalance > 0) {
                emit SendSupportedTokenToTreasury(msg.sender, tokenAddress, tokenBalance);
                token.transfer(msg.sender, tokenBalance);
            }
        }
    }

    receive() external payable {
        emit Received(msg.sender, msg.value);
        if (!_targetReached && address(this).balance >= attributes.targetBalance) {
            _targetReached = true;
            emit TargetReached();
        }
    }
}