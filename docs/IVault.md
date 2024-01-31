# Solidity API

## IVault

Interface for the Vault contracts used by empact protocol

### State

```solidity
enum State {
  Locked,
  Unlocked,
  Open
}
```

### Attr

```solidity
struct Attr {
  address baseToken;
  uint256 tokenId;
  uint256 unlockTime;
  uint256 startTime;
  uint256 targetBalance;
  string name;
  string description;
}
```

### VaultInitialised

```solidity
event VaultInitialised(struct IVault.Attr attributes)
```

Emitted when a vault is initialised with attributes

### StateChanged

```solidity
event StateChanged(enum IVault.State newState)
```

Emitted when the state of the vault changes

### Received

```solidity
event Received(address _from, uint256 _amount)
```

Emitted when the vault receives funds

### Withdrawal

```solidity
event Withdrawal(address who, uint256 amount, uint256 balance)
```

Emitted on withdrawal of funds from the vault

### WithdrawalFeePaid

```solidity
event WithdrawalFeePaid(address recipient, uint256 amount)
```

Emitted when a withdrawal fee is paid

### TokenWithdrawal

```solidity
event TokenWithdrawal(address token, address who, uint256 amount, uint256 fee, uint256 balance)
```

Emitted on withdrawal of tokens from the vault

### TargetReached

```solidity
event TargetReached()
```

Emitted when the target balance of the vault is reached

### OptedInForOriginProtocolRebasing

```solidity
event OptedInForOriginProtocolRebasing()
```

Emitted when the vault opts in for Origin Protocol rebasing

### SendToken

```solidity
event SendToken(address tokenAddress, address recipientAddress, uint256 amount)
```

Emitted when tokens are sent from the vault

### SendNativeTokenToTreasury

```solidity
event SendNativeTokenToTreasury(address treasuryAddress, uint256 amount)
```

Emitted when native tokens are sent to the treasury

### initialize

```solidity
function initialize(struct IVault.Attr _data, uint16 _breakVaultBps) external
```

Initializes the vault with specific attributes and withdrawal fee

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _data | struct IVault.Attr | Struct containing initial attributes for the vault |
| _breakVaultBps | uint16 | The fee in basis points for breaking the vault |

### state

```solidity
function state() external view returns (enum IVault.State)
```

Returns the current state of the vault

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | enum IVault.State | State of the vault |

### getTotalBalance

```solidity
function getTotalBalance() external view returns (uint256 totalBalance)
```

Gets the total balance of the vault, including staked tokens

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| totalBalance | uint256 | The total balance in the vault |

### payout

```solidity
function payout(address recipient, address payable feeRecipient, uint256 thisOwnerBalance, uint256 totalSupply) external payable returns (enum IVault.State)
```

Handles the payout process for the vault

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| recipient | address | Recipient of the payout |
| feeRecipient | address payable | Recipient of any applicable fees |
| thisOwnerBalance | uint256 | ERC1155 token balance of the recipient |
| totalSupply | uint256 | Total supply of ERC1155 tokens for the vault |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | enum IVault.State | newState New state of the vault after the payout |

### sendToTreasury

```solidity
function sendToTreasury() external payable
```

Transfers all assets from the vault to the treasury

### attributes

```solidity
function attributes() external view returns (struct IVault.Attr attributes)
```

Gets the attributes of the vault

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| attributes | struct IVault.Attr | Current attributes of the vault |

