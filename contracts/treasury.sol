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
            require(fund.state() == IFund.State.Open, "Fund is not open");

            // Call the sendToTreasury() method on the fund
            fund.sendToTreasury();
        }

        emit CollectedOpenFunds();
    }

    /**
     * @notice          Distributes treasury ETH balance to all locked funds
     */
    function distributeNativeToken() external onlyRole(TREASURER_ROLE) {
        uint256 totalLockedFunds = lockedFunds.length;

        // Ensure there are locked funds to distribute to
        require(totalLockedFunds > 0, "No locked funds to distribute to");

        // Calculate the amount to distribute to each locked fund
        uint256 ethToDistribute = address(this).balance / totalLockedFunds;

        // Loop through the locked funds and distribute ETH
        for (uint256 i = 0; i < totalLockedFunds; i++) {
            address fundAddress = lockedFunds[i];

            // Use Address.sendValue for batch transfers
            Address.sendValue(payable(fundAddress), ethToDistribute);
        }

        emit DistributedNativeTokensToLockedFunds();
    }

    /**
     * @notice  Distributes supported token balances to specified locked funds
     * @param targetFunds Array of target fund addresses
     */
    function distributeSupportedTokens(address[] memory targetFunds) external onlyRole(TREASURER_ROLE) {
        uint256 totalLockedFunds = lockedFunds.length;

        // Ensure there are locked funds to distribute to
        require(totalLockedFunds > 0, "No locked funds to distribute to");

        for (uint256 j = 0; j < _supportedTokens.length; j++) {
            address tokenAddress = _supportedTokens[j];
            ISupportedToken token = ISupportedToken(tokenAddress);
            uint256 tokenBalance = token.balanceOf(address(this));

            if (tokenBalance > 0) {
                for (uint256 i = 0; i < targetFunds.length; i++) {
                    address fundAddress = targetFunds[i];

                    // Check if the fund is not open or not a member of openFunds
                    IFund fund = IFund(fundAddress);
                    require(
                        fund.state() == IFund.State.Locked,
                        "Fund is not locked"
                    );

                    // Transfer tokens to the fund
                    token.transfer(fundAddress, tokenBalance / targetFunds.length);
                }
            }
        }

        emit DistributedSupportedTokensToLockedFunds(targetFunds);
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
    function isLockedFund(address fundAddress) public view returns (bool) {
        for (uint256 i = 0; i < lockedFunds.length; i++) {
            if (lockedFunds[i] == fundAddress) {
                return true; // The fund is already added
            }
        }
        return false; // The fund is not in the array
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

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }
}