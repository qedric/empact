# Solidity API

## IFactory

### nextTokenIdToMint

```solidity
function nextTokenIdToMint() external view returns (uint256)
```

### vaults

```solidity
function vaults(uint256 tokenId) external view returns (address)
```

## Treasury

This contract handles operations such as collecting assets from open vaults and distributing rewards to locked & unlocked vaults.

_Manages the distribution of tokens from open vaults, and maintains a list of supported and native staked tokens._

### TREASURER_ROLE

```solidity
bytes32 TREASURER_ROLE
```

This role can add/remove supported tokens and carry out treasury operations such as collect and distribute

### factory

```solidity
contract IFactory factory
```

### nativeStakedTokensIndex

```solidity
mapping(address => uint256) nativeStakedTokensIndex
```

The addresses of tokens that will count toward the ETH balance
        This is intended to contain supported ETH Staking tokens only
        This is intended to contain erc20 compliant tokens only

### supportedTokensIndex

```solidity
mapping(address => uint256) supportedTokensIndex
```

The addresses of tokens that are approved to be locked in vaults
        This is intended to contain erc20 compliant tokens only

### openVaults

```solidity
address[] openVaults
```

### onlyFactory

```solidity
modifier onlyFactory()
```

Checks that the `msg.sender` is the factory.

### constructor

```solidity
constructor(address _factory) public
```

### setOETHContractAddress

```solidity
function setOETHContractAddress(address payable oETHTokenAddress_) external
```

Sets the contract address for Origin Protocol staked token.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| oETHTokenAddress_ | address payable | The new Origin Protocol token address. |

### addSupportedToken

```solidity
function addSupportedToken(address token) external
```

Adds a token to the list of supported tokens.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| token | address | The address of the token to be added. |

### removeSupportedToken

```solidity
function removeSupportedToken(address token) external
```

Removes a token from the list of supported tokens.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| token | address | The address of the token to be removed. |

### addNativeStakedToken

```solidity
function addNativeStakedToken(address token) external
```

Adds a native staked token address.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| token | address | The address of the native staked token to add. |

### removeNativeStakedToken

```solidity
function removeNativeStakedToken(address token) external
```

Removes a native staked token address.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| token | address | The address of the native staked token to remove. |

### addOpenVault

```solidity
function addOpenVault(address vaultAddress) external
```

Adds a vault to the list of open vaults.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vaultAddress | address | The address of the vault to add. |

### collect

```solidity
function collect() external
```

Collects assets from all open vaults.

### distributeNativeTokenRewards

```solidity
function distributeNativeTokenRewards() external
```

Distributes native token balance to all locked vaults.

### distributeSupportedTokenRewards

```solidity
function distributeSupportedTokenRewards(address supportedTokenAddress) external
```

Distributes supported token balances to locked vaults holding those tokens.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| supportedTokenAddress | address | The address of the supported token to distribute. |

### _lockedVaultsWithBalance

```solidity
function _lockedVaultsWithBalance(address supportedToken) internal view returns (address[], uint256[], uint256)
```

### grantTreasurerRole

```solidity
function grantTreasurerRole(address account) external
```

Grants the Treasurer role to a specified account.

_Only an account with the DEFAULT_ADMIN_ROLE can assign the TREASURER_ROLE._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | The address of the account to be granted the Treasurer role. |

### revokeTreasurerRole

```solidity
function revokeTreasurerRole(address account) external
```

Revokes the Treasurer role from a specified account.

_Only an account with the DEFAULT_ADMIN_ROLE can revoke the TREASURER_ROLE._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | The address of the account from which the Treasurer role will be revoked. |

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

### oETHTokenAddress

```solidity
function oETHTokenAddress() external view returns (address payable)
```

Retrieves the address of the Origin Protocol staked token.

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address payable | The address of the Origin Protocol token. |

### isOpenVault

```solidity
function isOpenVault(address vaultAddress) public view returns (bool)
```

Checks if a vault is already added to the specified vault array.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vaultAddress | address | The address of the vault to check |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | true if the vault is already added, false otherwise |

### isNativeStakedToken

```solidity
function isNativeStakedToken(address tokenAddress) external view returns (bool)
```

Checks if a given token address is listed by the treasury as a native staked token.

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

Checks if a given token address is listed by the treasury as a supported token.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenAddress | address | The address of the token to check. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the token is supported, false otherwise. |

### receive

```solidity
receive() external payable
```

Handles receiving native tokens (Eg Ether) directly to the contract.

_Emits a Received event indicating the sender and the amount of Ether received._

