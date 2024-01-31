# Solidity API

## IOETHToken

### rebaseOptIn

```solidity
function rebaseOptIn() external
```

## Vault

This contract serves as a non-custodial vault to secure assets on-chain. It allows users to lock assets until certain conditions are met, and then facilitate withdrawals.

### state

```solidity
enum IVault.State state
```

Returns the current state of the vault

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |

### oETHRebasingEnabled

```solidity
bool oETHRebasingEnabled
```

### factory

```solidity
address factory
```

### treasury

```solidity
address treasury
```

### withdrawalFeeBps

```solidity
uint16 withdrawalFeeBps
```

The fee in basis points charged when withdrawing funds.

_Cannot be modified after initialisation_

### onlyFactory

```solidity
modifier onlyFactory()
```

### onlyTreasury

```solidity
modifier onlyTreasury()
```

### constructor

```solidity
constructor(address _factory, address _treasury) public
```

### initialize

```solidity
function initialize(struct IVault.Attr _data, uint16 _breakVaultBps) external
```

Initializes the vault with specific attributes and withdrawal fee.

_Can only be called once and only by the factory contract._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _data | struct IVault.Attr | Struct containing initial attributes for the vault. |
| _breakVaultBps | uint16 | The fee in basis points charged when withdrawing funds. |

### setStateUnlocked

```solidity
function setStateUnlocked() external
```

Transitions the state of the vault from 'Locked' to 'Unlocked' under specific conditions.
                this needs to be called if target is reached with non native tokens.
                this needs to be called if no tokens are received after unlock time has been reached.
                this call is not necessary if the target is reached with native tokens only.

_Can only be called when the vault is 'Locked'. The state transition depends on the target balance being met and the current time surpassing the unlock time._

### getTotalBalance

```solidity
function getTotalBalance() external view returns (uint256 totalBalance)
```

Calculates the total balance of the vault, including both native and staked tokens.
                this should not be used when the vault has a non-native base token.

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| totalBalance | uint256 | The total balance held in the vault, including staked tokens. |

### _getStakedTokenBalance

```solidity
function _getStakedTokenBalance() internal view returns (uint256 totalStakedTokenBalance)
```

### attributes

```solidity
function attributes() external view returns (struct IVault.Attr)
```

Returns the attributes of the vault.

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | struct IVault.Attr | A struct containing the vault's attributes. |

### optInForOETHRebasing

```solidity
function optInForOETHRebasing() external
```

Allows the vault to opt-in for receiving yieled from any Origin Protocol's oETH tokens held.

_This function sets the `oETHRebasingEnabled` flag to true and calls the `rebaseOptIn` method on the oETH contract.
      It can only be called once as it requires that rebasing is not already enabled.
      The function also checks that the oETH contract address is set in the treasury._

### payout

```solidity
function payout(address recipient, address payable feeRecipient, uint256 thisOwnerBalance, uint256 totalSupply) external payable returns (enum IVault.State)
```

Handles the payout process for the vault, including calculating and transferring assets to the recipient and feeRecipient, and handling different asset types (native & staked, or base token).

_This function should only be called when the vault is in the 'Unlocked' state and is only callable by the factory contract._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| recipient | address | The address of the recipient who will receive the assets from the vault. Should be the caller of the factory payout function. |
| feeRecipient | address payable | The address payable to which the fee (if any) will be paid. |
| thisOwnerBalance | uint256 | The ERC1155 token balance of the recipient. This determines the share of vault assets that will be paid. |
| totalSupply | uint256 | The total supply of ERC1155 tokens representing this vault. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | enum IVault.State | state The new state of the vault after the payout, which can either remain 'Unlocked' or change to 'Open' if it's the last payout. |

### sendToTreasury

```solidity
function sendToTreasury() external payable
```

Transfers all assets known to the treasury (native, supported, and staked tokens) from the vault to the treasury.

_Can only be called when the vault is in the 'Open' state and exclusively by the treasury contract._

### _sendToken

```solidity
function _sendToken(address tokenAddress) internal
```

_This internal function is used by sendToTreasury to transfer full balance of each individual token._

### _withdrawTokens

```solidity
function _withdrawTokens(address[] tokens, address recipient, address feeRecipient, uint256 ownerBalance, uint256 totalSupply) internal
```

_loops through array of tokens and executes the withdrawToken() function_

### _withdrawToken

```solidity
function _withdrawToken(contract IERC20 token, address recipient, address feeRecipient, uint256 ownerBalance, uint256 totalSupply) internal
```

_withdraws a share of a token balance to a recipient & sends fees_

### _getTokenBalance

```solidity
function _getTokenBalance(address tokenAddress) internal view returns (uint256)
```

_gets the vault's current balance of a non-native token_

### receive

```solidity
receive() external payable
```

Handles receiving native tokens (ETH) and potentially changes the vault's state to 'Unlocked'.

_This function is triggered when the vault receives native tokens (ETH).
      It emits a Received event and may change the state to 'Unlocked' if certain conditions are met.
      The state changes to 'Unlocked' if the vault is currently 'Locked', the base token is the native token (address(0)),
      the current block timestamp is greater than the unlock time, and the combined balance of staked tokens and native tokens
      meets or exceeds the target balance set for unlocking._

