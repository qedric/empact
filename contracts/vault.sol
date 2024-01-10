// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.11;

import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@thirdweb-dev/contracts/extension/Initializable.sol";
import "./IVault.sol";
import "./ITreasury.sol";

/*
    Origin Protocol staked tokens are treated differently to other supported tokens
    because its contract requires a call to be made from the vault contract address
    to opt-in to staking rewards. 

    Origin Protocol still needs to be added as a supported token via the factory contract
*/
interface IOETHToken {
    function rebaseOptIn() external;
}

contract Vault is IVault, Initializable {
    using SafeERC20 for IERC20;

    State public state = State.Locked; // Initialize as locked
    Attr private _attributes;
    bool public oETHRebasingEnabled = false;
    
    address public immutable factory;
    address public immutable treasury;

    /// @notice Cannot be modified after initialisation
    uint16 public withdrawalFeeBps;

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

    constructor(address _factory, address _treasury) {
        factory = _factory;
        treasury = _treasury;
        _disableInitializers();
    }

    function initialize(Attr calldata _data, uint16 _breakVaultBps) external onlyFactory initializer {
        _attributes = _data;
        withdrawalFeeBps = _breakVaultBps;
        emit VaultInitialised(_data);
    }

    /*  @notice this needs to be called if target is reached with non native tokens.
                this needs to be called if no vaults are received after unlock time has been reached.
                this call is not necessary if the target is reached with native tokens only.
    */
    function setStateUnlocked() external {

        require(
            state == State.Locked,
            'Vault is not locked'
        );

        require(
            _getStakedTokenBalance() + address(this).balance >= _attributes.targetBalance,
            'Vault has not met target'
        );

        require(
            block.timestamp > _attributes.unlockTime,
            'Vault has not reached maturity'
        );

        // set to Unlocked
        state = State.Unlocked;
        emit StateChanged(State.Unlocked);
    }

    /// @notice Supported staked tokens can contribute to the target balance.
    function getTotalBalance() external view returns(uint256 totalBalance) {
        totalBalance = _getStakedTokenBalance() + address(this).balance;
    }

    function getNativeTokenBalance() external view returns(uint256 balance) {
        return address(this).balance;
    }

    function _getStakedTokenBalance() internal view returns(uint256 totalStakedTokenBalance) {
        for (uint256 i = 0; i <  ITreasury(treasury).supportedTokens().length; i++) {
            IERC20 token = IERC20(ITreasury(treasury).supportedTokens()[i]);
            totalStakedTokenBalance += token.balanceOf(address(this));
        }
    }

    function attributes() external view returns (IVault.Attr memory) {
        return _attributes;
    }

    /// opt-in is required to earn yield from oETH (Origin Protocol) tokens held by this vault
    function optInForOETHRebasing() external {
        require(!oETHRebasingEnabled, 'oETH rebasing already enabled');
        require(ITreasury(treasury).oETHTokenAddress() != address(0), "oETH contract address is not set");
        
        emit OptedInForOriginProtocolRebasing();
        oETHRebasingEnabled = true;

        // Make the call to the oETH contract
        IOETHToken oETHToken = IOETHToken(ITreasury(treasury).oETHTokenAddress());
        oETHToken.rebaseOptIn();
    }

    /// @notice transfers the share of available vaults to the recipient and fee recipient
    /// @notice If this is the last payout, set state to Open
    function payout(
        address recipient,
        address payable feeRecipient,
        uint256 thisOwnerBalance,
        uint256 totalSupply
    ) external payable onlyFactory returns(State) {

        require(
            state == State.Unlocked,
            "Vault must be Unlocked"
        );

        // set the state to Open if it's the last payout
        if (totalSupply - thisOwnerBalance == 0 ) {
            // set to Open
            emit StateChanged(State.Open);
            state = State.Open;
        } 

        // calculate the ETH amount owed
        uint256 payoutAmount = address(this).balance * thisOwnerBalance / totalSupply;
        uint256 payoutFee = payoutAmount * withdrawalFeeBps / 10000;

        require(
            payoutAmount > 0,
            "Vault is empty"
        );

        // send the withdrawal event and pay the owner
        emit Withdrawal(recipient, payoutAmount - payoutFee, thisOwnerBalance);
        payable(recipient).transfer(payoutAmount - payoutFee);

        // send the fee to the factory contract owner
        emit WithdrawalFeePaid(feeRecipient, payoutFee);
        feeRecipient.transfer(payoutFee);

        // Withdraw supported tokens and calculate the amounts
        for (uint256 i = 0; i < ITreasury(treasury).supportedTokens().length; i++) {
            address tokenAddress = ITreasury(treasury).supportedTokens()[i];
            IERC20 token = IERC20(tokenAddress);
            uint256 tokenBalance = token.balanceOf(address(this));

            // Calculate the amount of supported tokens to be withdrawn
            uint256 tokenPayoutAmount = tokenBalance * thisOwnerBalance / totalSupply;
            uint256 tokenPayoutFee = tokenPayoutAmount * withdrawalFeeBps / 10000;

            // Send the withdrawal event and pay the owner with supported tokens
            emit SupportedTokenWithdrawal(tokenAddress, recipient, tokenPayoutAmount, thisOwnerBalance);
            token.safeTransfer(recipient, tokenPayoutAmount - tokenPayoutFee);

            // send the fee to the factory contract owner
            token.safeTransfer(feeRecipient, tokenPayoutFee);
        }

        return state;
    }

    /// @notice transfers all supported tokens to the treasury. Can only be called when the state is Open
    function sendToTreasury() external payable onlyTreasury {

        require(
            state == State.Open,
            'Vault must be Open'
        );

        emit SendNativeTokenToTreasury(address(this), msg.sender, address(this).balance);

        // Transfer native ETH balance to the treasury
        payable(msg.sender).transfer(address(this).balance);

        // Transfer all tokens to the treasury
        for (uint256 i = 0; i < ITreasury(treasury).supportedTokens().length; i++) {
            address tokenAddress = ITreasury(treasury).supportedTokens()[i];
            IERC20 token = IERC20(tokenAddress);
            uint256 tokenBalance = token.balanceOf(address(this));
            if (tokenBalance > 0) {
                emit SendSupportedTokenToTreasury(address(this), msg.sender, tokenAddress, tokenBalance);
                token.safeTransfer(msg.sender, tokenBalance);
            }
        }
    }

    receive() external payable {
        emit Received(msg.sender, msg.value);
        if (
            _getStakedTokenBalance() + address(this).balance >= _attributes.targetBalance &&
            block.timestamp > _attributes.unlockTime &&
            state == State.Locked
            ) {
            // set to Unlocked
            emit StateChanged(State.Unlocked);
            state = State.Unlocked;
        }
    }
}