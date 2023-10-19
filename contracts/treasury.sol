// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./IFund.sol";
import "./ITreasury.sol";

interface ISupportedToken {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

/**
 *  @notice The treasury distributes from open funds to locked funds, and keeps track of all supported tokens
 */
contract Treasury is ITreasury, AccessControl {

    /// @notice This role can add/remove supported tokens and carry out treasury operations such as collect and distribute
    bytes32 public constant TREASURER_ROLE = keccak256("TREASURER_ROLE");

    address public immutable factory;

    /// @notice         The addresses of tokens that will count toward the ETH balance
    /// @notice         This is intended to contain supported ETH Staking tokens only.
    mapping(address => uint256) public supportedTokensIndex;
    address[] private _supportedTokens;

    /// @notice         The address of Origin Protocol OETH token
    address payable private _oETHTokenAddress;

    address[] public lockedFunds;
    address[] public openFunds;

    /// @notice Checks that the `msg.sender` is the factory.
    modifier onlyFactory() {
        require(msg.sender == factory, "onlyFactory");
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
     *  @notice         Adds a new fund to the lockedFund treasurey register
     */
    function addLockedFund(address fundAddress) external onlyFactory {
        require(!isMember(fundAddress, lockedFunds), "Fund already locked");
        lockedFunds.push(fundAddress);
        emit LockedFundAdded(fundAddress);
    }

    /**
     *  @notice         Moves a fund from the lockedFunds to the openFunds treasurey register
     */
    function moveToOpenFund(address fundAddress) external onlyFactory {
        require(isMember(fundAddress, lockedFunds), "Fund not found");
        require(!isMember(fundAddress, openFunds), "Fund already Open");
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
            require(fund.currentState() == IFund.State.Open, "Fund is not open");

            // Call the sendToTreasury() method on the fund
            fund.sendToTreasury();
        }

        emit CollectedOpenFunds();
    }

    /**
     * @notice          Distributes treasury balance to all locked funds
     */
    function distribute() external onlyRole(TREASURER_ROLE) {

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
            for (uint256 j = 0; j < _supportedTokens.length; j++) {
                address tokenAddress = _supportedTokens[j];
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

    function supportedTokens() external view returns (address[] memory) {
        return _supportedTokens;
    }

    function oETHTokenAddress() external view returns (address payable) {
        return _oETHTokenAddress;
    }

    /**
     * @notice Checks if a fund is already added to the specified fund array.
     * @param fundAddress The address of the fund to check
     * @param fundArray The array to check (e.g., lockedFunds or openFunds)
     * @return true if the fund is already added, false otherwise
     */
    function isMember(address fundAddress, address[] memory fundArray) public pure returns (bool) {
        for (uint256 i = 0; i < fundArray.length; i++) {
            if (fundArray[i] == fundAddress) {
                return true; // The fund is already added
            }
        }
        return false; // The fund is not in the array
    }
}