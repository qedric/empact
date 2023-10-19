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
     * @notice returns array of supported tokens
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
     *  @notice Iterates through all the open funds and calls the sendToTreasury() method on them
     */
	function collect() external;

	/**
     *  @notice Distributes treasury balance to locked funds
     */
	function distribute() external;

    function oETHTokenAddress() external returns(address payable);
}