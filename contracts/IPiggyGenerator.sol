// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;

import "./IPiggyBank.sol";

interface IPiggyGenerator {
	function uri(IPiggyBank.Attr calldata attributes, address piggyAddress, uint256 percent, uint256 balance, string memory tokenUrl, uint256 tokenId) external view returns (string memory);
}