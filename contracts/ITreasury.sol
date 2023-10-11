// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;

interface ITreasury {

	/**
     *  @notice Iterates through all the funds and calls the sendToTreasury() method on them
     */
	function collect() external payable;

	/**
     *  @notice Distributes treasury balance to all locked funds
     *
     *  @param tokenId the supported token to distribute. Use 0 for native token
     */
	function distribute(uint256 tokenId) external payable;
}