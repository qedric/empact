// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;

import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@thirdweb-dev/contracts/extension/ContractMetadata.sol";
import "./vault.sol";
import "./IGenerator.sol";
import "./ITreasury.sol";
import "./ISignatureMint.sol";

abstract contract SignatureMint is EIP712, ISignatureMint {
    using ECDSA for bytes32;

    bytes32 internal constant TYPEHASH =
        keccak256(
            "MintRequest(address to,address baseToken,uint128 validityStartTimestamp,uint128 validityEndTimestamp,uint256 quantity,uint256 unlockTime,uint256 targetBalance,string name,string description)"
        );

    constructor() EIP712("SignatureMintERC1155", "1") {}

    /// @dev Verifies that a mint request is signed by an account holding SIGNER_ROLE (at the time of the function call).
    function verify(
        MintRequest calldata _req,
        bytes calldata _signature
    ) public view returns (bool success, address signer) {
        signer = _recoverAddress(_req, _signature);
        success = _canSignMintRequest(signer);
    }

    /// @dev Returns whether a given address is authorized to sign mint requests.
    function _canSignMintRequest(
        address _signer
    ) internal view virtual returns (bool);

    /// @dev Verifies a mint request
    function _processRequest(
        MintRequest calldata _req,
        bytes calldata _signature
    ) internal view returns (address signer) {
        bool success;
        (success, signer) = verify(_req, _signature);
        require(success, "Invalid request");
        require(
            _req.validityStartTimestamp <= block.timestamp &&
                block.timestamp <= _req.validityEndTimestamp,
            "Request expired"
        );
        require(_req.quantity > 0, "0 qty");        
    }

    /// @dev Returns the address of the signer of the mint request.
    function _recoverAddress(
        MintRequest calldata _req,
        bytes calldata _signature
    ) internal view returns (address) {
        return
            _hashTypedDataV4(keccak256(_encodeRequest(_req))).recover(
                _signature
            );
    }

    /*
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
    */

    /// @dev Resolves 'stack too deep' error in `recoverAddress`.
    function _encodeRequest(
        MintRequest calldata _req
    ) internal pure returns (bytes memory) {
        return
            abi.encode(
                TYPEHASH,
                _req.to,
                _req.baseToken,
                _req.validityStartTimestamp,
                _req.validityEndTimestamp,
                _req.quantity,
                _req.unlockTime,
                _req.targetBalance,
                keccak256(bytes(_req.name)),
                keccak256(bytes(_req.description))
            );
    }
}

/// @title A contract for creating and managing vaults that are associated with ERC1155 tokens
/// @notice This contract handles the creation, management, and interaction with individual vaults, and is compliant with ERC1155 standards.
/// @dev The contract inherits from ERC1155, ContractMetadata, SignatureMint, and AccessControl.
contract Factory is
    ERC1155Supply,
    ContractMetadata,
    SignatureMint,
    AccessControl
{

    bytes32 public constant SIGNER_ROLE = keccak256("SIGNER_ROLE");

    /*//////////////////////////////////////////////////////////////
    Events
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when a new vault is deployed
    event VaultDeployed(address indexed vault, address indexed msgSender);

    /// @notice Emitted when the fee recipient is updated
    event FeeRecipientUpdated(address indexed recipient);

    /// @notice Emitted when the fee for vault creation is updated
    event MakeVaultFeeUpdated(uint256 fee);

    /// @notice Emitted when the fee for vault withdrawal is updated
    event BreakVaultBpsUpdated(uint16 bps);

    event VaultImplementationUpdated(address indexed implementation);
    event GeneratorUpdated(address indexed generator);
    event TreasuryUpdated(address indexed treasury);
    event Payout(address indexed vaultAddress, uint256 tokenId);

    /*//////////////////////////////////////////////////////////////
    State variables
    //////////////////////////////////////////////////////////////*/

    /// @dev The tokenId of the next NFT to mint.
    uint256 internal nextTokenIdToMint_;

    /// @notice The fee to create a new Vault.
    uint256 public makeVaultFee = 0.004 ether;

    /// @notice The fee deducted with each withdrawal from a vault, in basis points
    uint16 public withdrawalFeeBps = 400;

    /// @notice The Vault implementation contract that is cloned for each new vault
    IVault public vaultImplementation;

    /// @notice The contract that generates the on-chain metadata
    IGenerator public generator;

    /// @notice The contract that handles open vaults
    ITreasury public treasury;

    /// @notice The address that receives all fees.
    address payable public feeRecipient;

    /*//////////////////////////////////////////////////////////////
    Mappings & Arrays
    //////////////////////////////////////////////////////////////*/

    /// @dev Vaults are mapped to the tokenId of the NFT they are tethered to
    mapping(uint256 => address) public vaults;

    /*//////////////////////////////////////////////////////////////
    Modifiers
    //////////////////////////////////////////////////////////////*/

    /// @notice checks to ensure that the token exists before referencing it
    modifier tokenExists(uint256 tokenId) {
        require(exists(tokenId), "Token not found");
        _;
    }

    /*//////////////////////////////////////////////////////////////
    Constructor
    //////////////////////////////////////////////////////////////*/

    /// @param _feeRecipient The address that will receive fees collected by the contract
    constructor(address payable _feeRecipient) ERC1155('') {
        feeRecipient = _feeRecipient;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(SIGNER_ROLE, msg.sender);
    }

    /*//////////////////////////////////////////////////////////////
    Overriden metadata logic - On-chain
    //////////////////////////////////////////////////////////////*/
    function uri(uint256 tokenId) public view override tokenExists(tokenId) returns (string memory) {
        return generator.data(tokenId);
    }

    /*//////////////////////////////////////////////////////////////
    Mint / burn logic
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Mints new tokens with a signature from an authorized signer, and creates an associated vault
     * @dev Minting logic includes creating a new erc1155 token, and deploying a new vault
     * @param _req The signed mint request data
     * @param _signature The signature of an address with the SIGNER role
     * @return signer The address of the signer who authorized the mint
     */
    function mintWithSignature(
        MintRequest calldata _req,
        bytes calldata _signature
    ) external payable returns (address signer) {
        require(_req.quantity > 0, "Minting zero tokens.");
        require(
            block.timestamp < _req.unlockTime || _req.targetBalance > 0,
            "Unlock time should be in the future, or target balance greater than 0"
        );

        // Verify and process payload.
        signer = _processRequest(_req, _signature);

        // always mint new token ids
        uint256 tokenIdToMint = nextTokenIdToMint_;
        nextTokenIdToMint_ += 1;

        /*
        struct Attr {
            address baseToken;
            uint256 tokenId;
            uint256 unlockTime;
            uint256 startTime;
            uint256 targetBalance;
            string name;
            string description;
        }
        */
        IVault.Attr memory vaultData = IVault.Attr(
            _req.baseToken,
            tokenIdToMint,
            _req.unlockTime,
            block.timestamp,
            _req.targetBalance,
            _req.name,
            _req.description
        );
    
        // deploy a separate proxy contract to hold the token's ETH; add its address to the attributes
        vaults[tokenIdToMint] = _deployProxyByImplementation(vaultData, bytes32(tokenIdToMint));

        // Mint tokens.
        emit TokensMintedWithSignature(signer, _req.to, tokenIdToMint);
        _mint(_req.to, tokenIdToMint, _req.quantity, "");
        
        // Collect price
        _collectMakeVaultFee(); 
    }

    /// @dev Every time a new token is minted, a Vault proxy contract is deployed to hold the vaults
    function _deployProxyByImplementation(
        IVault.Attr memory _vaultData,
        bytes32 _salt
    ) internal returns (address deployedProxy) {

        bytes32 salthash = keccak256(abi.encodePacked(msg.sender, _salt));
        deployedProxy = Clones.cloneDeterministic(
            address(vaultImplementation),
            salthash
        );

        IVault(deployedProxy).initialize(_vaultData, withdrawalFeeBps);

        emit VaultDeployed(deployedProxy, msg.sender);
    }

    /**
     * @notice Executes the payout process for a given token ID, 
         burning the sender's token balance and calling the payout function in the associated vault contract.
     * @dev This function first checks the caller's balance of the specified token ID. 
        If the balance is greater than zero, it burns the tokens to prevent double claiming. 
        It then calls the `payout` function of the corresponding vault contract. 
        If the vault's state changes to 'Open', it updates the treasury contract.
     * @param tokenId The ID of the token for which the payout is being processed.
     * @custom:modifier tokenExists Ensures that the token for the given token ID exists before processing the payout.
     */
    function payout(uint256 tokenId) external tokenExists(tokenId) {

        uint256 thisOwnerBalance = balanceOf(msg.sender, tokenId);

        require(thisOwnerBalance != 0, "Not authorised!");

        // get the total supply before burning
        uint256 totalSupplyBeforePayout = totalSupply(tokenId);

        // burn the tokens so the owner can't claim twice
        _burn(msg.sender, tokenId, thisOwnerBalance);

        try IVault(payable(vaults[tokenId])).payout{value: 0} (
            msg.sender,
            feeRecipient,
            thisOwnerBalance,
            totalSupplyBeforePayout
        ) returns (IVault.State state) {
            emit Payout(address(vaults[tokenId]), tokenId);
            if (state == IVault.State.Open) {
                // vault is now open; update the treasury
                treasury.addOpenVault(address(vaults[tokenId]));
            }
        } catch Error(string memory reason) {
            revert(reason);
        } catch (bytes memory /*lowLevelData*/) {
            revert("payout failed");
        }
    }

    /**
    * @notice Executes the payout process for a given token ID on behalf of a token holder,
        burning the token holder's token balance and calling the payout function in the associated vault contract.
    * @dev This function can only be called by an admin. It first checks the token holder's balance of the specified token ID. 
        If the balance is greater than zero, it burns the tokens to prevent double claiming. 
        It then calls the `payout` function of the corresponding vault contract. 
        If the vault's state changes to 'Open', it updates the treasury contract.
    * @param tokenId The ID of the token for which the payout is being processed.
    * @param tokenHolder The address of the token holder.
    * @custom:modifier tokenExists Ensures that the token for the given token ID exists before processing the payout.
    * @custom:modifier onlyAdmin Ensures that only the admin can call this function.
    */
    function adminPayout(uint256 tokenId, address tokenHolder) external tokenExists(tokenId) onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 tokenHolderBalance = balanceOf(tokenHolder, tokenId);

        require(tokenHolderBalance != 0, "Not authorised!");

        // get the total supply before burning
        uint256 totalSupplyBeforePayout = totalSupply(tokenId);

        // burn the tokens so the token holder can't claim twice
        _burn(tokenHolder, tokenId, tokenHolderBalance);

        try IVault(payable(vaults[tokenId])).payout{value: 0} (
            tokenHolder,
            feeRecipient,
            tokenHolderBalance,
            totalSupplyBeforePayout
        ) returns (IVault.State state) {
            emit Payout(address(vaults[tokenId]), tokenId);
            if (state == IVault.State.Open) {
                // vault is now open; update the treasury
                treasury.addOpenVault(address(vaults[tokenId]));
            }
        } catch Error(string memory reason) {
            revert(reason);
        } catch (bytes memory /*lowLevelData*/) {
            revert("payout failed");
        }
    }
    

    /*//////////////////////////////////////////////////////////////
    Configuration
    //////////////////////////////////////////////////////////////*/

    /// @notice Sets the fee for creating a new vault
    function setMakeVaultFee(uint256 fee) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit MakeVaultFeeUpdated(fee);
        makeVaultFee = fee;
    }

    /// @notice Sets the fee for withdrawing the vaults from a Vault - does not affect existing vaults
    function setBreakVaultBps(uint16 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(bps <= 900, "Don't be greedy!");
        emit BreakVaultBpsUpdated(bps);
        withdrawalFeeBps = bps;
    }

    /**
     *  @notice         Updates recipient of make & break vault fees
     *  @param _feeRecipient   Address to be set as new recipient of primary sales.
     */
    function setFeeRecipient(address payable _feeRecipient) external onlyRole(DEFAULT_ADMIN_ROLE) {
        feeRecipient = _feeRecipient;
        emit FeeRecipientUpdated(_feeRecipient);
    }

    /**
     *  @notice         Sets an implementation for the vault clones
     *                  ** Ensure this is called before using this contract! **
     */
    function setVaultImplementation(IVault _vaultImplementationAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit VaultImplementationUpdated(address(_vaultImplementationAddress));
        vaultImplementation = _vaultImplementationAddress;
    }

    /**
     *  @notice         Sets an implementation for generator contract
     *                  This allows us to change the metadata and artwork of the NFTs
     */
    function setGenerator(IGenerator _generatorAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit GeneratorUpdated(address(_generatorAddress));
        generator = _generatorAddress;
    }

    /**
     *  @notice         Sets an implementation for treasury contract
     */
    function setTreasury(ITreasury _treasuryAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit TreasuryUpdated(address(_treasuryAddress));
        treasury = _treasuryAddress;
    }

    /**
     * @notice Grants the SIGNER role to a specified account.
     * @dev Only an account with the DEFAULT_ADMIN_ROLE can assign the SIGNER_ROLE.
     * @param account The address of the account to be granted the SIGNER_ROLE.
     */
    function grantSignerRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(SIGNER_ROLE, account);
    }

    /**
     * @notice Revokes the SIGNER_ROLE from a specified account.
     * @dev Only an account with the DEFAULT_ADMIN_ROLE can revoke the SIGNER_ROLE.
     * @param account The address of the account from which the SIGNER_ROLE will be revoked.
     */
    function revokeSignerRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        revokeRole(SIGNER_ROLE, account);
    }

    /*//////////////////////////////////////////////////////////////
    ERC165 Logic
    //////////////////////////////////////////////////////////////*/
    
    // Override the supportsInterface function from the ERC1155 contract.
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC1155, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    /*//////////////////////////////////////////////////////////////
    View functions
    //////////////////////////////////////////////////////////////*/

    /// @notice The tokenId assigned to the next new NFT to be minted.
    function nextTokenIdToMint() external view returns (uint256) {
        return nextTokenIdToMint_;
    }

    /*//////////////////////////////////////////////////////////////
    Internal / overrideable functions
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev Total value of tokens in with a given id.
     */
    function totalSupplyOf(uint256 id) public view virtual returns (uint256) {
        return super.totalSupply(id);
    }

    /// @dev Returns whether contract metadata can be set in the given execution context.
    function _canSetContractURI() internal view virtual override returns (bool) {
        return hasRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /// @dev Returns whether a given address is authorized to sign mint requests.
    function _canSignMintRequest(
        address _signer
    ) internal view virtual override returns (bool) {
        return hasRole(SIGNER_ROLE, _signer);
    }

    /// @dev Collects and distributes the primary sale value of NFTs being claimed.
    function _collectMakeVaultFee() internal virtual {
        if (makeVaultFee == 0) {
            return;
        }
        require(msg.value == makeVaultFee, "Must send the correct fee");
        feeRecipient.transfer(msg.value);
    }
}