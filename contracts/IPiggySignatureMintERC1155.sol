// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;

interface IPiggySignatureMintERC1155 { 
    /**
     *  @notice The body of a request to mint tokens.
     *
     *  @param to The receiver of the tokens to mint.
     *  @param quantity The quantity of tokens to mint.
     *  @param validityStartTimestamp The unix timestamp after which the payload is valid.
     *  @param validityEndTimestamp The unix timestamp at which the payload expires.
     *  @param uri The metadata URI of the token to mint. (Not applicable for ERC20 tokens)
     */
    struct MintRequest {
        address to;
        uint256 quantity;
        uint128 validityStartTimestamp;
        uint128 validityEndTimestamp;
        string name;
        string description;
        uint256 unlockTime;
        uint256 targetBalance;
    }

    /// @dev Emitted when tokens are minted.
    event TokensMintedWithSignature(
        address indexed signer,
        address indexed mintedTo,
        uint256 indexed tokenIdMinted
    );

    /**
     *  @notice Verifies that a mint request is signed by an account holding
     *          MINTER_ROLE (at the time of the function call).
     *
     *  @param req The payload / mint request.
     *  @param signature The signature produced by an account signing the mint request.
     *
     *  returns (success, signer) Result of verification and the recovered address.
     */
    function verify(MintRequest calldata req, bytes calldata signature)
        external
        view
        returns (bool success, address signer);

    /**
     *  @notice Mints tokens according to the provided mint request.
     *
     *  @param req The payload / mint request.
     *  @param signature The signature produced by an account signing the mint request.
     */
    function mintWithSignature(MintRequest calldata req, bytes calldata signature)
        external
        payable
        returns (address signer);
}