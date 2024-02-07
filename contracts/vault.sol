// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.11;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
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

/**
 * @title empact protocol Vault Contract
 * @author https://github.com/qedric
 * @notice This contract serves as a non-custodial vault to secure assets on-chain. It allows users to lock assets until certain conditions are met, and then facilitate withdrawals.
 */
contract Vault is IVault, Initializable {
    using SafeERC20 for IERC20;

    State public state = State.Locked; // Initialize as locked
    Attr private _attributes;
    bool public oETHRebasingEnabled = false;
    
    address public immutable factory;
    address public immutable treasury;

    /// @notice The fee in basis points charged when withdrawing funds.
    /// @dev Cannot be modified after initialisation
    uint16 public withdrawalFeeBps;

    modifier onlyFactory() {
        require(msg.sender == address(factory), "onlyFactory");
        _;
    }

    modifier onlyTreasury() {
        require(msg.sender == address(treasury), "onlyTreasury");
        _;
    }

    constructor(address _factory, address _treasury) {
        factory = _factory;
        treasury = _treasury;
        _disableInitializers();
    }

    /**
     * @notice Initializes the vault with specific attributes and withdrawal fee.
     * @dev Can only be called once and only by the factory contract.
     * @param _data Struct containing initial attributes for the vault.
     * @param _breakVaultBps The fee in basis points charged when withdrawing funds.
     */
    function initialize(Attr calldata _data, uint16 _breakVaultBps) external onlyFactory initializer {
        _attributes = _data;
        withdrawalFeeBps = _breakVaultBps;
        emit VaultInitialised(_data);
    }

    /**
     * @notice Transitions the state of the vault from 'Locked' to 'Unlocked' under specific conditions.
                this needs to be called if target is reached with non native tokens.
                this needs to be called if no tokens are received after unlock time has been reached.
                this call is not necessary if the target is reached with native tokens only.
     * @dev Can only be called when the vault is 'Locked'. The state transition depends on the target balance being met and the current time surpassing the unlock time.
     * @custom:requirement Vault Must Be Locked Requires the vault to be in 'Locked' state.
     * @custom:requirement Maturity Reached Checks if the current time is greater than the unlock time.
     * @custom:requirement Target Balance Met Validates if the target balance for unlocking the vault has been met.
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
                    ITreasury(treasury).isSupportedToken(_attributes.baseToken),
                    'Unsupported token'
                );
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

    /**
     * @notice Calculates the total balance of the vault, including both native and staked tokens.
                this should not be used when the vault has a non-native base token.
     * @return totalBalance The total balance held in the vault, including staked tokens.
     */
    function getTotalBalance() external view returns(uint256 totalBalance) {
        totalBalance = _getStakedTokenBalance() + address(this).balance;
    }

    function _getStakedTokenBalance() internal view returns(uint256 totalStakedTokenBalance) {
        for (uint256 i = 0; i <  ITreasury(treasury).nativeStakedTokens().length; i++) {
            IERC20 token = IERC20(ITreasury(treasury).nativeStakedTokens()[i]);
            totalStakedTokenBalance += token.balanceOf(address(this));
        }
    }

    /**
     * @notice Returns the attributes of the vault.
     * @return A struct containing the vault's attributes.
     */
    function attributes() external view returns (IVault.Attr memory) {
        return _attributes;
    }

    /// @notice Allows the vault to opt-in for receiving yieled from any Origin Protocol's oETH tokens held.
    /// @dev This function sets the `oETHRebasingEnabled` flag to true and calls the `rebaseOptIn` method on the oETH contract.
    ///       It can only be called once as it requires that rebasing is not already enabled.
    ///       The function also checks that the oETH contract address is set in the treasury.
    /// @custom:requirement oETH Rebasing Not Already Enabled Ensures that the contract hasn't already opted in for oETH rebasing.
    /// @custom:requirement oETH Contract Address Set Checks that the oETH contract address is set in the treasury before proceeding.
    /// @custom:emits OptedInForOriginProtocolRebasing Emits an event when the contract opts in for rebasing in the Origin Protocol.
    function optInForOETHRebasing() external {
        require(!oETHRebasingEnabled, 'oETH rebasing already enabled');
        require(ITreasury(treasury).oETHTokenAddress() != address(0), "oETH contract address is not set");
        
        emit OptedInForOriginProtocolRebasing();
        oETHRebasingEnabled = true;

        // Make the call to the oETH contract
        IOETHToken oETHToken = IOETHToken(ITreasury(treasury).oETHTokenAddress());
        oETHToken.rebaseOptIn();
    }

    /// @notice Handles the payout process for the vault, including calculating and transferring assets to the recipient and feeRecipient, and handling different asset types (native & staked, or base token).
    /// @dev This function should only be called when the vault is in the 'Unlocked' state and is only callable by the factory contract.
    /// @param recipient The address of the recipient who will receive the assets from the vault. Should be the caller of the factory payout function.
    /// @param feeRecipient The address payable to which the fee (if any) will be paid.
    /// @param thisOwnerBalance The ERC1155 token balance of the recipient. This determines the share of vault assets that will be paid.
    /// @param totalSupply The total supply of ERC1155 tokens representing this vault.
    /// @return state The new state of the vault after the payout, which can either remain 'Unlocked' or change to 'Open' if it's the last payout.
    /// @custom:modifier onlyFactory Ensures that only the factory ERC1155 contract can call this function.
    /// @custom:requirement Must be in 'Unlocked' state The function requires the vault to be in the 'Unlocked' state.
    /// @custom:assertion Total Supply and Owner Balance Asserts that both totalSupply and thisOwnerBalance are greater than 0.
    /// @custom:emits StateChanged Emits an event when the state changes from 'Unlocked' to 'Open'.
    /// @custom:emits Withdrawal Emits an event indicating the amount withdrawn by the recipient and their corresponding ERC1155 token balance.
    /// @custom:emits WithdrawalFeePaid Emits an event indicating the fee paid to the feeRecipient.
    /// @custom:handling Native Token Checks if the base token is the native token of the chain and handles the payout accordingly, including fee deduction.
    /// @custom:handling Base Token If the asset is not the native token, handles the payout using the specified base token.
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

        } else { // base token

            // Withdraw supported tokens and calculate the amounts
            _withdrawToken(
                IERC20(_attributes.baseToken),
                recipient,
                feeRecipient,
                thisOwnerBalance,
                totalSupply
            );
        }

        return state;
    }

    /// @notice Transfers all assets known to the treasury (native, supported, and staked tokens) from the vault to the treasury.
    /// @dev Can only be called when the vault is in the 'Open' state and exclusively by the treasury contract.
    /// @custom:modifier onlyTreasury Ensures that only the treasury contract can call this function.
    /// @custom:requirement Must be in 'Open' state The function requires the vault to be in the 'Open' state to proceed with the transfer to the treasury.
    /// @custom:emits SendNativeTokenToTreasury Emits an event when native tokens are sent to the treasury.
    /// @custom:emits SendToken Emits an event for each token type transferred to the treasury, including supported tokens and native staked tokens.
    /// @custom:handling Native Token Transfers any native ETH balance to the treasury.
    /// @custom:handling Supported Tokens Iterates through and transfers all supported tokens to the treasury.
    /// @custom:handling Native Staked Tokens Iterates through and transfers all native staked tokens to the treasury.
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

    /// @dev This internal function is used by sendToTreasury to transfer full balance of each individual token.
    function _sendToken(address tokenAddress) internal {
        IERC20 token = IERC20(tokenAddress);
        uint256 tokenBalance = token.balanceOf(address(this));
        if (tokenBalance > 0) {
            emit SendToken(tokenAddress, msg.sender, tokenBalance);
            token.safeTransfer(msg.sender, tokenBalance);
        }
    }

    /// @dev loops through array of tokens and executes the withdrawToken() function
    function _withdrawTokens(
        address[] memory tokens,
        address recipient,
        address feeRecipient,
        uint256 ownerBalance,
        uint256 totalSupply) internal {

        for (uint256 i = 0; i < tokens.length; i++) {
            _withdrawToken(IERC20(tokens[i]), recipient, feeRecipient, ownerBalance, totalSupply);
        }
    }

    /// @dev withdraws a share of a token balance to a recipient & sends fees
    function _withdrawToken(
        IERC20 token,
        address recipient,
        address feeRecipient,
        uint256 ownerBalance,
        uint256 totalSupply) internal {

        uint256 tokenBalance = _getTokenBalance(address(token));

        if (tokenBalance > 0) {
            uint256 amount = tokenBalance * ownerBalance / totalSupply;
            uint256 fee = amount * withdrawalFeeBps / 10000;

            // Send the withdrawal event and pay the owner with supported tokens
            emit TokenWithdrawal(address(token), recipient, amount, fee, ownerBalance);
            token.safeTransfer(recipient, amount - fee);

            // send the fee to the factory contract owner
            if (fee > 0) {
                token.safeTransfer(feeRecipient, fee);  
            }
        }
    }

    /// @dev gets the vault's current balance of a non-native token
    function _getTokenBalance(address tokenAddress) internal view returns (uint256) {
        return IERC20(tokenAddress).balanceOf(address(this));
    }

    /// @notice Handles receiving native tokens (ETH) and potentially changes the vault's state to 'Unlocked'.
    /// @dev This function is triggered when the vault receives native tokens (ETH).
    ///       It emits a Received event and may change the state to 'Unlocked' if certain conditions are met.
    ///       The state changes to 'Unlocked' if the vault is currently 'Locked', the base token is the native token (address(0)),
    ///       the current block timestamp is greater than the unlock time, and the combined balance of staked tokens and native tokens
    ///       meets or exceeds the target balance set for unlocking.
    /// @custom:emits Received Emits an event indicating the sender address and the amount of native tokens received.
    /// @custom:emits StateChanged Emits an event when the state changes from 'Locked' to 'Unlocked'.
    /// @custom:handling State Change Checks if the vault should transition from 'Locked' to 'Unlocked' state based on the balance criteria and time conditions.
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