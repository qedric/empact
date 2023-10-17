// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;
import { ERC1155 } from "@thirdweb-dev/contracts/eip/ERC1155.sol";

import "@thirdweb-dev/contracts/extension/ContractMetadata.sol";
import "@thirdweb-dev/contracts/extension/Royalty.sol";
import "@thirdweb-dev/contracts/extension/DefaultOperatorFilterer.sol";
import "@thirdweb-dev/contracts/openzeppelin-presets/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@fund.sol";
import "@IGenerator.sol";
import "@ITreasury.sol";
import "@ISignatureMint.sol";

abstract contract SignatureMint is EIP712, ISignatureMint {
    using ECDSA for bytes32;

    bytes32 internal constant TYPEHASH =
        keccak256(
            "MintRequest(address to,uint256 quantity,uint128 validityStartTimestamp,uint128 validityEndTimestamp,string name,string description,uint256 unlockTime,uint256 targetBalance)"
        );

    constructor() EIP712("SignatureMintERC1155", "1") {}

    /// @dev Verifies that a mint request is signed by an account holding MINTER_ROLE (at the time of the function call).
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
        uint256 quantity;
        uint128 validityStartTimestamp;
        uint128 validityEndTimestamp;
        string name;
        string description;
        uint256 unlockTime;
        uint256 targetBalance;
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
                _req.quantity,
                _req.validityStartTimestamp,
                _req.validityEndTimestamp,
                keccak256(bytes(_req.name)),
                keccak256(bytes(_req.description)),
                _req.unlockTime,
                _req.targetBalance
            );
    }
} 

contract Factory is
    ERC1155,
    ContractMetadata,
    Royalty,
    DefaultOperatorFilterer,
    SignatureMint,
    AccessControl
{

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /*//////////////////////////////////////////////////////////////
    Events
    //////////////////////////////////////////////////////////////*/

    event FundDeployed(address indexed fund, address indexed msgSender);
    event FeeRecipientUpdated(address indexed recipient);
    event MakeFundFeeUpdated(uint256 fee);
    event BreakFundBpsUpdated(uint16 bps);
    event FundImplementationUpdated(address indexed implementation);
    event GeneratorUpdated(address indexed generator);

    /*//////////////////////////////////////////////////////////////
    State variables
    //////////////////////////////////////////////////////////////*/

    /// @dev The tokenId of the next NFT to mint.
    uint256 internal nextTokenIdToMint_;

    /// @dev prefix for the token url
    string private _tokenUrlPrefix = 'https://cryptopiggies.io/';

    /// @notice The fee to create a new Fund.
    uint256 public makeFundFee = 0.004 ether;

    /// @notice The fee deducted with each withdrawal from a fund, in basis points
    uint16 public breakFundFeeBps = 400;

    /// @notice The Fund implementation contract that is cloned for each new fund
    IFund public fundImplementation;

    /// @notice The contract that generates the on-chain metadata
    IFundGenerator public generator;

    /// @notice The contract that handles open funds
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

    /// @dev Funds are mapped to the tokenId of the NFT they are tethered to
    mapping(uint256 => address) public funds;

    /*//////////////////////////////////////////////////////////////
    Modifiers
    //////////////////////////////////////////////////////////////*/

    /// @notice checks to ensure that the token exists before referencing it
    modifier tokenExists(uint256 tokenId) {
        require(totalSupply[tokenId] > 0, "Token data not found");
        _;
    }

    /*//////////////////////////////////////////////////////////////
    Constructor
    //////////////////////////////////////////////////////////////*/
    constructor(
        string memory _name,
        string memory _symbol,
        address payable _feeRecipient,
        uint128 _royaltyBps,
        address _roles
    ) ERC1155(_name, _symbol) {
        _setupDefaultRoyaltyInfo(_feeRecipient, _royaltyBps);
        _setOperatorRestriction(true);
        feeRecipient = _feeRecipient;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
    }

    /*//////////////////////////////////////////////////////////////
    Overriden metadata logic - On-chain
    //////////////////////////////////////////////////////////////*/
    function uri(uint256 tokenId) public view override tokenExists(tokenId) returns (string memory) {
        return generator.uri(
            IFund(address(funds[tokenId]).attributes(),
            address(funds[tokenId]),
            _getPercent(tokenId),
            IFund(address(funds[tokenId])).getTotalBalance(),
            _tokenUrlPrefix,
            tokenId
        );
    }

    /*//////////////////////////////////////////////////////////////
    Mint / burn logic
    //////////////////////////////////////////////////////////////*/

    /**
     *  @notice          Lets an authorized address mint NFTs to a recipient, via signed mint request
     *  @dev             - The logic in the `_canSignMintRequest` function determines whether the caller is authorized to mint NFTs.
     *
     *  @param _req      The signed mint request.
     *  @param _signature  The signature of an address with the MINTER role.
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
        IFund.Attr memory fundData = IFund.Attr(
            tokenIdToMint,
            _req.unlockTime,
            block.timestamp,
            _req.targetBalance,
            _req.name,
            _req.description
        );

        // Set token data
        _attributes[tokenIdToMint] = fundData;
    
        // deploy a separate proxy contract to hold the token's ETH; add its address to the attributes
        funds[tokenIdToMint] = _deployProxyByImplementation(fundData, bytes32(tokenIdToMint));

        // Mint tokens.
        emit TokensMintedWithSignature(signer, _req.to, tokenIdToMint);
        _mint(_req.to, tokenIdToMint, _req.quantity, "");
        
        // Collect price
        _collectMakeFundFee(); 
    }

    /// @dev Every time a new token is minted, a Fund proxy contract is deployed to hold the funds
    function _deployProxyByImplementation(
        IFund.Attr memory _fundData,
        bytes32 _salt
    ) internal returns (address deployedProxy) {

        bytes32 salthash = keccak256(abi.encodePacked(msg.sender, _salt));
        deployedProxy = Clones.cloneDeterministic(
            address(fundImplementation),
            salthash
        );

        IFund(deployedProxy).initialize(_fundData, breakFundFeeBps);

        // register the fund with the treasury
        treasury.lockedFunds.addLockedFund(deployedProxy)

        emit FundDeployed(deployedProxy, msg.sender);
    }

    /// @dev If sender balance > 0 then burn sender balance and call payout function in the fund contract
    function payout(uint256 tokenId) external tokenExists(tokenId) {

        uint256 thisOwnerBalance = balanceOf[msg.sender][tokenId];

        require(thisOwnerBalance != 0, "Not authorised!");

        // get the total supply before burning
        uint256 totalSupplyBeforePayout = totalSupply[tokenId];

        // burn the tokens so the owner can't claim twice
        _burn(msg.sender, tokenId, thisOwnerBalance);

        try IFund(payable(funds[tokenId])).payout{value: 0} (
            msg.sender,
            feeRecipient,
            thisOwnerBalance,
            totalSupplyBeforePayout
        ) returns (uint8 state) {
            if (state == 2) {
                // fund is now open; update the treasury
                treasury.moveToOpenFund(address(funds[tokenId]));
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
        _tokenUrlPrefix = tokenUrlPrefix;
    }

    /// @notice Sets the fee for creating a new fund
    function setMakeFundFee(uint256 fee) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit MakeFundFeeUpdated(fee);
        makeFundFee = fee;
    }

    /// @notice Sets the fee for withdrawing the funds from a Fund - does not affect existing funds
    function setBreakFundBps(uint16 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(bps <= 900, "Don't be greedy!");
        emit BreakFundBpsUpdated(bps);
        breakFundFeeBps = bps;
    }

    /**
     *  @notice         Updates recipient of make & break fund fees
     *  @param _feeRecipient   Address to be set as new recipient of primary sales.
     */
    function setFeeRecipient(address payable _feeRecipient) external onlyRole(DEFAULT_ADMIN_ROLE) {
        feeRecipient = _feeRecipient;
        emit FeeRecipientUpdated(_feeRecipient);
    }

    /**
     *  @notice         Sets an implementation for the fund clones
     *                  ** Ensure this is called before using this contract! **
     */
    function setFundImplementation(IFund _fundImplementationAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit FundImplementationUpdated(address(_fundImplementationAddress));
        fundImplementation = _fundImplementationAddress;
    }

    /**
     *  @notice         Sets an implementation for generator contract
     *                  This allows us to change the metadata and artwork of the NFTs
     */
    function setGenerator(IFundGenerator _generatorAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
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

    function grantMinterRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(MINTER_ROLE, account);
    }

    function revokeMinterRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        revokeRole(MINTER_ROLE, account);
    }

    /*//////////////////////////////////////////////////////////////
    ERC165 Logic
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns whether this contract supports the given interface.
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC1155, IERC165) returns (bool) {
        return
            interfaceId == 0x01ffc9a7 || // ERC165 Interface ID for ERC165
            interfaceId == 0xd9b67a26 || // ERC165 Interface ID for ERC1155
            interfaceId == 0x0e89341c || // ERC165 Interface ID for ERC1155MetadataURI
            interfaceId == type(IERC2981).interfaceId; // ERC165 ID for ERC2981
    }

    /*//////////////////////////////////////////////////////////////
    View functions
    //////////////////////////////////////////////////////////////*/

    /// @notice The tokenId assigned to the next new NFT to be minted.
    function nextTokenIdToMint() public view virtual returns (uint256) {
        return nextTokenIdToMint_;
    }

    /*//////////////////////////////////////////////////////////////
    ERC-1155 overrides
    //////////////////////////////////////////////////////////////*/

    /// @dev See {ERC1155-setApprovalForAll}
    function setApprovalForAll(address operator, bool approved)
        public
        override(ERC1155)
        onlyAllowedOperatorApproval(operator)
    {
        super.setApprovalForAll(operator, approved);
    }

    /**
     * @dev See {IERC1155-safeTransferFrom}.
     */
    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) public override(ERC1155) onlyAllowedOperator(from) {
        super.safeTransferFrom(from, to, id, amount, data);
    }

    /**
     * @dev See {IERC1155-safeBatchTransferFrom}.
     */
    function safeBatchTransferFrom(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) public override(ERC1155) onlyAllowedOperator(from) {
        super.safeBatchTransferFrom(from, to, ids, amounts, data);
    }

    /*//////////////////////////////////////////////////////////////
    Internal / overrideable functions
    //////////////////////////////////////////////////////////////*/

    /// @dev calculates the percentage towards unlock based on time and target balance
    function _getPercent(uint256 tokenId) internal view returns (uint256 percentage) {

        uint256 percentageBasedOnTime;
        uint256 percentageBasedOnBalance;

        if (block.timestamp >= _attributes[tokenId].unlockTime) {
            percentageBasedOnTime = 100;
        } else {
            uint256 totalTime = _attributes[tokenId].unlockTime - _attributes[tokenId].startTime;
            uint256 timeElapsed = block.timestamp - _attributes[tokenId].startTime;
            percentageBasedOnTime = uint256((timeElapsed * 100) / totalTime);
        }

        uint256 balance = IFund(address(funds[tokenId])).getTotalBalance();
        if (balance >= _attributes[tokenId].targetBalance) {
            percentageBasedOnBalance = 100;
        } else if (_attributes[tokenId].targetBalance > 0 && balance > 0) {
            percentageBasedOnBalance = uint256((balance * 100) / _attributes[tokenId].targetBalance);
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
        return hasRole(MINTER_ROLE, _signer);
    }

    /// @dev Returns whether royalty info can be set in the given execution context.
    function _canSetRoyaltyInfo() internal view virtual override returns (bool) {
        return hasRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /// @dev Returns whether operator restriction can be set in the given execution context.
    function _canSetOperatorRestriction() internal virtual override returns (bool) {
        return hasRole(DEFAULT_ADMIN_ROLE, msg.sender);
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
    function _collectMakeFundFee() internal virtual {
        if (makeFundFee == 0) {
            return;
        }
        require(msg.value == makeFundFee, "Must send the correct fee");
        feeRecipient.transfer(msg.value);
    }
}