// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;

import "./IVault.sol";

interface IGenerator {
	function uri(uint256 tokenId) external view returns (string memory);
}