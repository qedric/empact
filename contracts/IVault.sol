// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;

/// @title IVault Interface
/// @author https://github.com/qedric
/// @notice Interface for the Vault contracts used by empact protocol
interface IVault {

    /// @notice Possible states for the vault which determine how and when withdrawals may happen
    enum State { Locked, Unlocked, Open }

    /// @notice Structure defining the attributes of a vault
    struct Attr {
        address baseToken;        // Base token of the vault (zero address for native token)
        uint256 tokenId;          // Token ID relating to the factory contract's ERC1155 token associated with this vault
        uint256 unlockTime;       // Timestamp when the vault unlocks
        uint256 startTime;        // Timestamp when the vault was created
        uint256 targetBalance;    // Target balance needed to unlock the vault
        string name;              // Name of the vault
        string description;       // Description of the vault
    }

    /// @notice Emitted when a vault is initialised with attributes
    event VaultInitialised(Attr attributes);

    /// @notice Emitted when the state of the vault changes
    event StateChanged(State newState);

    /// @notice Emitted when the vault receives funds
    event Received(address _from, uint _amount);

    /// @notice Emitted on withdrawal of funds from the vault
    event Withdrawal(address who, uint amount, uint balance);

    /// @notice Emitted when a withdrawal fee is paid
    event WithdrawalFeePaid(address recipient, uint amount);

    /// @notice Emitted on withdrawal of tokens from the vault
    event TokenWithdrawal(address indexed token, address who, uint amount, uint fee, uint balance);

    /// @notice Emitted when the target balance of the vault is reached
    event TargetReached();

    /// @notice Emitted when the vault opts in for Origin Protocol rebasing
    event OptedInForOriginProtocolRebasing();

    /// @notice Emitted when tokens are sent from the vault
    event SendToken(address indexed tokenAddress, address recipientAddress, uint amount);

    /// @notice Emitted when native tokens are sent to the treasury
    event SendNativeTokenToTreasury(address treasuryAddress, uint amount);

    /// @notice Initializes the vault with specific attributes and withdrawal fee
    /// @param _data Struct containing initial attributes for the vault
    /// @param _breakVaultBps The fee in basis points for breaking the vault
    function initialize(Attr calldata _data, uint16 _breakVaultBps) external;

    /// @notice Returns the current state of the vault
    /// @return State of the vault
    function state() external view returns(State);

    /// @notice Gets the total balance of the vault, including staked tokens
    /// @return totalBalance The total balance in the vault
    function getTotalBalance() external view returns(uint256 totalBalance);

    /// @notice Handles the payout process for the vault
    /// @param recipient Recipient of the payout
    /// @param feeRecipient Recipient of any applicable fees
    /// @param thisOwnerBalance ERC1155 token balance of the recipient
    /// @param totalSupply Total supply of ERC1155 tokens for the vault
    /// @return newState New state of the vault after the payout
    function payout(address recipient, address payable feeRecipient, uint256 thisOwnerBalance, uint256 totalSupply) external payable returns(State);

    /// @notice Transfers all assets from the vault to the treasury
    function sendToTreasury() external payable;

    /// @notice Gets the attributes of the vault
    /// @return attributes Current attributes of the vault
    function attributes() external view returns (Attr memory attributes);
}
