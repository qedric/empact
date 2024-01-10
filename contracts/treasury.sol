// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;

import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./IFund.sol";
import "./ITreasury.sol";

interface IFactory {
    function nextTokenIdToMint() external view returns (uint256);
    function vaults(uint256 tokenId) external view returns (address);
}

/**
 *  @notice The treasury distributes from open vaults to locked vaults, and keeps track of all supported tokens
 */
contract Treasury is ITreasury, AccessControl {
    using SafeERC20 for IERC20;

    /// @notice This role can add/remove supported tokens and carry out treasury operations such as collect and distribute
    bytes32 public constant TREASURER_ROLE = keccak256("TREASURER_ROLE");

    IFactory public immutable factory;

    /// @notice         The addresses of tokens that will count toward the ETH balance
    /// @notice         This is intended to contain supported ETH Staking tokens only.
    mapping(address => uint256) public supportedTokensIndex;
    address[] private _supportedTokens;

    /// @notice         The address of Origin Protocol OETH token
    address payable private _oETHTokenAddress;
    address[] public openFunds;

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
     *  @notice         Set the contract address for Origin Protocol staked token
     */
    function setOETHContractAddress(address payable oETHTokenAddress_) external onlyRole(TREASURER_ROLE) {
        emit OriginProtocolTokenUpdated(address(_oETHTokenAddress), address(oETHTokenAddress_));
        _oETHTokenAddress = oETHTokenAddress_;
    }

    /**
     *  @notice         Add a supported token address
     */
    function addSupportedToken(address token) external onlyRole(TREASURER_ROLE) {
        require(supportedTokensIndex[token] == 0, "Address already exists");
        _supportedTokens.push(token);
        supportedTokensIndex[token] = _supportedTokens.length;
        emit SupportedTokenAdded(address(token));
    }

    /**
     *  @notice         Remove a supported token address
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
     *  @notice         Moves a vault from the lockedFunds to the openFunds treasurey register
     */
    function addOpenFund(address vaultAddress) external onlyFactory {
        require(!isOpenFund(vaultAddress), "Fund already Open");
        openFunds.push(vaultAddress);
        emit AddedOpenFund(vaultAddress);
    }

    /**
     *  @notice         Iterates through all the vaults and calls the sendToTreasury() method on them
     */
    function collect() external onlyRole(TREASURER_ROLE) {

        require(openFunds.length > 0, "No open vaults to collect from");

        emit CollectedOpenFunds();

        for (uint256 i = 0; i < openFunds.length; i++) {
            address vaultAddress = openFunds[i];
            // Call the sendToTreasury() method on the vault
            IFund vault = IFund(vaultAddress);
            vault.sendToTreasury();
        }
    }

    /**
     * @notice          Distributes treasury native token balance to all locked vaults
     */
    function distributeNativeTokenRewards() external onlyRole(TREASURER_ROLE) {

        require(address(this).balance > 0, 'No native tokens');

        address[] memory lockedFunds;
        uint256[] memory lockedBalances;
        uint256 totalLockedBalance;

        uint256 nRecipients = 0;

        (lockedFunds, lockedBalances, totalLockedBalance) = _lockedFundsWithBalance(address(0));

        uint256 balanceBeforeDistribution = address(this).balance;

        // calculate & distribute each locked vault's percentage of rewards
        for (uint256 i = 0; i < lockedFunds.length; i++) {
            if (lockedFunds[i] != address(0)) {
                uint256 reward = (balanceBeforeDistribution * lockedBalances[i]) / totalLockedBalance;
                emit DistributedNativeTokensToLockedFund(lockedFunds[i], reward);
                nRecipients++;
                Address.sendValue(payable(lockedFunds[i]), reward);
                
            }
        }

        emit DistributedNativeTokensToLockedFunds(balanceBeforeDistribution, nRecipients);
        
    }

    /**
     * @notice  Distributes supported token balances to locked vaults having balance of that token
     */
    function distributeSupportedTokenRewards(address supportedTokenAddress) external onlyRole(TREASURER_ROLE) {
        
        require(_isSupportedToken(supportedTokenAddress), 'Unsupported token');

        IERC20 token = IERC20(supportedTokenAddress);

        require(token.balanceOf(address(this)) > 0, 'No supported tokens');

        address[] memory targetFunds;
        uint256[] memory lockedBalances;
        uint256 tokenTotalBalance;
        uint256 nRecipients = 0;

        uint256 treasuryTokenBalance = token.balanceOf(address(this));

        if (treasuryTokenBalance > 0) {

            (targetFunds, lockedBalances, tokenTotalBalance) = _lockedFundsWithBalance(supportedTokenAddress);

            if (tokenTotalBalance > 0) {
                for (uint256 i = 0; i < targetFunds.length; i++) {
                    if (targetFunds[i] != address(0)) {
                        // Calculate the proportionate share of tokens to distribute
                        uint256 proportionateShare = (treasuryTokenBalance * lockedBalances[i]) / tokenTotalBalance;
                        emit DistributedSupportedTokenToLockedFund(address(token), targetFunds[i], proportionateShare);
                        nRecipients++;
                        // Transfer tokens to the vault
                        token.safeTransfer(targetFunds[i], proportionateShare);
                    }
                }
                emit DistributedSupportedTokensToLockedFunds(address(token), treasuryTokenBalance, nRecipients);
            }
        }
    }

    function _lockedFundsWithBalance(address supportedToken) internal view returns (
        address[] memory, uint256[] memory, uint256) {

        uint256 totalLockedBalance = 0;
        uint256 nFunds = factory.nextTokenIdToMint(); // total number of all vaults

        address[] memory lockedFunds = new address[](nFunds);
        uint256[] memory lockedBalances = new uint256[](nFunds);

        // find the total balance of all locked vaults and keep track of their individual balances
        for (uint256 tokenId = 0; tokenId < nFunds; tokenId++) {
            address vaultAddress = factory.vaults(tokenId);
            IFund vault = IFund(vaultAddress);

            if (vault.state() == IFund.State.Locked) {
                uint256 vaultBalance;
                if (address(supportedToken) == address(0)) {
                    // If it's a zero address, consider native token balance
                    vaultBalance = vault.getNativeTokenBalance();
                } else {
                    // If a supported token address is provided, consider the balance of that token
                    IERC20 token = IERC20(supportedToken);
                    vaultBalance = token.balanceOf(vaultAddress);
                }

                if (vaultBalance > 0) {
                    lockedFunds[tokenId] = vaultAddress;
                    lockedBalances[tokenId] = vaultBalance;
                    totalLockedBalance += vaultBalance;
                }
            }
        }

        return (lockedFunds, lockedBalances, totalLockedBalance);
    }

    function grantTreasurerRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(TREASURER_ROLE, account);
    }

    function revokeTreasurerRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        revokeRole(TREASURER_ROLE, account);
    }

    function supportedTokens() external view returns (address[] memory) {
        return _supportedTokens;
    }

    function oETHTokenAddress() external view returns (address payable) {
        return _oETHTokenAddress;
    }

    /**
     * @notice Checks if a vault is already added to the specified vault array.
     * @param vaultAddress The address of the vault to check
     * @return true if the vault is already added, false otherwise
     */
    function isOpenFund(address vaultAddress) public view returns (bool) {
        for (uint256 i = 0; i < openFunds.length; i++) {
            if (openFunds[i] == vaultAddress) {
                return true; // The vault is already added
            }
        }
        return false; // The vault is not in the array
    }

    function _isSupportedToken(address tokenAddress) internal view returns (bool) {
        for (uint256 i = 0; i < _supportedTokens.length; i++) {
            if (_supportedTokens[i] == tokenAddress) {
                return true;
            }
        }
        return false;
    }

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }
}