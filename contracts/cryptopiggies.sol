// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;
import "@thirdweb-dev/contracts/base/ERC1155Base.sol";
import "@thirdweb-dev/contracts/extension/PrimarySale.sol";
import "@thirdweb-dev/contracts/extension/PermissionsEnumerable.sol";
import "@thirdweb-dev/contracts/lib/CurrencyTransferLib.sol";
import "@thirdweb-dev/contracts/openzeppelin-presets/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./utils.sol";

abstract contract SignaturePiggyMintERC1155 is EIP712, ISignatureMintERC1155 {
    using ECDSA for bytes32;

    bytes32 internal constant TYPEHASH =
        keccak256(
            "MintRequest(address to,uint256 quantity,uint128 validityStartTimestamp,uint128 validityEndTimestamp,string name,string external_url,string metadata,uint256 unlockTime,uint256 targetBalance)"
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
    ) internal returns (address signer) {
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
        string external_url;
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
                keccak256(bytes(_req.external_url)),
                keccak256(bytes(_req.metadata)),
                _req.unlockTime,
                _req.targetBalance
            );
    }
} 

contract CryptoPiggies is ERC1155Base, PrimarySale, SignaturePiggyMintERC1155, PermissionsEnumerable {
    event PiggyCreated(address);

    event ProxyDeployed(
        address piggyBankImplementation,
        address deployedProxy,
        address msgSender
    );

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    uint256 private makePiggy_fee = 0.004 ether;
    address internal _piggyBankImplementation;
    mapping(uint256 => Attr) internal _attributes;

    constructor(
        string memory _name,
        string memory _symbol,
        address _royaltyRecipient,
        uint128 _royaltyBps,
        address _primarySaleRecipient,
        address __piggyBankImplementation
    ) ERC1155Base(_name, _symbol, _royaltyRecipient, _royaltyBps) {
        _setupPrimarySaleRecipient(_primarySaleRecipient);
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(MINTER_ROLE, msg.sender);
        _piggyBankImplementation = __piggyBankImplementation;
    }

    function mintTo(
        address _to,
        uint256 _tokenId,
        string memory _tokenURI,
        uint256 _amount
    ) public override {
        require(false, "Use mintWithSignature.");
    }

    function batchMintTo(
        address _to,
        uint256[] memory _tokenIds,
        uint256[] memory _amounts,
        string memory _baseURI
    ) public override {
        require(false, "Use mintWithSignature.");
    }

    function mintWithSignature(
        MintRequest calldata _req,
        bytes calldata _signature
    ) external payable returns (address signer) {
        require(_req.quantity > 0, "Minting zero tokens.");
        require(
            block.timestamp < _req.unlockTime || _req.targetBalance > 0,
            "Unlock time should be in the future, or target balance greater than 0"
        );

        // always mint new token ids
        uint256 tokenIdToMint = nextTokenIdToMint();
        nextTokenIdToMint_ += 1;

        // Verify and process payload.
        signer = _processRequest(_req, _signature);

        // Collect price
        _collectMakePiggyFee(primarySaleRecipient());

        /*
        struct Attr {
            address owner;
            uint256 tokenId;
            string name;
            string external_url;
            string metadata;
            uint256 unlockTime;
            uint256 targetBalance;
            address piggyBank;
        }
        */
        Attr memory piglet = Attr(
            address(this),
            tokenIdToMint,
            _req.name,
            _req.external_url,
            _req.metadata,
            _req.unlockTime,
            _req.targetBalance,
            address(0x0)
        );

        bytes32 salt = bytes32(tokenIdToMint);
        
        // deploy a separate proxy contract to hold the token's ETH; add its address to the attributes
        piglet.piggyBank = _deployProxyByImplementation(piglet, salt);

        // Set token data
        _attributes[tokenIdToMint] = piglet;

        // Mint tokens.
        _mint(_req.to, tokenIdToMint, _req.quantity, "");

        emit TokensMintedWithSignature(signer, _req.to, tokenIdToMint, _req);

    }

    function _deployProxyByImplementation(
        Attr memory _piggyData,
        bytes32 _salt
    ) internal returns (address deployedProxy) {

        bytes32 salthash = keccak256(abi.encodePacked(msg.sender, _salt));
        deployedProxy = Clones.cloneDeterministic(
            _piggyBankImplementation,
            salthash
        );

        emit ProxyDeployed(_piggyBankImplementation, deployedProxy, msg.sender);

        TWAddress.functionCall(
            deployedProxy,
            abi.encodeWithSignature(
                "initialize(Attr)",
                _piggyData
            )
        );
    }

    function payout(uint256 tokenId) external {
        require(totalSupply[tokenId] != 0, "Token data not found");

        uint256 thisOwnerBalance = balanceOf[msg.sender][tokenId];

        require(thisOwnerBalance != 0, "You must be an owner to withdraw!");

        (bool success, bytes memory returndata) = _attributes[tokenId].piggyBank.call{ value: 0 }(
            abi.encodeWithSignature(
                "payout(address, uint256, uint256)",
                msg.sender,
                thisOwnerBalance,
                totalSupply[tokenId]
            )
        );

        if (success) {
            // burn the tokens so the owner can't claim twice:
            _burn(msg.sender, tokenId, thisOwnerBalance);
        } else {
            // Look for revert reason and bubble it up if present
            if (returndata.length > 0) {
                // The easiest way to bubble the revert reason is using memory via assembly
                assembly {
                    let returndata_size := mload(returndata)
                    revert(add(32, returndata), returndata_size)
                }
            } else {
                revert("payout failed");
            }
        }
    }

    function uri(uint256 tokenId) public view override returns (string memory) {
        return string(
            abi.encodePacked(
                "data:application/json;base64,",
                Base64.encode(
                    bytes(
                        abi.encodePacked(
                            '{"name": "',
                            _attributes[tokenId].name,
                            '","image_data": "',
                            Utils.getSvg(
                                _attributes[tokenId].name,
                                _attributes[tokenId].piggyBank,
                                _attributes[tokenId].targetBalance,
                                _attributes[tokenId].unlockTime
                            ),
                            '","external_url":"',
                            _attributes[tokenId].external_url,
                            '","attributes": [{"display_type": "date","trait_type": "Maturity Date", "value": ',
                            Utils.uint2str(
                                _attributes[tokenId].unlockTime
                            ),
                            '},"{"trait_type": "Target Balance", "value": "',
                            Utils.uint2str(
                                _attributes[tokenId].targetBalance /
                                    1 ether
                            ),
                            ' ETH"},"{"trait_type": "Receive Address", "value": "',
                            address(_attributes[tokenId].piggyBank),
                            '"}',
                            _attributes[tokenId].metadata,
                            "]}"
                        )
                    )   
                )
            )
        );
    }

    /*//////////////////////////////////////////////////////////////
                            Internal functions
    //////////////////////////////////////////////////////////////*/

    /// @dev Returns whether a given address is authorized to sign mint requests.
    function _canSignMintRequest(
        address _signer
    ) internal view virtual override returns (bool) {
        return hasRole(MINTER_ROLE, _signer);
    }

    /// @dev Returns whether primary sale recipient can be set in the given execution context.
    function _canSetPrimarySaleRecipient()
        internal
        view
        virtual
        override
        returns (bool)
    {
        return msg.sender == owner();
    }

    /// @dev Collects and distributes the primary sale value of NFTs being claimed.
    function _collectMakePiggyFee(
        address _primarySaleRecipient
    ) internal virtual {
        if (makePiggy_fee == 0) {
            return;
        }

        require(msg.value == makePiggy_fee, "Must send the fee");
        
        address saleRecipient = _primarySaleRecipient == address(0)
            ? primarySaleRecipient()
            : _primarySaleRecipient;
        CurrencyTransferLib.transferCurrency(
            CurrencyTransferLib.NATIVE_TOKEN,
            msg.sender,
            saleRecipient,
            makePiggy_fee
        );
    }
}