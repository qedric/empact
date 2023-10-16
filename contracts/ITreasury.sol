// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;

interface ITreasury {

    event SupportedTokenAdded(address tokenAddress);
    event SupportedTokenRemoved(address tokenAddress);
    event LockedFundAdded(address fundAddress);
    event MovedToOpenFund(address fundAddress);
    event CollectedOpenFunds();
    event DistributedOpenFundsToLockedFunds();
    event OriginProtocolTokenUpdated(address oldAddress, address newAddress);

    /**
     * @notice Add a locked fund bank address to the treasury
     * @param fundAddress The address of the locked fund bank
     */
    function supportedTokens() external view returns (address[] memory);

    /**
     * @notice Add a locked fund bank address to the treasury
     * @param fundAddress The address of the locked fund bank
     */
    function addLockedFund(address fundAddress) external;

    /**
     * @notice Add an open fund bank address to the treasury
     * @param fundAddress The address of the open fund bank
     */
    function moveToOpenFund(address fundAddress) external;

    /**
     * @notice Remove a locked fund address from the treasury
     * @param fundAddress The address of the locked fund to be removed
     */
    function _removeLockedFund(address fundAddress) internal;
    
	/**
     *  @notice Iterates through all the open funds and calls the sendToTreasury() method on them
     */
	function collect() external payable;

	/**
     *  @notice Distributes treasury balance of given token to all locked funds
     *
     *  @param tokenId the supported token to distribute. Use 0 for native token
     */
	function distribute(uint256 tokenId) external payable;
}