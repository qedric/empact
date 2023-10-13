// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;

import "@IFund.sol";
import "@ITreasury.sol";

contract Treasury is ITreasury {

    /// @notice The Fund implementation contract that is cloned for each new fund
    IFund public fundImplementation;

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