# Solidity API

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

