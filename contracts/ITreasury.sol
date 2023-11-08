// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;

interface ITreasury {

    event SupportedTokenAdded(address tokenAddress);
    event SupportedTokenRemoved(address tokenAddress);
    event AddedOpenFund(address fundAddress);
    event CollectedOpenFunds();
    event DistributedNativeTokensToLockedFund(address indexed fundAddress, uint amount);
    event DistributedNativeTokensToLockedFunds(uint balanceBeforeDistribution, uint numberOfRecipients);
    event DistributedSupportedTokenToLockedFund(address indexed supportedToken, address indexed fundAddress, uint amount);
    event DistributedSupportedTokensToLockedFunds(address indexed supportedToken, uint balanceBeforeDistribution, uint numberOfRecipients);
    event OriginProtocolTokenUpdated(address oldAddress, address newAddress);
    event Received(address _from, uint _amount);

    /**
     * @notice returns array of supported tokens
     */
    function supportedTokens() external view returns (address[] memory);

    /**
     * @notice Add an open fund bank address to the treasury
     * @param fundAddress The address of the open fund bank
     */
    function addOpenFund(address fundAddress) external;
    
	/**
     *  @notice Iterates through all the open funds and calls the sendToTreasury() method on them
     */
	function collect() external;

	/**
     *  @notice Distributes treasury ETH balance to all locked funds
     */
	function distributeNativeTokenRewards() external;

    /**
     *  @notice Distributes supported token balances to locked funds with balance
     */
    function distributeSupportedTokenRewards(address supportedTokenAddress) external;

    function oETHTokenAddress() external returns(address payable);
}