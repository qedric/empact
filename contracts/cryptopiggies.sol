// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;
import "@thirdweb-dev/contracts/base/ERC1155Base.sol";
import "@thirdweb-dev/contracts/extension/PrimarySale.sol";
import "@thirdweb-dev/contracts/extension/Permissions.sol";
import "@thirdweb-dev/contracts/lib/CurrencyTransferLib.sol";
import "@thirdweb-dev/contracts/openzeppelin-presets/proxy/utils/Initializable.sol";
import "@thirdweb-dev/contracts/openzeppelin-presets/utils/cryptography/EIP712.sol";
import "@thirdweb-dev/contracts/lib/TWAddress.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./utils.sol";

abstract contract SignaturePiggyMintERC1155 is EIP712, ISignatureMintERC1155 {
    using ECDSA for bytes32;

    bytes32 internal constant TYPEHASH =
        keccak256(
            "MintRequest(address to,uint256 quantity,uint128 validityStartTimestamp,uint128 validityEndTimestamp,string metadata,string uri,uint256 unlockTime,uint256 targetBalance,uint256 tokenId)"
        );

    /// @dev Mapping from mint request UID => whether the mint request is processed.
    mapping(uint256 => bool) private minted;

    constructor() EIP712("SignatureMintERC1155", "1") {}

    /// @dev Verifies that a mint request is signed by an account holding MINTER_ROLE (at the time of the function call).
    function verify(
        MintRequest calldata _req,
        bytes calldata _signature
    ) public view returns (bool success, address signer) {
        signer = _recoverAddress(_req, _signature);
        success = !minted[_req.tokenId] && _canSignMintRequest(signer);
    }

    /// @dev Returns whether a given address is authorized to sign mint requests.
    function _canSignMintRequest(
        address _signer
    ) internal view virtual returns (bool);

    /// @dev Verifies a mint request and marks the request as minted.
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

        minted[_req.tokenId] = true;
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
        string metadata;
        uint256 unlockTime;
        uint256 targetBalance;
        uint256 tokenId;
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
                keccak256(bytes(_req.metadata)),
                _req.unlockTime,
                _req.targetBalance,
                _req.tokenId
            );
    }
}

contract PiggyBank is Initializable, Ownable {
    event Received(address _from, uint _amount);
    event Withdrawal(address who, uint amount, uint balance);

    Attr public attributes;
    uint8 private breakPiggy_fee_Bps = 4;

    function initialize(Attr memory _data) public initializer {
        _setupOwner(msg.sender);
        attributes = _data;
    }

    function payout(
        address recipient,
        uint256 thisOwnerBalance
    ) external onlyOwner {
        require(
            block.timestamp >= attributes.unlockTime,
            "You can't withdraw yet"
        );
        require(
            address(this).balance >= attributes.targetBalance,
            "Piggy is still hungry!"
        );
        require(address(this).balance >= 0, "Piggy has nothing to give!");

        // calculate the amount owed
        uint256 payoutAmount = (address(attributes.piggyBank).balance *
            thisOwnerBalance) / attributes.supply;
        uint256 payoutFee = (payoutAmount * breakPiggy_fee_Bps) / 100;

        // send the withdrawal event and pay the owner
        payable(recipient).transfer(payoutAmount - payoutFee);
        // send the fee to the factory contract owner
        payable(owner()).transfer(payoutFee);

        emit Withdrawal(recipient, payoutAmount, thisOwnerBalance);
    }

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    /// @dev Returns whether owner can be set in the given execution context.
    function _canSetOwner() internal view virtual override returns (bool) {
        return msg.sender == owner();
    }

    function setBreakPiggyBps(uint8 bps) public onlyOwner {
        require(bps <= 9, "Don't be greedy!");
        breakPiggy_fee_Bps = bps;
    }
} 

contract CryptoPiggies is ERC1155Base, PrimarySale, SignaturePiggyMintERC1155, Permissions {
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
        address _primarySaleRecipient
    ) ERC1155Base(_name, _symbol, _royaltyRecipient, _royaltyBps) {
        _setupPrimarySaleRecipient(_primarySaleRecipient);
        _setupRole(MINTER_ROLE, msg.sender);
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

        uint256 tokenIdToMint;
        uint256 nextIdToMint = nextTokenIdToMint();

        // always mint new token ids
        tokenIdToMint = nextIdToMint;
        nextTokenIdToMint_ += 1;

        // Verify and process payload.
        signer = _processRequest(_req, _signature);

        // No need to set royalties - the default supplied to constructor will be used.
        /*if (_req.royaltyRecipient != address(0)) {
            _setupRoyaltyInfoForToken(tokenIdToMint, _req.royaltyRecipient, _req.royaltyBps);
        }*/

        // Collect price
        _collectPriceOnClaim(
            primarySaleRecipient(),
            _req.quantity,
            CurrencyTransferLib.NATIVE_TOKEN,
            makePiggy_fee / _req.quantity
        );

        /*
        struct Attr {
            address owner;
            uint256 tokenId;
            string name;
            uint256 supply;
            string metadata;
            uint256 unlockTime;
            uint256 targetBalance;
            address piggyBank;
        }
        */

        bytes32 salt = bytes32(nextIdToMint);
        Attr memory piglet = Attr(
            address(this),
            nextIdToMint,
            _req.name,
            _req.quantity,
            _req.metadata,
            _req.unlockTime,
            _req.targetBalance,
            address(0x0)
        );
        // deploy a separate proxy contract to hold the token's ETH; add its address to the attributes
        piglet.piggyBank = _deployProxyByImplementation(piglet, salt);

        // Set token data
        _attributes[tokenIdToMint] = piglet;

        // Mint tokens.
        _mint(signer, tokenIdToMint, _req.quantity, "");

        emit TokensMintedWithSignature(signer, tokenIdToMint, _req);

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
            (
                abi.encodeWithSignature(
                    "initialize(Attr)",
                    msg.sender,
                    _piggyData
                )
            )
        );
    }

    function payout(uint256 tokenId) external {
        Attr memory attributes = _attributes[tokenId];

        require(attributes.supply != 0, "Token data not found");

        uint256 thisOwnerBalance = balanceOf[msg.sender][tokenId];

        require(thisOwnerBalance != 0, "You must be an owner to withdraw!");

        TWAddress.functionCall(
            attributes.piggyBank,
            (
                abi.encodeWithSignature(
                    "payout(address, uint256)",
                    msg.sender,
                    thisOwnerBalance
                )
            )
        );
        // burn the tokens so the owner can't claim twice:
        _burn(msg.sender, tokenId, thisOwnerBalance);
        _attributes[tokenId].supply -= thisOwnerBalance;
    }

    function uri(uint256 tokenId) public view override returns (string memory) {
        require(tokenId == 0, "tokenId must be 0");
        return
            string(
                abi.encodePacked(
                    "data:application/json;base64,",
                    Base64.encode(
                        bytes(
                            string(
                                abi.encodePacked(
                                    '{"name": "',
                                    _attributes[tokenId].name,
                                    '",',
                                    '"image_data": "',
                                    Utils.getSvg(
                                        _attributes[tokenId].name,
                                        _attributes[tokenId].piggyBank,
                                        _attributes[tokenId].targetBalance,
                                        _attributes[tokenId].unlockTime
                                    ),
                                    '",',
                                    '"attributes": [{"trait_type": "Manturity Date", "value": ',
                                    Utils.uint2str(
                                        _attributes[tokenId].unlockTime
                                    ),
                                    "},",
                                    '{"trait_type": "Target Balance", "value": ',
                                    Utils.uint2str(
                                        _attributes[tokenId].targetBalance /
                                            1 ether
                                    ),
                                    "},",
                                    '{"trait_type": "Receive Address", "value": ',
                                    Utils.toAsciiString(
                                        address(_attributes[tokenId].piggyBank)
                                    ),
                                    "},",
                                    _attributes[tokenId].metadata,
                                    "]}"
                                )
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
        return _signer == owner();
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
    function _collectPriceOnClaim(
        address _primarySaleRecipient,
        uint256 _quantityToClaim,
        address _currency,
        uint256 _pricePerToken
    ) internal virtual {
        if (_pricePerToken == 0) {
            return;
        }

        uint256 totalPrice = _quantityToClaim * _pricePerToken;

        if (_currency == CurrencyTransferLib.NATIVE_TOKEN) {
            require(msg.value == totalPrice, "Must send total price.");
        }

        address saleRecipient = _primarySaleRecipient == address(0)
            ? primarySaleRecipient()
            : _primarySaleRecipient;
        CurrencyTransferLib.transferCurrency(
            _currency,
            msg.sender,
            saleRecipient,
            totalPrice
        );
    }
}