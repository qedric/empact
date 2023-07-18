// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.11;

import "@thirdweb-dev/contracts/extension/Initializable.sol";

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

interface ICPFactory {
    function oETHTokenAddress() external view returns (address payable);
    function getSupportedTokens() external view returns (address[] memory);
}

interface ISupportedToken {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

interface IOETHToken {
    function rebaseOptIn() external;
}

contract PiggyBank is IPiggyBank, Initializable {

    bool private _targetReached;
    bool public oETHRebasingEnabled = false;
    Attr public attributes;
    ICPFactory public immutable factory;

    /// @notice Cannot be modified after initialisation
    uint16 public breakPiggyFeeBps;

    /// @notice Checks that the `msg.sender` is the factory.
    modifier onlyFactory() {
        require(msg.sender == address(factory), "onlyFactory");
        _;
    }

    constructor(ICPFactory _factory) {
        factory = _factory;
        _disableInitializers();
    }

    function initialize(Attr calldata _data, uint16 _breakPiggyBps) external onlyFactory initializer {
        attributes = _data;
        breakPiggyFeeBps = _breakPiggyBps;
        emit PiggyInitialised(_data);        
    }

    /// @notice this needs to be called if some of the target balance comes from non-ETH supported tokens.
    /// @notice this call is not necessary if the target is reached with native ETH only.
    function setTargetReached() external {
        require(getStakedTokenBalance() + address(this).balance >= attributes.targetBalance,
            'Piggy is still hungry!');
        _targetReached = true;
        emit TargetReached();
    }

    /// @notice Supported staked tokens can contribute to the target balance.
    function getTotalBalance() external view returns(uint256 totalBalance) {
        totalBalance = getStakedTokenBalance() + address(this).balance;
    }

    function getStakedTokenBalance() internal view returns(uint256 totalStakedTokenBalance) {
        for (uint256 i = 0; i < factory.getSupportedTokens().length; i++) {
            ISupportedToken token = ISupportedToken(factory.getSupportedTokens()[i]);
            totalStakedTokenBalance += token.balanceOf(address(this));
        }
    }

    /// opt-in is required to earn yield from oETH (Origin Protocol) tokens held by this piggy
    function optInForOETHRebasing() external {
        require(!oETHRebasingEnabled, 'oETH rebasing already enabled');
        require(factory.oETHTokenAddress() != address(0), "oETH contract address is not set");
        // Make the call to the oETH contract
        IOETHToken oETHToken = IOETHToken(factory.oETHTokenAddress());
        oETHToken.rebaseOptIn();
        emit OptedInForOriginProtocolRebasing();
        oETHRebasingEnabled = true;
    }

    function payout(
        address recipient,
        address payable feeRecipient,
        uint256 thisOwnerBalance,
        uint256 totalSupply,
        address[] memory supportedTokens
    ) external payable onlyFactory {

        require(
            block.timestamp > attributes.unlockTime,
            "You can't withdraw yet"
        );
        
        require(
            _targetReached,
            "Piggy is still hungry!"
        );

        // calculate the ETH amount owed
        uint256 payoutAmount = address(this).balance * thisOwnerBalance / totalSupply;
        uint256 payoutFee = payoutAmount * breakPiggyFeeBps / 10000;

        // send the withdrawal event and pay the owner
        emit Withdrawal(recipient, payoutAmount, thisOwnerBalance);

        payable(recipient).transfer(payoutAmount - payoutFee);

        // send the fee to the factory contract owner
        feeRecipient.transfer(payoutFee);

        // Withdraw supported tokens and calculate the amounts
        for (uint256 i = 0; i < supportedTokens.length; i++) {
            address tokenAddress = supportedTokens[i];
            ISupportedToken token = ISupportedToken(tokenAddress);
            uint256 tokenBalance = token.balanceOf(address(this));

            // Calculate the amount of supported tokens to be withdrawn
            uint256 tokenPayoutAmount = tokenBalance * thisOwnerBalance / totalSupply;
            uint256 tokenPayoutFee = tokenPayoutAmount * breakPiggyFeeBps / 10000;

            // Send the withdrawal event and pay the owner with supported tokens
            emit SupportedTokenWithdrawal(tokenAddress, recipient, tokenPayoutAmount, thisOwnerBalance);
            token.transfer(recipient, tokenPayoutAmount - tokenPayoutFee);

            // send the fee to the factory contract owner
            token.transfer(feeRecipient, tokenPayoutFee);
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