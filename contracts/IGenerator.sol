// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;

import "./IFund.sol";

interface IGenerator {
	function uri(IFund.Attr calldata attributes, address fundAddress, uint256 percent, uint256 balance, string memory tokenUrl, uint256 tokenId) external view returns (string memory);
}