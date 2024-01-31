# Solidity API

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

