# Solidity API

## ITreasury

Interface for the Treasury contract handling operations such as collecting assets and distributing rewards.

### SupportedTokenAdded

```solidity
event SupportedTokenAdded(address tokenAddress)
```

### SupportedTokenRemoved

```solidity
event SupportedTokenRemoved(address tokenAddress)
```

### NativeStakedTokenAdded

```solidity
event NativeStakedTokenAdded(address tokenAddress)
```

### NativeStakedTokenRemoved

```solidity
event NativeStakedTokenRemoved(address tokenAddress)
```

### AddedOpenVault

```solidity
event AddedOpenVault(address vaultAddress)
```

### CollectedOpenVaults

```solidity
event CollectedOpenVaults()
```

### DistributedNativeTokensToLockedVault

```solidity
event DistributedNativeTokensToLockedVault(address vaultAddress, uint256 amount)
```

### DistributedNativeTokensToLockedVaults

```solidity
event DistributedNativeTokensToLockedVaults(uint256 balanceBeforeDistribution, uint256 numberOfRecipients)
```

### DistributedSupportedTokenToLockedVault

```solidity
event DistributedSupportedTokenToLockedVault(address supportedToken, address vaultAddress, uint256 amount)
```

### DistributedSupportedTokensToLockedVaults

```solidity
event DistributedSupportedTokensToLockedVaults(address supportedToken, uint256 balanceBeforeDistribution, uint256 numberOfRecipients)
```

### OriginProtocolTokenUpdated

```solidity
event OriginProtocolTokenUpdated(address oldAddress, address newAddress)
```

### Received

```solidity
event Received(address _from, uint256 _amount)
```

### supportedTokens

```solidity
function supportedTokens() external view returns (address[])
```

Retrieves the list of supported tokens.

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address[] | An array of addresses of the supported tokens. |

### nativeStakedTokens

```solidity
function nativeStakedTokens() external view returns (address[])
```

Retrieves the list of native staked tokens.

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address[] | An array of addresses of the native staked tokens. |

### addOpenVault

```solidity
function addOpenVault(address vaultAddress) external
```

Adds a new open vault address to the treasury.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vaultAddress | address | The address of the vault to be added. |

### collect

```solidity
function collect() external
```

Collects assets from all open vaults.

_Iterates through all the open vaults and calls their 'send to treasury' method._

### distributeNativeTokenRewards

```solidity
function distributeNativeTokenRewards() external
```

Distributes the native token (ETH) rewards to all locked vaults.

### distributeSupportedTokenRewards

```solidity
function distributeSupportedTokenRewards(address supportedTokenAddress) external
```

Distributes supported tokens to locked & unlocked vaults.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| supportedTokenAddress | address | The address of the supported token to distribute. |

### oETHTokenAddress

```solidity
function oETHTokenAddress() external returns (address payable)
```

Gets the address of the Origin Protocol staked token (oETH).

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address payable | The payable address of the oETH token. |

### isNativeStakedToken

```solidity
function isNativeStakedToken(address tokenAddress) external view returns (bool)
```

Checks if a given token is listed by the treasury as a native staked token.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenAddress | address | The address of the token to check. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the token is a native staked token, false otherwise. |

### isSupportedToken

```solidity
function isSupportedToken(address tokenAddress) external view returns (bool)
```

Checks if a given token is a listed by the treasury as a supported token.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenAddress | address | The address of the token to check. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the token is supported, false otherwise. |

