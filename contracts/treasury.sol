// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;

import "@IFund.sol";
import "@ITreasury.sol";

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
    address[] public supportedTokens;

    /// @notice         The address of Origin Protocol OETH token
    address payable public oETHTokenAddress;

    address[] public lockedFunds;
    address[] public openFunds;

    /// @notice Checks that the `msg.sender` is the factory.
    modifier onlyFactory() {
        require(msg.sender == address(factory), "onlyFactory");
        _;
    }

    constructor(address _factory) {
        factory = _factory;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(TREASURER_ROLE, msg.sender);
    }

    /**
     *  @notice         Set the contract address for Origin Protocol staked token
     */
    function setOETHContractAddress(address payable _oETHTokenAddress) external onlyRole(TREASURER_ROLE) {
        emit OriginProtocolTokenUpdated(address(oETHTokenAddress), address(_oETHTokenAddress));
        oETHTokenAddress = _oETHTokenAddress;
    }

    /**
     *  @notice         Add a supported token address
     */
    function addSupportedToken(address token) external onlyRole(TREASURER_ROLE) {
        require(supportedTokensIndex[token] == 0, "Address already exists");
        supportedTokens.push(token);
        supportedTokensIndex[token] = supportedTokens.length;
        emit SupportedTokenAdded(address(token));
    }

    /**
     *  @notice         Remove a supported token address
     */
    function removeSupportedToken(address token) external onlyRole(TREASURER_ROLE) {
        require(supportedTokensIndex[token] != 0, "Address doesn't exist");

        uint256 indexToRemove = supportedTokensIndex[token] - 1;
        uint256 lastIndex = supportedTokens.length - 1;

        if (indexToRemove != lastIndex) {
            address lastToken = supportedTokens[lastIndex];
            supportedTokens[indexToRemove] = lastToken;
            supportedTokensIndex[lastToken] = indexToRemove + 1;
        }

        supportedTokens.pop();
        delete supportedTokensIndex[token];

        emit SupportedTokenRemoved(address(token));
    }

    /**
     *  @notice         Adds a new fund to the lockedFund treasurey register
     */
    function addLockedFund(address fundAddress) external onlyFactory {
        require(!isLockedFund(fundAddress), "Fund already locked");
        lockedFunds.push(fundAddress);
        emit LockedFundAdded(fundAddress);
    }

    /**
     *  @notice         Moves a fund from the lockedFunds to the openFunds treasurey register
     */
    function moveToOpenFund(address fundAddress) external onlyFactory {
        require(isLockedFund(fundAddress), "Fund not found");
        require(!isOpenFund(fundAddress), "Fund already Open");
        // remove the fund from lockedFunds
        _removeLockedFund(fundAddress);
        openFunds.push(fundAddress);
        emit MovedToOpenFund(fundAddress);
    }

    /**
     *  @notice         Removes a fund from the locked fund register
     *                  should only happen when moving from locked --> open
     */
    function _removeLockedFund(address fundAddress) internal {
        for (uint256 i = 0; i < lockedFunds.length; i++) {
            if (lockedFunds[i] == fundAddress) {
                lockedFunds[i] = lockedFunds[lockedFunds.length - 1];
                lockedFunds.pop();
                break;
            }
        }
    }

    /**
     *  @notice         Iterates through all the funds and calls the sendToTreasury() method on them
     */
    function collect() external onlyRole(TREASURER_ROLE) {

        require(openFunds.length > 0, "No open funds to collect from");

        for (uint256 i = 0; i < openFunds.length; i++) {
            address fundAddress = openFunds[i];

            // Ensure the fund is open before collecting
            IFund fund = IFund(fundAddress);
            require(fund.getState() == IFund.State.Open, "Fund is not open");

            // Call the sendToTreasury() method on the fund
            fund.sendToTreasury();
        }

        emit CollectedOpenFunds();
    }

    /**
     * @notice          Distributes treasury balance to all locked funds
     * @param           tokenId the supported token to distribute. Use 0 for native token
     */
    function distribute(uint256 tokenId) external onlyRole(TREASURER_ROLE) {
        require(_isTokenValid(tokenId), "Invalid tokenId");

        uint256 totalLockedFunds = lockedFunds.length;

        // Ensure there are locked funds to distribute to
        require(totalLockedFunds > 0, "No locked funds to distribute to");

        // Calculate the amount to distribute to each locked fund
        uint256 ethToDistribute = address(this).balance / totalLockedFunds;

        // Loop through the locked funds and distribute ETH and supported tokens
        for (uint256 i = 0; i < totalLockedFunds; i++) {
            address fundAddress = lockedFunds[i];

            // Transfer native ETH balance to the fund contract
            payable(fundAddress).transfer(ethToDistribute);

            // Transfer supported tokens to the fund contract
            for (uint256 j = 0; j < supportedTokens.length; j++) {
                address tokenAddress = supportedTokens[j];
                ISupportedToken token = ISupportedToken(tokenAddress);
                uint256 tokenBalance = token.balanceOf(address(this));

                if (tokenBalance > 0) {
                    token.transfer(fundAddress, tokenBalance / totalLockedFunds);
                }
            }
        }

        emit DistributedOpenFundsToLockedFunds();
    }

    function grantTreasurerRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(TREASURER_ROLE, account);
    }

    function revokeTreasurerRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        revokeRole(TREASURER_ROLE, account);
    }
}