# Solidity API

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

this returns the dynamic metadata for the erc1155 token

_this should be called by the overriden erc1155 uri function in the factory contract_

### setTokenUrlPrefix

```solidity
function setTokenUrlPrefix(string tokenUrlPrefix) external
```

this will display in NFT metadata

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

