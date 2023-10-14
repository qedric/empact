// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;

import "@IFund.sol";
import "@ITreasury.sol";

contract Treasury is ITreasury {

    address[] public lockedFunds;
    address[] public openFunds;

    /**
     *  @notice adds a new fund to the lockedFund treasurey register
     */
    function addLockedFund(address fundAddress) external {
        require(!isLockedFund(fundAddress), "Fund already locked");
        lockedFunds.push(fundAddress);
    }

    /**
     *  @notice moves a fund from the lockedFunds to the openFunds treasurey register
     */
    function moveToOpenFund(address fundAddress) external {
        require(isLockedFund(fundAddress), "Fund not found");
        require(!isOpenFund(fundAddress), "Fund already Open");
        // remove the fund from lockedFunds
        _removeLockedFund(fundAddress);
        openFunds.push(fundAddress);
    }

    /**
     *  @notice removes a fund from the locked fund register - should only happen when moving from locked --> open
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
     *  @notice Iterates through all the funds and calls the sendToTreasury() method on them
     */
    function collect() external {
    }

    /**
     *  @notice Distributes treasury balance to all locked funds
     *
     *  @param tokenId the supported token to distribute. Use 0 for native token
    */
    function distribute(uint256 tokenId) external onlyRole(TREASURER_ROLE) {
        for (uint256 tokenId = 0; tokenId <= nextTokenIdToMint_; tokenId++) {
            if (_isFundLocked(tokenId)) {
                address fundAddress = funds[tokenId];
                IFund fund = IFund(fundAddress);

                if (fund.getFundState() == IFund.State.Unlocked) {
                    // Transfer native ETH balance to the fund contract
                    payable(fundAddress).transfer(address(this).balance);

                    // Transfer supported tokens to the fund contract
                    for (uint256 i = 0; i < supportedTokens.length; i++) {
                        address tokenAddress = supportedTokens[i];
                        ISupportedToken token = ISupportedToken(tokenAddress);
                        uint256 tokenBalance = token.balanceOf(address(this));
                        if (tokenBalance > 0) {
                            token.transfer(fundAddress, tokenBalance);
                        }
                    }
                }
            }
        }
    }

    function isFundLocked(uint256 tokenId) external view tokenExists(tokenId) returns (bool) {
        // Check if the fund is in the "Locked" state
        return currentState == (IFund(funds[tokenId]).currentState() == IFund.State.Locked);
    }
}