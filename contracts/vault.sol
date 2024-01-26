// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.11;

import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@thirdweb-dev/contracts/extension/Initializable.sol";
import "./IVault.sol";
import "./ITreasury.sol";

/* @notice
    Origin Protocol staked tokens are treated differently to other supported tokens
    because its contract requires a call to be made from the vault contract address
    to opt-in to receive staking rewards. 

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
                this needs to be called if no tokens are received after unlock time has been reached.
                this call is not necessary if the target is reached with native tokens only.
    */
    function setStateUnlocked() external {

        require(
            state == State.Locked,
            'Vault not locked'
        );

        require(
            block.timestamp > _attributes.unlockTime,
            'Vault has not reached maturity'
        );

        if (_attributes.targetBalance > 0) {
            if (_attributes.baseToken == address(0)) { // native token balance
                require(
                    _getStakedTokenBalance() + address(this).balance >= _attributes.targetBalance,
                    'Target not met'
                );
            } else {
                require(
                    _getTokenBalance(_attributes.baseToken) >= _attributes.targetBalance,
                    'Target not met'
                );
            }
        }

        // set to Unlocked
        state = State.Unlocked;
        emit StateChanged(State.Unlocked);
    }

    /// @notice Supported staked tokens can contribute to the native target balance.
    function getTotalBalance() external view returns(uint256 totalBalance) {
        totalBalance = _getStakedTokenBalance() + address(this).balance;
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

    /// @notice transfers the share of native & staked tokens OR supported token to the recipient
    /// @notice distributes fees to the fee recipient
    /// @notice If this is the last payout, sets state to Open
    function payout(
        address recipient,
        address payable feeRecipient,
        uint256 thisOwnerBalance,
        uint256 totalSupply
    ) external payable onlyFactory returns(State) {

        require(
            state == State.Unlocked,
            "Must be Unlocked"
        );

        assert(totalSupply > 0);
        assert(thisOwnerBalance > 0);

        // set the state to Open if it's the last payout
        if (totalSupply - thisOwnerBalance == 0 ) {
            // set to Open
            emit StateChanged(State.Open);
            state = State.Open;
        }

        if (_attributes.baseToken == address(0)) { // native token

            // calculate the native token amount owed
            uint256 payoutAmount = address(this).balance * thisOwnerBalance / totalSupply;

            if (payoutAmount > 0) {
                // calculate the fee amount
                uint256 payoutFee = payoutAmount * withdrawalFeeBps / 10000;

                // send the withdrawal event and pay the owner
                emit Withdrawal(recipient, payoutAmount - payoutFee, thisOwnerBalance);
                payable(recipient).transfer(payoutAmount - payoutFee);

                // send the fee to the factory contract owner
                emit WithdrawalFeePaid(feeRecipient, payoutFee);
                feeRecipient.transfer(payoutFee);
            }

            // withdraw native staked tokens to the recipient & pay fees
            _withdrawTokens(
                ITreasury(treasury).nativeStakedTokens(),
                recipient,
                feeRecipient,
                thisOwnerBalance,
                totalSupply
            );      

        } else { // supported token

            // Withdraw supported tokens and calculate the amounts
            _withdrawTokens(
                ITreasury(treasury).supportedTokens(),
                recipient,
                feeRecipient,
                thisOwnerBalance,
                totalSupply
            );
        }

        return state;
    }

    /// @notice transfers all supported tokens to the treasury. Can only be called when the state is Open
    function sendToTreasury() external payable onlyTreasury {

        require(
            state == State.Open,
            'State not Open'
        );

        emit SendNativeTokenToTreasury(msg.sender, address(this).balance);

        // Transfer native ETH balance to the treasury
        if (address(this).balance > 0) {
            payable(msg.sender).transfer(address(this).balance);    
        }

        // Transfer all supported tokens to the treasury
        for (uint256 i = 0; i < ITreasury(treasury).supportedTokens().length; i++) {
            _sendToken(ITreasury(treasury).supportedTokens()[i]);
        }

        // Transfer all native staked tokens to the treasury
        for (uint256 i = 0; i < ITreasury(treasury).nativeStakedTokens().length; i++) {
            _sendToken(ITreasury(treasury).nativeStakedTokens()[i]);
        }
    }

    /// @notice sends full balance of a given token to sender
    function _sendToken(address tokenAddress) internal {
        IERC20 token = IERC20(tokenAddress);
        uint256 tokenBalance = token.balanceOf(address(this));
        if (tokenBalance > 0) {
            emit SendToken(tokenAddress, msg.sender, tokenBalance);
            token.safeTransfer(msg.sender, tokenBalance);
        }
    }

    /// @notice withdraws a share of token balances to a recipient & sends fees
    function _withdrawTokens(
        address[] memory tokens,
        address recipient,
        address feeRecipient,
        uint256 ownerBalance,
        uint256 totalSupply) internal {

        for (uint256 i = 0; i < tokens.length; i++) {
            IERC20 token = IERC20(tokens[i]);
            uint256 tokenBalance = _getTokenBalance(tokens[i]);

            if (tokenBalance > 0) {
                uint256 amount = tokenBalance * ownerBalance / totalSupply;
                uint256 fee = amount * withdrawalFeeBps / 10000;

                // Send the withdrawal event and pay the owner with supported tokens
                emit TokenWithdrawal(tokens[i], recipient, amount, fee, ownerBalance);
                token.safeTransfer(recipient, amount - fee);

                // send the fee to the factory contract owner
                if (fee > 0) {
                    token.safeTransfer(feeRecipient, fee);  
                }
            }
        }
    }

    /// @notice gets the vault's current balance of a non-native token
    function _getTokenBalance(address tokenAddress) internal view returns (uint256) {
        return IERC20(tokenAddress).balanceOf(address(this));
    }

    // if native tokens are received
    receive() external payable {
        emit Received(msg.sender, msg.value);
        if ( 
                state == State.Locked &&
                _attributes.baseToken == address(0) &&
                block.timestamp > _attributes.unlockTime &&
                _getStakedTokenBalance() + address(this).balance >= _attributes.targetBalance
            ) {
            // set to Unlocked
            emit StateChanged(State.Unlocked);
            state = State.Unlocked;
        }
    }
}