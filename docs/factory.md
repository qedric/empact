# Solidity API

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

This contract handles the creation, management, and interaction with individual vaults, and is compliant with ERC1155 standards.

_The contract inherits from ERC1155, ContractMetadata, SignatureMint, and AccessControl._

### SIGNER_ROLE

```solidity
bytes32 SIGNER_ROLE
```

### VaultDeployed

```solidity
event VaultDeployed(address vault, address msgSender)
```

Emitted when a new vault is deployed

### FeeRecipientUpdated

```solidity
event FeeRecipientUpdated(address recipient)
```

Emitted when the fee recipient is updated

### MakeVaultFeeUpdated

```solidity
event MakeVaultFeeUpdated(uint256 fee)
```

Emitted when the fee for vault creation is updated

### BreakVaultBpsUpdated

```solidity
event BreakVaultBpsUpdated(uint16 bps)
```

Emitted when the fee for vault withdrawal is updated

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

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _feeRecipient | address payable | The address that will receive fees collected by the contract |

### uri

```solidity
function uri(uint256 tokenId) public view returns (string)
```

### mintWithSignature

```solidity
function mintWithSignature(struct ISignatureMint.MintRequest _req, bytes _signature) external payable returns (address signer)
```

Mints new tokens with a signature from an authorized signer, and creates an associated vault

_Minting logic includes creating a new erc1155 token, and deploying a new vault_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _req | struct ISignatureMint.MintRequest | The signed mint request data |
| _signature | bytes | The signature of an address with the SIGNER role |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| signer | address | The address of the signer who authorized the mint |

### _deployProxyByImplementation

```solidity
function _deployProxyByImplementation(struct IVault.Attr _vaultData, bytes32 _salt) internal returns (address deployedProxy)
```

_Every time a new token is minted, a Vault proxy contract is deployed to hold the vaults_

### payout

```solidity
function payout(uint256 tokenId) external
```

Executes the payout process for a given token ID, 
         burning the sender's token balance and calling the payout function in the associated vault contract.

_This function first checks the caller's balance of the specified token ID. 
        If the balance is greater than zero, it burns the tokens to prevent double claiming. 
        It then calls the `payout` function of the corresponding vault contract. 
        If the vault's state changes to 'Open', it updates the treasury contract._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenId | uint256 | The ID of the token for which the payout is being processed. |

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

Grants the SIGNER role to a specified account.

_Only an account with the DEFAULT_ADMIN_ROLE can assign the SIGNER_ROLE._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | The address of the account to be granted the SIGNER_ROLE. |

### revokeSignerRole

```solidity
function revokeSignerRole(address account) external
```

Revokes the SIGNER_ROLE from a specified account.

_Only an account with the DEFAULT_ADMIN_ROLE can revoke the SIGNER_ROLE._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | The address of the account from which the SIGNER_ROLE will be revoked. |

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

