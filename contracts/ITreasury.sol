// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;

/**
 * @title Treasury Interface
 * @author https://github.com/qedric
 * @notice Interface for the Treasury contract handling operations such as collecting assets and distributing rewards.
 */
interface ITreasury {

    // Events
    event SupportedTokenAdded(address tokenAddress);
    event SupportedTokenRemoved(address tokenAddress);
    event NativeStakedTokenAdded(address tokenAddress);
    event NativeStakedTokenRemoved(address tokenAddress);
    event AddedOpenVault(address vaultAddress);
    event CollectedOpenVaults();
    event DistributedNativeTokensToLockedVault(address indexed vaultAddress, uint amount);
    event DistributedNativeTokensToLockedVaults(uint balanceBeforeDistribution, uint numberOfRecipients);
    event DistributedSupportedTokenToLockedVault(address indexed supportedToken, address indexed vaultAddress, uint amount);
    event DistributedSupportedTokensToLockedVaults(address indexed supportedToken, uint balanceBeforeDistribution, uint numberOfRecipients);
    event OriginProtocolTokenUpdated(address oldAddress, address newAddress);
    event Received(address _from, uint _amount);

    // Functions

     /**
     * @notice Retrieves the list of supported tokens.
     * @return An array of addresses of the supported tokens.
     */
    function supportedTokens() external view returns (address[] memory);

    /**
     * @notice Retrieves the list of native staked tokens.
     * @return An array of addresses of the native staked tokens.
     */
    function nativeStakedTokens() external view returns (address[] memory);

    /**
     * @notice Adds a new open vault address to the treasury.
     * @param vaultAddress The address of the vault to be added.
     */
    function addOpenVault(address vaultAddress) external;
    
	/**
     * @notice Collects assets from all open vaults.
     * @dev Iterates through all the open vaults and calls their 'send to treasury' method.
     */
	function collect() external;

	/**
     * @notice Distributes the native token (ETH) rewards to all locked vaults.
     */
	function distributeNativeTokenRewards() external;

    /**
     * @notice Distributes supported tokens to locked & unlocked vaults.
     * @param supportedTokenAddress The address of the supported token to distribute.
     */
    function distributeSupportedTokenRewards(address supportedTokenAddress) external;

    /**
     * @notice Gets the address of the Origin Protocol staked token (oETH).
     * @return The payable address of the oETH token.
     */
    function oETHTokenAddress() external returns(address payable);

    /**
     * @notice Checks if a given token is listed by the treasury as a native staked token.
     * @param tokenAddress The address of the token to check.
     * @return True if the token is a native staked token, false otherwise.
     */
    function isNativeStakedToken(address tokenAddress) external view returns (bool);

    /**
     * @notice Checks if a given token is a listed by the treasury as a supported token.
     * @param tokenAddress The address of the token to check.
     * @return True if the token is supported, false otherwise.
     */
    function isSupportedToken(address tokenAddress) external view returns (bool);
}