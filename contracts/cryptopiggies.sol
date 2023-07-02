// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;
import { ERC1155 } from "@thirdweb-dev/contracts/eip/ERC1155.sol";

import "@thirdweb-dev/contracts/extension/ContractMetadata.sol";
import "@thirdweb-dev/contracts/extension/Royalty.sol";
import "@thirdweb-dev/contracts/extension/DefaultOperatorFilterer.sol";
import "@thirdweb-dev/contracts/extension/PermissionsEnumerable.sol";
import "@thirdweb-dev/contracts/lib/CurrencyTransferLib.sol";
import "@thirdweb-dev/contracts/openzeppelin-presets/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "./utils.sol";
import "./piggybank.sol";

abstract contract SignaturePiggyMintERC1155 is EIP712, ISignatureMintERC1155 {
    using ECDSA for bytes32;

    bytes32 internal constant TYPEHASH =
        keccak256(
            "MintRequest(address to,uint256 quantity,uint128 validityStartTimestamp,uint128 validityEndTimestamp,string name,string description,string externalUrl,string metadata,uint256 unlockTime,uint256 targetBalance)"
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
        string externalUrl;
        string metadata;
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
                keccak256(bytes(_req.externalUrl)),
                keccak256(bytes(_req.metadata)),
                _req.unlockTime,
                _req.targetBalance
            );
    }
} 

contract CryptoPiggies is 
    ERC1155,
    ContractMetadata,
    Royalty,
    DefaultOperatorFilterer, 
    SignaturePiggyMintERC1155,
    PermissionsEnumerable,
    ICPFactory
{

    struct Colours {
        bytes3 bg;
        bytes3 fg;
        bytes3 pbg;
        bytes3 pfg;
    }

    /*//////////////////////////////////////////////////////////////
                        Events
    //////////////////////////////////////////////////////////////*/

    event PiggyBankDeployed(address indexed piggyBank, address indexed msgSender);
    event FeeRecipientUpdated(address indexed recipient);
    event MakePiggyFeeUpdated(uint256 fee);
    event BreakPiggyBpsUpdated(uint16 bps);
    event PiggyBankImplementationUpdated(address indexed implementation);
    event OriginProtocolTokenUpdated(address oldAddress, address newAddress);
    event SupportedTokenAdded(address tokenAddress);
    event SupportedTokenRemoved(address tokenAddress);

    /*//////////////////////////////////////////////////////////////
                        State variables
    //////////////////////////////////////////////////////////////*/

    /// @dev The tokenId of the next NFT to mint.
    uint256 internal nextTokenIdToMint_;

    /// @notice This role is required to mint.
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @notice The fee to create a new Piggy.
    uint256 public makePiggyFee = 0.004 ether;

    /// @notice The fee deducted with each withdrawal from a piggybank, in basis points
    uint16 public breakPiggyFeeBps = 400;

    /// @notice The PiggyBank implementation contract that is cloned for each new piggy
    IPiggyBank public piggyBankImplementation;

    /// @notice The address that receives all fees.
    address payable public feeRecipient;

    /// @notice the colours used to generate the SVG
    Colours public svgColours;

    /// @notice the address of Origin Protocol OETH token
    address payable public oETHTokenAddress;

    /*//////////////////////////////////////////////////////////////
                        Mappings & Arrays
    //////////////////////////////////////////////////////////////*/

    /**
     *  @notice Returns the total supply of NFTs of a given tokenId
     *  @dev Mapping from tokenId => total circulating supply of NFTs of that tokenId.
     */
    mapping(uint256 => uint256) public totalSupply;

    /// @dev Stores the info for each piggy
    mapping(uint256 => IPiggyBank.Attr) internal _attributes;

    /// @dev PiggyBanks are mapped to the tokenId of the NFT they are tethered to
    mapping(uint256 => address) public piggyBanks;

    /// @dev keep track of used signatures so they can only be used once.
    mapping(bytes32 => bool) private usedSignatures;

    /// @notice the addresses of tokens that will count toward the ETH balance
    /// @notice this is intended to contain supported ETH PoS Liquid Staking tokens only.
    mapping(address => uint256) public supportedTokensIndex;
    address[] private supportedTokens;

    /*//////////////////////////////////////////////////////////////
                        Modifiers
    //////////////////////////////////////////////////////////////*/

    /// @notice checks to ensure that the token exists before referencing it
    modifier tokenExists(uint256 tokenId) {
        require(totalSupply[tokenId] > 0, "Token data not found");
        _;
    }

    modifier onlyAdmin() {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender));
        _; 
    }

    /*//////////////////////////////////////////////////////////////
                            Constructor
    //////////////////////////////////////////////////////////////*/
    constructor(
        string memory _name,
        string memory _symbol,
        address _royaltyRecipient,
        uint128 _royaltyBps,
        address payable _feeRecipient
    ) ERC1155(_name, _symbol) {
        _setupDefaultRoyaltyInfo(_royaltyRecipient, _royaltyBps);
        _setOperatorRestriction(true);
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(MINTER_ROLE, msg.sender);
        feeRecipient = _feeRecipient;
        svgColours = Colours(
            0xc1bfb3, // bg
            0xf0b5d2, // fg
            0x332429, // pbg
            0xbf3a23  // pfg
        );
    }

    /*//////////////////////////////////////////////////////////////
                    Overriden metadata logic - On-chain
    //////////////////////////////////////////////////////////////*/
    function uri(uint256 tokenId) public view override tokenExists(tokenId) returns (string memory) {
        return string(
            abi.encodePacked(
                "data:application/json;base64,",
                Base64.encode(
                    bytes(
                        abi.encodePacked(
                            '{"name":"',
                            _attributes[tokenId].name,
                            '","description":"',
                            _attributes[tokenId].description,
                            '","image_data":"',
                            CP_Utils_v2.generateSVG(
                                svgColours.bg,
                                svgColours.fg,
                                svgColours.pbg,
                                svgColours.pfg,
                                _getPercentage(tokenId)
                            ),
                            '","external_url":"',
                            _attributes[tokenId].externalUrl,
                            '","attributes":[{"display_type":"date","trait_type":"Maturity Date","value":',
                            CP_Utils_v2.uint2str(
                                _attributes[tokenId].unlockTime
                            ),
                            '},{"trait_type":"Target Balance","value":"',
                            CP_Utils_v2.convertWeiToEthString(_attributes[tokenId].targetBalance),
                            ' ETH"},{"trait_type":"Receive Address","value":"',
                            CP_Utils_v2.toAsciiString(
                                address(piggyBanks[tokenId])
                            ),
                            '"}',
                            _attributes[tokenId].metadata,
                            ']}'
                        )
                    )   
                )
            )
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

        bytes32 signatureHash = keccak256(abi.encodePacked(_encodeRequest(_req), _signature));
        require(!usedSignatures[signatureHash], "Signature already used");

        // Verify and process payload.
        signer = _processRequest(_req, _signature);

        // Mark the signature as used
        usedSignatures[signatureHash] = true;

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
            string externalUrl;
            string metadata;
        }
        */
        IPiggyBank.Attr memory piglet = IPiggyBank.Attr(
            tokenIdToMint,
            _req.unlockTime,
            block.timestamp,
            _req.targetBalance,
            _req.name,
            _req.description,
            _req.externalUrl,
            _req.metadata
        );

        // Set token data
        _attributes[tokenIdToMint] = piglet;
    
        // deploy a separate proxy contract to hold the token's ETH; add its address to the attributes
        piggyBanks[tokenIdToMint] = _deployProxyByImplementation(piglet, bytes32(tokenIdToMint));

        // Mint tokens.
        emit TokensMintedWithSignature(signer, _req.to, tokenIdToMint);
        _mint(_req.to, tokenIdToMint, _req.quantity, "");
        
        // Collect price
        _collectMakePiggyFee(); 
    }

    /// @dev Every time a new token is minted, a PiggyBank proxy contract is deployed to hold the funds
    function _deployProxyByImplementation(
        IPiggyBank.Attr memory _piggyData,
        bytes32 _salt
    ) internal returns (address deployedProxy) {

        bytes32 salthash = keccak256(abi.encodePacked(msg.sender, _salt));
        deployedProxy = Clones.cloneDeterministic(
            address(piggyBankImplementation),
            salthash
        );

        IPiggyBank(deployedProxy).initialize(_piggyData, breakPiggyFeeBps);

        emit PiggyBankDeployed(deployedProxy, msg.sender);
    }

    /// @notice Lets an NFT owner withdraw their proportion of funds once the piggyBank is unlocked
    function payout(uint256 tokenId) tokenExists(tokenId) external {

        uint256 thisOwnerBalance = balanceOf[msg.sender][tokenId];

        require(thisOwnerBalance != 0, "Not authorised!");

        // get the total supply before burning
        uint256 totalSupplyBeforePayout = totalSupply[tokenId];

        // burn the tokens so the owner can't claim twice
        _burn(msg.sender, tokenId, thisOwnerBalance);

        try PiggyBank(payable(piggyBanks[tokenId])).payout{value: 0}(
            msg.sender,
            feeRecipient,
            thisOwnerBalance,
            totalSupplyBeforePayout,
            supportedTokens
        ) {
            
        } catch Error(string memory reason) {
            revert(reason);
        } catch (bytes memory /*lowLevelData*/) {
            revert("payout failed");
        }
    }

    /*//////////////////////////////////////////////////////////////
                       Configuration
    //////////////////////////////////////////////////////////////*/

    receive() external payable {
        require(false, "Do not send ETH to this contract");
    }

    /// @notice Sets the fee for creating a new piggyBank
    function setMakePiggyFee(uint256 fee) external onlyAdmin {
        emit MakePiggyFeeUpdated(fee);
        makePiggyFee = fee;
    }

    /// @notice Sets the fee for withdrawing the funds from a PiggyBank - does not affect existing piggyBanks
    function setBreakPiggyBps(uint16 bps) external onlyAdmin {
        require(bps <= 900, "Don't be greedy!");
        emit BreakPiggyBpsUpdated(bps);
        breakPiggyFeeBps = bps;
    }

    /**
     *  @notice         Updates recipient of make & break piggy fees.
     *  @param _feeRecipient   Address to be set as new recipient of primary sales.
     */
    function setFeeRecipient(address payable _feeRecipient) external onlyAdmin {
        feeRecipient = _feeRecipient;
        emit FeeRecipientUpdated(_feeRecipient);
    }

    /**
     *  @notice         Sets an implementation for the piggyBank clones.
     *                  ** Must be run after deployment! **
     */
    function setPiggyBankImplementation(IPiggyBank _piggyBankImplementation) external onlyAdmin {
        emit PiggyBankImplementationUpdated(address(_piggyBankImplementation));
        piggyBankImplementation = _piggyBankImplementation;
    }

    /**
     * @dev Sets the SVG colours.
     * @param bg Background colour.
     * @param fg Foreground colour.
     * @param pbg Piggy background colour.
     * @param pfg Piggy foreground colour.
     */
    function setSvgColours(bytes3 bg, bytes3 fg, bytes3 pbg, bytes3 pfg) public onlyAdmin {
        svgColours = Colours(bg, fg, pbg, pfg);
    }

    /**
     *  @notice         Set the contract address for Origin Protocol staked token
     */
    function setOETHContractAddress(address payable _oETHTokenAddress) external onlyAdmin {
        emit OriginProtocolTokenUpdated(address(oETHTokenAddress), address(_oETHTokenAddress));
        oETHTokenAddress = _oETHTokenAddress;
    }

    function getSupportedTokens() external view returns(address[] memory) {
        return supportedTokens;
    }

    /**
     *  @notice         Add a supported token address
     */
    function addSupportedToken(address token) external onlyAdmin {
        require(supportedTokensIndex[token] == 0, "Address already exists");
        supportedTokens.push(token);
        supportedTokensIndex[token] = supportedTokens.length;
        emit SupportedTokenAdded(address(token));
    }

    /**
     *  @notice         Remove a supported token address
     */
    function removeSupportedToken(address token) external onlyAdmin {
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

    /// @notice returns the lower of % of target balance or % of time left to unlock
    function percentComplete(uint256 tokenId) external view tokenExists(tokenId) returns (uint8) {
        return uint8(_getPercentage(tokenId));
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
    function _getPercentage(uint256 tokenId) internal view returns (uint256 percentage) {

        uint256 balance = address(piggyBanks[tokenId]).balance;

        // First calculate the percentage of targetBalance
        uint256 percentageBasedOnTime;
        if (block.timestamp >= _attributes[tokenId].unlockTime) {
            percentageBasedOnTime = 100;
        } else {
            uint256 totalTime = _attributes[tokenId].unlockTime - _attributes[tokenId].startTime;
            uint256 timeElapsed = block.timestamp - _attributes[tokenId].startTime;
            percentageBasedOnTime = uint256((timeElapsed * 100) / totalTime);
        }
        
        uint256 percentageBasedOnBalance;
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
    function _collectMakePiggyFee() internal virtual {
        if (makePiggyFee == 0) {
            return;
        }

        require(msg.value == makePiggyFee, "Must send the correct fee");
        
        CurrencyTransferLib.transferCurrency(
            CurrencyTransferLib.NATIVE_TOKEN,
            msg.sender,
            feeRecipient,
            makePiggyFee
        );
    }
}