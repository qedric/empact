// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@thirdweb-dev/contracts/extension/ContractMetadata.sol";
import "../vault.sol";
import "../IGenerator.sol";
import "../ITreasury.sol";
import "../ISignatureMint.sol";

abstract contract MockSignatureMint is EIP712, ISignatureMint {
    using ECDSA for bytes32;

    bytes32 internal constant TYPEHASH =
        keccak256(
            "MintRequest(address to,uint128 validityStartTimestamp,uint128 validityEndTimestamp,uint256 quantity,uint256 unlockTime,uint256 targetBalance,string name,string description)"
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

contract MockFactory is
    ERC1155,
    ContractMetadata,
    MockSignatureMint,
    AccessControl
{

    bytes32 public constant SIGNER_ROLE = keccak256("SIGNER_ROLE");

    /*//////////////////////////////////////////////////////////////
    Events
    //////////////////////////////////////////////////////////////*/

    event VaultDeployed(address indexed vault, address indexed msgSender);
    event FeeRecipientUpdated(address indexed recipient);
    event MakeVaultFeeUpdated(uint256 fee);
    event BreakVaultBpsUpdated(uint16 bps);
    event VaultImplementationUpdated(address indexed implementation);
    event GeneratorUpdated(address indexed generator);
    event TreasuryUpdated(address indexed treasury);
    event Payout(address indexed vaultAddress, uint256 tokenId);
    event TokenUrlPrefixUpdated(string oldPrefix, string newPrefix);

    /*//////////////////////////////////////////////////////////////
    State variables
    //////////////////////////////////////////////////////////////*/

    /// @dev The tokenId of the next NFT to mint.
    uint256 internal nextTokenIdToMint_;

    /// @dev prefix for the token url
    string private _tokenUrlPrefix;

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

    /**
     *  @notice Returns the total supply of NFTs of a given tokenId
     *  @dev Mapping from tokenId => total circulating supply of NFTs of that tokenId.
     */
    mapping(uint256 => uint256) public totalSupply;

    /// @dev Vaults are mapped to the tokenId of the NFT they are tethered to
    mapping(uint256 => address) public vaults;

    /*//////////////////////////////////////////////////////////////
    Modifiers
    //////////////////////////////////////////////////////////////*/

    /// @notice checks to ensure that the token exists before referencing it
    modifier tokenExists(uint256 tokenId) {
        require(totalSupply[tokenId] > 0, "Token not found");
        _;
    }

    /*//////////////////////////////////////////////////////////////
    Constructor
    //////////////////////////////////////////////////////////////*/
    constructor(address payable _feeRecipient, string memory tokenUrlPrefix) ERC1155('') {
        feeRecipient = _feeRecipient;
        _tokenUrlPrefix = tokenUrlPrefix;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(SIGNER_ROLE, msg.sender);
    }

    /*//////////////////////////////////////////////////////////////
    Overriden metadata logic - On-chain
    //////////////////////////////////////////////////////////////*/
    function uri(uint256 tokenId) public view override tokenExists(tokenId) returns (string memory) {
        return generator.uri(
            IVault(address(vaults[tokenId])).attributes(),
            address(vaults[tokenId]),
            _getPercent(tokenId),
            IVault(address(vaults[tokenId])).getTotalBalance(),
            _tokenUrlPrefix,
            tokenId
        );
    }

    /*//////////////////////////////////////////////////////////////
    Mint / burn logic
    //////////////////////////////////////////////////////////////*/

    /**
     *  @notice          Lets an authorized address mint NFTs to a recipient, via signed mint request
     *  @dev             The logic in the `_canSignMintRequest` function determines whether the caller is authorized to mint NFTs.
     *
     *  @param _req      The signed mint request.
     *  @param _signature  The signature of an address with the SIGNER role.
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
        uint256 tokenIdToMint = nextTokenIdToMint();
        nextTokenIdToMint_ += 1;

        /*
        struct Attr {
            uint256 tokenId;
            uint256 unlockTime;
            uint256 startTime;
            uint256 targetBalance;
            string name;
            string description;
        }
        */
        IVault.Attr memory vaultData = IVault.Attr(
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

    /// @dev If sender balance > 0 then burn sender balance and call payout function in the vault contract
    function payout(uint256 tokenId) external tokenExists(tokenId) {

        uint256 thisOwnerBalance = balanceOf(msg.sender, tokenId);

        require(thisOwnerBalance != 0, "Not authorised!");

        // get the total supply before burning
        uint256 totalSupplyBeforePayout = totalSupply[tokenId];

        // burn the tokens so the owner can't claim twice
        _burn(msg.sender, tokenId, thisOwnerBalance);

        try IVault(payable(vaults[tokenId])).payout{value: 0} (
            msg.sender,
            feeRecipient,
            thisOwnerBalance,
            totalSupplyBeforePayout
        ) returns (IVault.State state) {
            if (state == IVault.State.Open) {
                // vault is now open; update the treasury
                treasury.addOpenVault(address(vaults[tokenId]));
            }
            emit Payout(address(vaults[tokenId]), tokenId);
        } catch Error(string memory reason) {
            revert(reason);
        } catch (bytes memory /*lowLevelData*/) {
            revert("payout failed");
        }
    }

    /// @dev If sender balance > 0 then burn sender balance and call payout function in the vault contract
    function fake_payout(uint256 tokenId, address real_vault) external tokenExists(tokenId) {

        uint256 thisOwnerBalance = balanceOf(msg.sender, tokenId);

        require(thisOwnerBalance != 0, "Not authorised!");

        // get the total supply before burning
        uint256 totalSupplyBeforePayout = totalSupply[tokenId];

        // burn the tokens so the owner can't claim twice
        _burn(msg.sender, tokenId, thisOwnerBalance);

        try IVault(payable(real_vault)).payout{value: 0} (
            msg.sender,
            feeRecipient,
            thisOwnerBalance,
            totalSupplyBeforePayout
        ) returns (IVault.State state) {
            if (state == IVault.State.Open) {
                // vault is now open; update the treasury
                treasury.addOpenVault(address(real_vault));
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

    /// @notice this will display in NFT metadata
    function setTokenUrlPrefix(string memory tokenUrlPrefix) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit TokenUrlPrefixUpdated(_tokenUrlPrefix, tokenUrlPrefix);
        _tokenUrlPrefix = tokenUrlPrefix;
    }

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

    function grantSignerRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(SIGNER_ROLE, account);
    }

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
    function nextTokenIdToMint() public view virtual returns (uint256) {
        return nextTokenIdToMint_;
    }

    /*//////////////////////////////////////////////////////////////
    Internal / overrideable functions
    //////////////////////////////////////////////////////////////*/

    /// @dev calculates the percentage towards unlock based on time and target balance
    function _getPercent(uint256 tokenId) internal view returns (uint256 percentage) {

        uint256 percentageBasedOnTime;
        uint256 percentageBasedOnBalance;

        if (block.timestamp >= IVault(address(vaults[tokenId])).attributes().unlockTime) {
            percentageBasedOnTime = 100;
        } else {
            uint256 totalTime = IVault(address(vaults[tokenId])).attributes().unlockTime - IVault(address(vaults[tokenId])).attributes().startTime;
            uint256 timeElapsed = block.timestamp - IVault(address(vaults[tokenId])).attributes().startTime;
            percentageBasedOnTime = uint256((timeElapsed * 100) / totalTime);
        }

        uint256 balance = IVault(address(vaults[tokenId])).getTotalBalance();
        if (balance >= IVault(address(vaults[tokenId])).attributes().targetBalance) {
            percentageBasedOnBalance = 100;
        } else if (IVault(address(vaults[tokenId])).attributes().targetBalance > 0 && balance > 0) {
            percentageBasedOnBalance = uint256((balance * 100) / IVault(address(vaults[tokenId])).attributes().targetBalance);
        }

        // Return the lower value between percentageBasedOnBalance and percentageBasedOnTime
        percentage = percentageBasedOnBalance < percentageBasedOnTime ? percentageBasedOnBalance : percentageBasedOnTime;
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

    /// @dev Runs before every token transfer / mint / burn.
    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal virtual override {
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);
        if (from == address(0)) {
            for (uint256 i = 0; i < ids.length; ++i) {
                totalSupply[ids[i]] += amounts[i];
            }
        }
        if (to == address(0)) {
            for (uint256 i = 0; i < ids.length; ++i) {
                totalSupply[ids[i]] -= amounts[i];
            }
        }
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