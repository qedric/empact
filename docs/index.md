# Solidity API

## IGenerator

### uri

```solidity
function uri(uint256 tokenId) external view returns (string)
```

## ISignatureMint

### MintRequest

```solidity
struct MintRequest {
  address to;
  address baseToken;
  uint128 validityStartTimestamp;
  uint128 validityEndTimestamp;
  uint256 quantity;
  uint256 unlockTime;
  uint256 targetBalance;
  string name;
  string description;
}
```

### TokensMintedWithSignature

```solidity
event TokensMintedWithSignature(address signer, address mintedTo, uint256 tokenIdMinted)
```

_Emitted when tokens are minted._

### verify

```solidity
function verify(struct ISignatureMint.MintRequest req, bytes signature) external view returns (bool success, address signer)
```

@notice Verifies that a mint request is signed by an account holding
         SIGNER_ROLE (at the time of the function call).

 @param req The payload / mint request.
 @param signature The signature produced by an account signing the mint request.

 returns (success, signer) Result of verification and the recovered address.

### mintWithSignature

```solidity
function mintWithSignature(struct ISignatureMint.MintRequest req, bytes signature) external payable returns (address signer)
```

@notice Mints tokens according to the provided mint request.

 @param req The payload / mint request.
 @param signature The signature produced by an account signing the mint request.

## ITreasury

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

returns array of supported tokens

### nativeStakedTokens

```solidity
function nativeStakedTokens() external view returns (address[])
```

returns array of staked tokens that are treated as equal in value to the native token

### addOpenVault

```solidity
function addOpenVault(address vaultAddress) external
```

Add an open vault address to the treasury

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| vaultAddress | address | The address of the open vault |

### collect

```solidity
function collect() external
```

@notice Iterates through all the open vaults and calls the sendToTreasury() method on them

### distributeNativeTokenRewards

```solidity
function distributeNativeTokenRewards() external
```

@notice Distributes treasury ETH balance to all locked vaults

### distributeSupportedTokenRewards

```solidity
function distributeSupportedTokenRewards(address supportedTokenAddress) external
```

@notice Distributes supported token balances to locked vaults with balance

### oETHTokenAddress

```solidity
function oETHTokenAddress() external returns (address payable)
```

### isNativeStakedToken

```solidity
function isNativeStakedToken(address tokenAddress) external view returns (bool)
```

### isSupportedToken

```solidity
function isSupportedToken(address tokenAddress) external view returns (bool)
```

## IVault

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

### StateChanged

```solidity
event StateChanged(enum IVault.State newState)
```

### Received

```solidity
event Received(address _from, uint256 _amount)
```

### Withdrawal

```solidity
event Withdrawal(address who, uint256 amount, uint256 balance)
```

### WithdrawalFeePaid

```solidity
event WithdrawalFeePaid(address recipient, uint256 amount)
```

### TokenWithdrawal

```solidity
event TokenWithdrawal(address token, address who, uint256 amount, uint256 fee, uint256 balance)
```

### TargetReached

```solidity
event TargetReached()
```

### OptedInForOriginProtocolRebasing

```solidity
event OptedInForOriginProtocolRebasing()
```

### SendToken

```solidity
event SendToken(address tokenAddress, address recipientAddress, uint256 amount)
```

### SendNativeTokenToTreasury

```solidity
event SendNativeTokenToTreasury(address treasuryAddress, uint256 amount)
```

### initialize

```solidity
function initialize(struct IVault.Attr _data, uint16 _breakVaultBps) external
```

### state

```solidity
function state() external view returns (enum IVault.State)
```

### getTotalBalance

```solidity
function getTotalBalance() external view returns (uint256 totalBalance)
```

### payout

```solidity
function payout(address recipient, address payable feeRecipient, uint256 thisOwnerBalance, uint256 totalSupply) external payable returns (enum IVault.State)
```

### sendToTreasury

```solidity
function sendToTreasury() external payable
```

### attributes

```solidity
function attributes() external view returns (struct IVault.Attr attributes)
```

## SignatureMint

### TYPEHASH

```solidity
bytes32 TYPEHASH
```

### constructor

```solidity
constructor() internal
```

### verify

```solidity
function verify(struct ISignatureMint.MintRequest _req, bytes _signature) public view returns (bool success, address signer)
```

_Verifies that a mint request is signed by an account holding SIGNER_ROLE (at the time of the function call)._

### _canSignMintRequest

```solidity
function _canSignMintRequest(address _signer) internal view virtual returns (bool)
```

_Returns whether a given address is authorized to sign mint requests._

### _processRequest

```solidity
function _processRequest(struct ISignatureMint.MintRequest _req, bytes _signature) internal view returns (address signer)
```

_Verifies a mint request_

### _recoverAddress

```solidity
function _recoverAddress(struct ISignatureMint.MintRequest _req, bytes _signature) internal view returns (address)
```

_Returns the address of the signer of the mint request._

### _encodeRequest

```solidity
function _encodeRequest(struct ISignatureMint.MintRequest _req) internal pure returns (bytes)
```

_Resolves 'stack too deep' error in `recoverAddress`._

## Factory

### SIGNER_ROLE

```solidity
bytes32 SIGNER_ROLE
```

### VaultDeployed

```solidity
event VaultDeployed(address vault, address msgSender)
```

### FeeRecipientUpdated

```solidity
event FeeRecipientUpdated(address recipient)
```

### MakeVaultFeeUpdated

```solidity
event MakeVaultFeeUpdated(uint256 fee)
```

### BreakVaultBpsUpdated

```solidity
event BreakVaultBpsUpdated(uint16 bps)
```

### VaultImplementationUpdated

```solidity
event VaultImplementationUpdated(address implementation)
```

### GeneratorUpdated

```solidity
event GeneratorUpdated(address generator)
```

### TreasuryUpdated

```solidity
event TreasuryUpdated(address treasury)
```

### Payout

```solidity
event Payout(address vaultAddress, uint256 tokenId)
```

### nextTokenIdToMint_

```solidity
uint256 nextTokenIdToMint_
```

_The tokenId of the next NFT to mint._

### makeVaultFee

```solidity
uint256 makeVaultFee
```

The fee to create a new Vault.

### withdrawalFeeBps

```solidity
uint16 withdrawalFeeBps
```

The fee deducted with each withdrawal from a vault, in basis points

### vaultImplementation

```solidity
contract IVault vaultImplementation
```

The Vault implementation contract that is cloned for each new vault

### generator

```solidity
contract IGenerator generator
```

The contract that generates the on-chain metadata

### treasury

```solidity
contract ITreasury treasury
```

The contract that handles open vaults

### feeRecipient

```solidity
address payable feeRecipient
```

The address that receives all fees.

### totalSupply

```solidity
mapping(uint256 => uint256) totalSupply
```

@notice Returns the total supply of NFTs of a given tokenId
 @dev Mapping from tokenId => total circulating supply of NFTs of that tokenId.

### vaults

```solidity
mapping(uint256 => address) vaults
```

_Vaults are mapped to the tokenId of the NFT they are tethered to_

### tokenExists

```solidity
modifier tokenExists(uint256 tokenId)
```

checks to ensure that the token exists before referencing it

### constructor

```solidity
constructor(address payable _feeRecipient) public
```

### uri

```solidity
function uri(uint256 tokenId) public view returns (string)
```

### mintWithSignature

```solidity
function mintWithSignature(struct ISignatureMint.MintRequest _req, bytes _signature) external payable returns (address signer)
```

@notice          Lets an authorized address mint NFTs to a recipient, via signed mint request
 @dev             The logic in the `_canSignMintRequest` function determines whether the caller is authorized to mint NFTs.

 @param _req      The signed mint request.
 @param _signature  The signature of an address with the SIGNER role.

### _deployProxyByImplementation

```solidity
function _deployProxyByImplementation(struct IVault.Attr _vaultData, bytes32 _salt) internal returns (address deployedProxy)
```

_Every time a new token is minted, a Vault proxy contract is deployed to hold the vaults_

### payout

```solidity
function payout(uint256 tokenId) external
```

_If sender balance > 0 then burn sender balance and call payout function in the vault contract_

### setMakeVaultFee

```solidity
function setMakeVaultFee(uint256 fee) external
```

Sets the fee for creating a new vault

### setBreakVaultBps

```solidity
function setBreakVaultBps(uint16 bps) external
```

Sets the fee for withdrawing the vaults from a Vault - does not affect existing vaults

### setFeeRecipient

```solidity
function setFeeRecipient(address payable _feeRecipient) external
```

@notice         Updates recipient of make & break vault fees
 @param _feeRecipient   Address to be set as new recipient of primary sales.

### setVaultImplementation

```solidity
function setVaultImplementation(contract IVault _vaultImplementationAddress) external
```

@notice         Sets an implementation for the vault clones
                 ** Ensure this is called before using this contract! **

### setGenerator

```solidity
function setGenerator(contract IGenerator _generatorAddress) external
```

@notice         Sets an implementation for generator contract
                 This allows us to change the metadata and artwork of the NFTs

### setTreasury

```solidity
function setTreasury(contract ITreasury _treasuryAddress) external
```

@notice         Sets an implementation for treasury contract

### grantSignerRole

```solidity
function grantSignerRole(address account) external
```

### revokeSignerRole

```solidity
function revokeSignerRole(address account) external
```

### supportsInterface

```solidity
function supportsInterface(bytes4 interfaceId) public view virtual returns (bool)
```

### nextTokenIdToMint

```solidity
function nextTokenIdToMint() external view returns (uint256)
```

The tokenId assigned to the next new NFT to be minted.

### _canSetContractURI

```solidity
function _canSetContractURI() internal view virtual returns (bool)
```

_Returns whether contract metadata can be set in the given execution context._

### _canSignMintRequest

```solidity
function _canSignMintRequest(address _signer) internal view virtual returns (bool)
```

_Returns whether a given address is authorized to sign mint requests._

### _beforeTokenTransfer

```solidity
function _beforeTokenTransfer(address operator, address from, address to, uint256[] ids, uint256[] amounts, bytes data) internal virtual
```

_Runs before every token transfer / mint / burn._

### _collectMakeVaultFee

```solidity
function _collectMakeVaultFee() internal virtual
```

_Collects and distributes the primary sale value of NFTs being claimed._

## MockSignatureMint

### TYPEHASH

```solidity
bytes32 TYPEHASH
```

### constructor

```solidity
constructor() internal
```

### verify

```solidity
function verify(struct ISignatureMint.MintRequest _req, bytes _signature) public view returns (bool success, address signer)
```

_Verifies that a mint request is signed by an account holding SIGNER_ROLE (at the time of the function call)._

### _canSignMintRequest

```solidity
function _canSignMintRequest(address _signer) internal view virtual returns (bool)
```

_Returns whether a given address is authorized to sign mint requests._

### _processRequest

```solidity
function _processRequest(struct ISignatureMint.MintRequest _req, bytes _signature) internal view returns (address signer)
```

_Verifies a mint request_

### _recoverAddress

```solidity
function _recoverAddress(struct ISignatureMint.MintRequest _req, bytes _signature) internal view returns (address)
```

_Returns the address of the signer of the mint request._

### _encodeRequest

```solidity
function _encodeRequest(struct ISignatureMint.MintRequest _req) internal pure returns (bytes)
```

_Resolves 'stack too deep' error in `recoverAddress`._

## MockFactory

### SIGNER_ROLE

```solidity
bytes32 SIGNER_ROLE
```

### VaultDeployed

```solidity
event VaultDeployed(address vault, address msgSender)
```

### FeeRecipientUpdated

```solidity
event FeeRecipientUpdated(address recipient)
```

### MakeVaultFeeUpdated

```solidity
event MakeVaultFeeUpdated(uint256 fee)
```

### BreakVaultBpsUpdated

```solidity
event BreakVaultBpsUpdated(uint16 bps)
```

### VaultImplementationUpdated

```solidity
event VaultImplementationUpdated(address implementation)
```

### GeneratorUpdated

```solidity
event GeneratorUpdated(address generator)
```

### TreasuryUpdated

```solidity
event TreasuryUpdated(address treasury)
```

### Payout

```solidity
event Payout(address vaultAddress, uint256 tokenId)
```

### TokenUrlPrefixUpdated

```solidity
event TokenUrlPrefixUpdated(string oldPrefix, string newPrefix)
```

### nextTokenIdToMint_

```solidity
uint256 nextTokenIdToMint_
```

_The tokenId of the next NFT to mint._

### makeVaultFee

```solidity
uint256 makeVaultFee
```

The fee to create a new Vault.

### withdrawalFeeBps

```solidity
uint16 withdrawalFeeBps
```

The fee deducted with each withdrawal from a vault, in basis points

### vaultImplementation

```solidity
contract IVault vaultImplementation
```

The Vault implementation contract that is cloned for each new vault

### generator

```solidity
contract IGenerator generator
```

The contract that generates the on-chain metadata

### treasury

```solidity
contract ITreasury treasury
```

The contract that handles open vaults

### feeRecipient

```solidity
address payable feeRecipient
```

The address that receives all fees.

### totalSupply

```solidity
mapping(uint256 => uint256) totalSupply
```

@notice Returns the total supply of NFTs of a given tokenId
 @dev Mapping from tokenId => total circulating supply of NFTs of that tokenId.

### vaults

```solidity
mapping(uint256 => address) vaults
```

_Vaults are mapped to the tokenId of the NFT they are tethered to_

### tokenExists

```solidity
modifier tokenExists(uint256 tokenId)
```

checks to ensure that the token exists before referencing it

### constructor

```solidity
constructor(address payable _feeRecipient) public
```

### uri

```solidity
function uri(uint256 tokenId) public view returns (string)
```

### mintWithSignature

```solidity
function mintWithSignature(struct ISignatureMint.MintRequest _req, bytes _signature) external payable returns (address signer)
```

@notice          Lets an authorized address mint NFTs to a recipient, via signed mint request
 @dev             The logic in the `_canSignMintRequest` function determines whether the caller is authorized to mint NFTs.

 @param _req      The signed mint request.
 @param _signature  The signature of an address with the SIGNER role.

### _deployProxyByImplementation

```solidity
function _deployProxyByImplementation(struct IVault.Attr _vaultData, bytes32 _salt) internal returns (address deployedProxy)
```

_Every time a new token is minted, a Vault proxy contract is deployed to hold the vaults_

### payout

```solidity
function payout(uint256 tokenId) external
```

_If sender balance > 0 then burn sender balance and call payout function in the vault contract_

### fake_payout

```solidity
function fake_payout(uint256 tokenId, address real_vault) external
```

_If sender balance > 0 then burn sender balance and call payout function in the vault contract_

### setMakeVaultFee

```solidity
function setMakeVaultFee(uint256 fee) external
```

Sets the fee for creating a new vault

### setBreakVaultBps

```solidity
function setBreakVaultBps(uint16 bps) external
```

Sets the fee for withdrawing the vaults from a Vault - does not affect existing vaults

### setFeeRecipient

```solidity
function setFeeRecipient(address payable _feeRecipient) external
```

@notice         Updates recipient of make & break vault fees
 @param _feeRecipient   Address to be set as new recipient of primary sales.

### setVaultImplementation

```solidity
function setVaultImplementation(contract IVault _vaultImplementationAddress) external
```

@notice         Sets an implementation for the vault clones
                 ** Ensure this is called before using this contract! **

### setGenerator

```solidity
function setGenerator(contract IGenerator _generatorAddress) external
```

@notice         Sets an implementation for generator contract
                 This allows us to change the metadata and artwork of the NFTs

### setTreasury

```solidity
function setTreasury(contract ITreasury _treasuryAddress) external
```

@notice         Sets an implementation for treasury contract

### grantSignerRole

```solidity
function grantSignerRole(address account) external
```

### revokeSignerRole

```solidity
function revokeSignerRole(address account) external
```

### supportsInterface

```solidity
function supportsInterface(bytes4 interfaceId) public view virtual returns (bool)
```

### nextTokenIdToMint

```solidity
function nextTokenIdToMint() public view virtual returns (uint256)
```

The tokenId assigned to the next new NFT to be minted.

### _getPercent

```solidity
function _getPercent(uint256 tokenId) internal view returns (uint256 percentage)
```

_calculates the percentage towards unlock based on time and target balance_

### _canSetContractURI

```solidity
function _canSetContractURI() internal view virtual returns (bool)
```

_Returns whether contract metadata can be set in the given execution context._

### _canSignMintRequest

```solidity
function _canSignMintRequest(address _signer) internal view virtual returns (bool)
```

_Returns whether a given address is authorized to sign mint requests._

### _beforeTokenTransfer

```solidity
function _beforeTokenTransfer(address operator, address from, address to, uint256[] ids, uint256[] amounts, bytes data) internal virtual
```

_Runs before every token transfer / mint / burn._

### _collectMakeVaultFee

```solidity
function _collectMakeVaultFee() internal virtual
```

_Collects and distributes the primary sale value of NFTs being claimed._

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

@notice The treasury distributes from open vaults to locked vaults, and keeps track of all supported tokens

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

@notice         Set the contract address for Origin Protocol staked token

### addSupportedToken

```solidity
function addSupportedToken(address token) external
```

@notice         Add a supported token address

### removeSupportedToken

```solidity
function removeSupportedToken(address token) external
```

@notice         Remove a supported token address

### addNativeStakedToken

```solidity
function addNativeStakedToken(address token) external
```

@notice         Add a native staked token address

### removeNativeStakedToken

```solidity
function removeNativeStakedToken(address token) external
```

@notice         Remove a native staked token address

### addOpenVault

```solidity
function addOpenVault(address vaultAddress) external
```

@notice         Moves a vault from the lockedVaults to the openVaults treasurey register

### collect

```solidity
function collect() external
```

@notice         Iterates through all the vaults and calls the sendToTreasury() method on them

### distributeNativeTokenRewards

```solidity
function distributeNativeTokenRewards() external
```

Distributes treasury native token balance to all locked vaults

### distributeSupportedTokenRewards

```solidity
function distributeSupportedTokenRewards(address supportedTokenAddress) external
```

Distributes supported token balances to locked vaults having balance of that token

### _lockedVaultsWithBalance

```solidity
function _lockedVaultsWithBalance(address supportedToken) internal view returns (address[], uint256[], uint256)
```

### grantTreasurerRole

```solidity
function grantTreasurerRole(address account) external
```

### revokeTreasurerRole

```solidity
function revokeTreasurerRole(address account) external
```

### supportedTokens

```solidity
function supportedTokens() external view returns (address[])
```

returns array of supported tokens

### nativeStakedTokens

```solidity
function nativeStakedTokens() external view returns (address[])
```

returns array of staked tokens that are treated as equal in value to the native token

### oETHTokenAddress

```solidity
function oETHTokenAddress() external view returns (address payable)
```

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

### isSupportedToken

```solidity
function isSupportedToken(address tokenAddress) external view returns (bool)
```

### receive

```solidity
receive() external payable
```

## IExtendedERC20

### name

```solidity
function name() external view returns (string)
```

### symbol

```solidity
function symbol() external view returns (string)
```

## IFactory

### vaults

```solidity
function vaults(uint256 tokenId) external view returns (address)
```

## Generator

### factory

```solidity
contract IFactory factory
```

### _chainSymbol

```solidity
string _chainSymbol
```

### TokenUrlPrefixUpdated

```solidity
event TokenUrlPrefixUpdated(string oldPrefix, string newPrefix)
```

### constructor

```solidity
constructor(string chainSymbol, string tokenUrlPrefix, address _factory) public
```

### uri

```solidity
function uri(uint256 tokenId) external view returns (string)
```

### _generateAttributes

```solidity
function _generateAttributes(struct IVault.Attr attributes, address receiveAddress, uint256 percent, uint256 balance) internal view returns (string)
```

### _generateSVG

```solidity
function _generateSVG(uint256 percent) internal pure returns (bytes)
```

### _generatePaths

```solidity
function _generatePaths(uint256 percentage) internal pure returns (string pathsString)
```

### _getBalance

```solidity
function _getBalance(contract IVault vault) internal view returns (uint256)
```

### _getPercent

```solidity
function _getPercent(contract IVault vault, uint256 balance) internal view returns (uint256 percentage)
```

_calculates the percentage towards unlock based on time and target balance_

### setTokenUrlPrefix

```solidity
function setTokenUrlPrefix(string tokenUrlPrefix) external
```

this will display in NFT metadata

### _uint2str

```solidity
function _uint2str(uint256 _i) internal pure returns (string _uintAsString)
```

### _toAsciiString

```solidity
function _toAsciiString(address x) internal pure returns (string)
```

### _char

```solidity
function _char(bytes1 b) internal pure returns (bytes1 c)
```

### _convertWeiToEthString

```solidity
function _convertWeiToEthString(uint256 weiValue) internal pure returns (string)
```

### _insertCharAtIndex

```solidity
function _insertCharAtIndex(string str, uint256 index, bytes1 newChar) internal pure returns (string)
```

## MockToken

### constructor

```solidity
constructor(string name_, string symbol_) public
```

## MockOETHToken

### constructor

```solidity
constructor(string name_, string symbol_) public
```

### rebaseOptIn

```solidity
function rebaseOptIn() public
```

