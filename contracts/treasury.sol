// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;

import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./IVault.sol";
import "./ITreasury.sol";

interface IFactory {
    function nextTokenIdToMint() external view returns (uint256);
    function vaults(uint256 tokenId) external view returns (address);
}

/**
 * @title Treasury Contract
 * @author https://github.com/qedric
 * @dev Manages the distribution of tokens from open vaults, and maintains a list of supported and native staked tokens.
 * @notice This contract handles operations such as collecting assets from open vaults and distributing rewards to locked & unlocked vaults.
 */
contract Treasury is ITreasury, AccessControl {
    using SafeERC20 for IERC20;

    /// @notice This role can add/remove supported tokens and carry out treasury operations such as collect and distribute
    bytes32 public constant TREASURER_ROLE = keccak256("TREASURER_ROLE");

    IFactory public immutable factory;

    /// @notice         The addresses of tokens that will count toward the ETH balance
    /// @notice         This is intended to contain supported ETH Staking tokens only
    /// @notice         This is intended to contain erc20 compliant tokens only
    mapping(address => uint256) public nativeStakedTokensIndex;
    address[] private _nativeStakedTokens;

    /// @notice         The addresses of tokens that are approved to be locked in vaults
    /// @notice         This is intended to contain erc20 compliant tokens only
    mapping(address => uint256) public supportedTokensIndex;
    address[] private _supportedTokens;

    /// @notice         The address of Origin Protocol OETH token
    address payable private _oETHTokenAddress;
    address[] public openVaults;

    /// @notice Checks that the `msg.sender` is the factory.
    modifier onlyFactory() {
        require(msg.sender == address(factory), "onlyFactory");
        _;
    }

    constructor(address _factory) {
        factory = IFactory(_factory);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(TREASURER_ROLE, msg.sender);
    }

    /**
     * @notice Sets the contract address for Origin Protocol staked token.
     * @param oETHTokenAddress_ The new Origin Protocol token address.
     */
    function setOETHContractAddress(address payable oETHTokenAddress_) external onlyRole(TREASURER_ROLE) {
        emit OriginProtocolTokenUpdated(address(_oETHTokenAddress), address(oETHTokenAddress_));
        _oETHTokenAddress = oETHTokenAddress_;
    }

    /**
     * @notice Adds a token to the list of supported tokens.
     * @param token The address of the token to be added.
     */
    function addSupportedToken(address token) external onlyRole(TREASURER_ROLE) {
        require(supportedTokensIndex[token] == 0, "Address already exists");
        _supportedTokens.push(token);
        supportedTokensIndex[token] = _supportedTokens.length;
        emit SupportedTokenAdded(address(token));
    }

    /**
     * @notice Removes a token from the list of supported tokens.
     * @param token The address of the token to be removed.
     */
    function removeSupportedToken(address token) external onlyRole(TREASURER_ROLE) {
        require(supportedTokensIndex[token] != 0, "Address doesn't exist");

        uint256 indexToRemove = supportedTokensIndex[token] - 1;
        uint256 lastIndex = _supportedTokens.length - 1;

        if (indexToRemove != lastIndex) {
            address lastToken = _supportedTokens[lastIndex];
            _supportedTokens[indexToRemove] = lastToken;
            supportedTokensIndex[lastToken] = indexToRemove + 1;
        }

        _supportedTokens.pop();
        delete supportedTokensIndex[token];

        emit SupportedTokenRemoved(address(token));
    }

    /**
     * @notice Adds a native staked token address.
     * @param token The address of the native staked token to add.
     */
    function addNativeStakedToken(address token) external onlyRole(TREASURER_ROLE) {
        require(nativeStakedTokensIndex[token] == 0, "Address already exists");
        _nativeStakedTokens.push(token);
        nativeStakedTokensIndex[token] = _nativeStakedTokens.length;
        emit NativeStakedTokenAdded(address(token));
    }

    /**
     * @notice Removes a native staked token address.
     * @param token The address of the native staked token to remove.
     */
    function removeNativeStakedToken(address token) external onlyRole(TREASURER_ROLE) {
        require(nativeStakedTokensIndex[token] != 0, "Address doesn't exist");

        uint256 indexToRemove = nativeStakedTokensIndex[token] - 1;
        uint256 lastIndex = _nativeStakedTokens.length - 1;

        if (indexToRemove != lastIndex) {
            address lastToken = _nativeStakedTokens[lastIndex];
            _nativeStakedTokens[indexToRemove] = lastToken;
            nativeStakedTokensIndex[lastToken] = indexToRemove + 1;
        }

        _nativeStakedTokens.pop();
        delete nativeStakedTokensIndex[token];

        emit NativeStakedTokenRemoved(address(token));
    }

    /**
     * @notice Adds a vault to the list of open vaults.
     * @param vaultAddress The address of the vault to add.
     */
    function addOpenVault(address vaultAddress) external onlyFactory {
        require(!isOpenVault(vaultAddress), "Vault already Open");
        openVaults.push(vaultAddress);
        emit AddedOpenVault(vaultAddress);
    }

    /**
     * @notice Collects assets from all open vaults.
     */
    function collect() external onlyRole(TREASURER_ROLE) {

        require(openVaults.length > 0, "No open vaults to collect from");

        emit CollectedOpenVaults();

        for (uint256 i = 0; i < openVaults.length; i++) {
            address vaultAddress = openVaults[i];
            // Call the sendToTreasury() method on the vault
            IVault vault = IVault(vaultAddress);
            vault.sendToTreasury();
        }
    }

    /**
     * @notice Distributes native token balance to all locked vaults.
     */
    function distributeNativeTokenRewards() external onlyRole(TREASURER_ROLE) {

        require(address(this).balance > 0, 'No native tokens');

        address[] memory lockedVaults;
        uint256[] memory lockedBalances;
        uint256 totalLockedBalance;

        uint256 nRecipients = 0;

        (lockedVaults, lockedBalances, totalLockedBalance) = _lockedVaultsWithBalance(address(0));

        uint256 balanceBeforeDistribution = address(this).balance;

        // calculate & distribute each locked vault's percentage of rewards
        for (uint256 i = 0; i < lockedVaults.length; i++) {
            if (lockedVaults[i] != address(0)) {
                uint256 reward = (balanceBeforeDistribution * lockedBalances[i]) / totalLockedBalance;
                emit DistributedNativeTokensToLockedVault(lockedVaults[i], reward);
                nRecipients++;
                Address.sendValue(payable(lockedVaults[i]), reward);
                
            }
        }

        emit DistributedNativeTokensToLockedVaults(balanceBeforeDistribution, nRecipients); 
    }

    /**
     * @notice Distributes supported token balances to locked vaults holding those tokens.
     * @param supportedTokenAddress The address of the supported token to distribute.
     */
    function distributeSupportedTokenRewards(address supportedTokenAddress) external onlyRole(TREASURER_ROLE) {
        
        require(supportedTokensIndex[supportedTokenAddress] != 0 || nativeStakedTokensIndex[supportedTokenAddress] != 0, "Unsupported token");

        IERC20 token = IERC20(supportedTokenAddress);

        require(token.balanceOf(address(this)) > 0, 'No supported tokens');

        address[] memory targetVaults;
        uint256[] memory lockedBalances;
        uint256 tokenTotalBalance;
        uint256 nRecipients = 0;

        uint256 treasuryTokenBalance = token.balanceOf(address(this));

        if (treasuryTokenBalance > 0) {

            (targetVaults, lockedBalances, tokenTotalBalance) = _lockedVaultsWithBalance(supportedTokenAddress);

            if (tokenTotalBalance > 0) {
                for (uint256 i = 0; i < targetVaults.length; i++) {
                    if (targetVaults[i] != address(0)) {
                        // Calculate the proportionate share of tokens to distribute
                        uint256 proportionateShare = (treasuryTokenBalance * lockedBalances[i]) / tokenTotalBalance;
                        emit DistributedSupportedTokenToLockedVault(address(token), targetVaults[i], proportionateShare);
                        nRecipients++;
                        // Transfer tokens to the vault
                        token.safeTransfer(targetVaults[i], proportionateShare);
                    }
                }
                emit DistributedSupportedTokensToLockedVaults(address(token), treasuryTokenBalance, nRecipients);
            }
        }
    }

    function _lockedVaultsWithBalance(address supportedToken) internal view returns (
        address[] memory, uint256[] memory, uint256) {

        uint256 totalLockedBalance = 0;
        uint256 nVaults = factory.nextTokenIdToMint(); // total number of all vaults

        address[] memory lockedVaults = new address[](nVaults);
        uint256[] memory lockedBalances = new uint256[](nVaults);

        // find the total balance of all locked vaults and keep track of their individual balances
        for (uint256 tokenId = 0; tokenId < nVaults; tokenId++) {
            address vaultAddress = factory.vaults(tokenId);
            IVault vault = IVault(vaultAddress);

            if (vault.state() == IVault.State.Locked) {
                uint256 vaultBalance;
                if (address(supportedToken) == address(0)) {
                    // If it's a zero address, consider native token balance
                    vaultBalance = address(vault).balance;
                } else {
                    // If a supported token address is provided, consider the balance of that token
                    IERC20 token = IERC20(supportedToken);
                    vaultBalance = token.balanceOf(vaultAddress);
                }

                if (vaultBalance > 0) {
                    lockedVaults[tokenId] = vaultAddress;
                    lockedBalances[tokenId] = vaultBalance;
                    totalLockedBalance += vaultBalance;
                }
            }
        }

        return (lockedVaults, lockedBalances, totalLockedBalance);
    }

    /**
     * @notice Grants the Treasurer role to a specified account.
     * @dev Only an account with the DEFAULT_ADMIN_ROLE can assign the TREASURER_ROLE.
     * @param account The address of the account to be granted the Treasurer role.
     */
    function grantTreasurerRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(TREASURER_ROLE, account);
    }

    /**
     * @notice Revokes the Treasurer role from a specified account.
     * @dev Only an account with the DEFAULT_ADMIN_ROLE can revoke the TREASURER_ROLE.
     * @param account The address of the account from which the Treasurer role will be revoked.
     */
    function revokeTreasurerRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        revokeRole(TREASURER_ROLE, account);
    }

    /**
     * @notice Retrieves the list of supported tokens.
     * @return An array of addresses of the supported tokens.
     */
    function supportedTokens() external view returns (address[] memory) {
        return _supportedTokens;
    }

    /**
     * @notice Retrieves the list of native staked tokens.
     * @return An array of addresses of the native staked tokens.
     */
    function nativeStakedTokens() external view returns (address[] memory) {
        return _nativeStakedTokens;
    }

    /**
     * @notice Retrieves the address of the Origin Protocol staked token.
     * @return The address of the Origin Protocol token.
     */
    function oETHTokenAddress() external view returns (address payable) {
        return _oETHTokenAddress;
    }

    /**
     * @notice Checks if a vault is already added to the specified vault array.
     * @param vaultAddress The address of the vault to check
     * @return true if the vault is already added, false otherwise
     */
    function isOpenVault(address vaultAddress) public view returns (bool) {
        for (uint256 i = 0; i < openVaults.length; i++) {
            if (openVaults[i] == vaultAddress) {
                return true; // The vault is already added
            }
        }
        return false; // The vault is not in the array
    }

    /**
     * @notice Checks if a given token address is listed by the treasury as a native staked token.
     * @param tokenAddress The address of the token to check.
     * @return True if the token is a native staked token, false otherwise.
     */
    function isNativeStakedToken(address tokenAddress) external view returns (bool) {
        if (_nativeStakedTokens.length == 0) return false;
        uint256 index = supportedTokensIndex[tokenAddress];
        return index > 0 || _nativeStakedTokens[0] == tokenAddress;
    }

    /**
     * @notice Checks if a given token address is listed by the treasury as a supported token.
     * @param tokenAddress The address of the token to check.
     * @return True if the token is supported, false otherwise.
     */
    function isSupportedToken(address tokenAddress) external view returns (bool) {
        if (_supportedTokens.length == 0) return false;
        uint256 index = supportedTokensIndex[tokenAddress];
        return index > 0 || _supportedTokens[0] == tokenAddress;
    }

    /**
     * @notice Handles receiving native tokens (Eg Ether) directly to the contract.
     * @dev Emits a Received event indicating the sender and the amount of Ether received.
     */
    receive() external payable {
        emit Received(msg.sender, msg.value);
    }
}