// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;

interface ISignatureMint { 
    /**
     *  @notice The body of a request to mint a new vault.
     *
     *  @param to The receiver of the tokens to mint.
     *  @param baseToken The address of the asset used to calculate balance.
     *  @param validityStartTimestamp The unix timestamp after which the payload is valid.
     *  @param validityEndTimestamp The unix timestamp at which the payload expires.
     *  @param quantity The quantity of tokens to mint.
     *  @param unlockTime The block timestamp before which the vault cannot be unlocked.
     *  @param targetBalance The balance of the base asset required before which the vault cannot be unlocked.
     *  @param name The name of the vault.
     *  @param description A description of the vault.
     */
    struct MintRequest {
        address to;
        address baseToken;
        uint128 validityStartTimestamp;
        uint128 validityEndTimestamp;
        uint256 quantity;
        uint256 unlockTime;
        uint256 targetBalance;
        string name;
        string description;
    }

    /// @dev Emitted when tokens are minted.
    event TokensMintedWithSignature(
        address indexed signer,
        address indexed mintedTo,
        uint256 indexed tokenIdMinted
    );

    /**
     *  @notice Verifies that a mint request is signed by an account holding
     *          SIGNER_ROLE (at the time of the function call).
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