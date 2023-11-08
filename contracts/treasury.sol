// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./IFund.sol";
import "./ITreasury.sol";

interface ISupportedToken {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}


interface IFactory {
    function nextTokenIdToMint() external view returns (uint256);
    function funds(uint256 tokenId) external view returns (address);
}

/**
 *  @notice The treasury distributes from open funds to locked funds, and keeps track of all supported tokens
 */
contract Treasury is ITreasury, AccessControl {

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
     *  @notice         Moves a fund from the lockedFunds to the openFunds treasurey register
     */
    function addOpenFund(address fundAddress) external onlyFactory {
        require(!isOpenFund(fundAddress), "Fund already Open");
        openFunds.push(fundAddress);
        emit AddedOpenFund(fundAddress);
    }

    /**
     *  @notice         Iterates through all the funds and calls the sendToTreasury() method on them
     */
    function collect() external onlyRole(TREASURER_ROLE) {

        require(openFunds.length > 0, "No open funds to collect from");

        for (uint256 i = 0; i < openFunds.length; i++) {
            address fundAddress = openFunds[i];
            // Call the sendToTreasury() method on the fund
            IFund fund = IFund(fundAddress);
            fund.sendToTreasury();
        }

        emit CollectedOpenFunds();
    }

    /**
     * @notice          Distributes treasury native token balance to all locked funds
     */
    function distributeNativeTokenRewards() external onlyRole(TREASURER_ROLE) {

        require(address(this).balance > 0, 'No native tokens');

        address[] memory lockedFunds;
        uint256[] memory lockedBalances;
        uint256 totalLockedBalance;

        uint256 nRecipients = 0;

        (lockedFunds, lockedBalances, totalLockedBalance) = _lockedFundsWithBalance(address(0));

        uint256 balanceBeforeDistribution = address(this).balance;

        // calculate & distribute each locked fund's percentage of rewards
        for (uint256 i = 0; i < lockedFunds.length; i++) {
            if (lockedFunds[i] != address(0)) {
                uint256 reward = (balanceBeforeDistribution * lockedBalances[i]) / totalLockedBalance;
                Address.sendValue(payable(lockedFunds[i]), reward);
                emit DistributedNativeTokensToLockedFund(lockedFunds[i], reward);
                nRecipients++;
            }
        }

        emit DistributedNativeTokensToLockedFunds(balanceBeforeDistribution, nRecipients);
    }

    /**
     * @notice  Distributes supported token balances to locked funds having balance of that token
     */
    function distributeSupportedTokenRewards(address supportedTokenAddress) external onlyRole(TREASURER_ROLE) {
        
        require(_isSupportedToken(supportedTokenAddress), 'Unsupported token');

        ISupportedToken token = ISupportedToken(supportedTokenAddress);

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
                        // Transfer tokens to the fund
                        token.transfer(targetFunds[i], proportionateShare);
                        emit DistributedSupportedTokenToLockedFund(address(token), targetFunds[i], proportionateShare);
                        nRecipients++;
                    }
                }
                emit DistributedSupportedTokensToLockedFunds(address(token), treasuryTokenBalance, nRecipients);
            }
        }
    }

    function _lockedFundsWithBalance(address supportedToken) internal view returns (
        address[] memory, uint256[] memory, uint256) {

        uint256 totalLockedBalance = 0;
        uint256 nFunds = factory.nextTokenIdToMint(); // total number of all funds

        address[] memory lockedFunds = new address[](nFunds);
        uint256[] memory lockedBalances = new uint256[](nFunds);

        // find the total balance of all locked funds and keep track of their individual balances
        for (uint256 tokenId = 0; tokenId < nFunds; tokenId++) {
            address fundAddress = factory.funds(tokenId);
            IFund fund = IFund(fundAddress);

            if (fund.state() == IFund.State.Locked) {
                uint256 fundBalance;
                if (address(supportedToken) == address(0)) {
                    // If it's a zero address, consider native token balance
                    fundBalance = fund.getNativeTokenBalance();
                } else {
                    // If a supported token address is provided, consider the balance of that token
                    ISupportedToken token = ISupportedToken(supportedToken);
                    fundBalance = token.balanceOf(fundAddress);
                }

                if (fundBalance > 0) {
                    lockedFunds[tokenId] = fundAddress;
                    lockedBalances[tokenId] = fundBalance;
                    totalLockedBalance += fundBalance;
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
     * @notice Checks if a fund is already added to the specified fund array.
     * @param fundAddress The address of the fund to check
     * @return true if the fund is already added, false otherwise
     */
    function isOpenFund(address fundAddress) public view returns (bool) {
        for (uint256 i = 0; i < openFunds.length; i++) {
            if (openFunds[i] == fundAddress) {
                return true; // The fund is already added
            }
        }
        return false; // The fund is not in the array
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