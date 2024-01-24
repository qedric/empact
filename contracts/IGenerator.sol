// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;

import "./IVault.sol";

interface IGenerator {
	function uri(string memory tokenUrl, uint256 tokenId, address vaultAddress) external view returns (string memory);
}