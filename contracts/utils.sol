// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.11;
import "@openzeppelin/contracts/utils/Base64.sol";

struct Colours {
    bytes3 fbg;
    bytes3 bg;
    bytes3 fg;
    bytes3 pbg;
    bytes3 pfg;
}

interface ISignatureMintERC1155 { 
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

library CP_Utils_v2 {

    function generateSVG(bytes3 fbg, bytes3 bg, bytes3 fg, bytes3 pbg, bytes3 pfg, uint256 percent) public pure returns (bytes memory) {

        // Build the SVG string using the percentage and the colors
        return abi.encodePacked(
            "data:image/svg+xml;base64,",
            Base64.encode(bytes(string(
                abi.encodePacked(
                    '<svg id="Ebene_1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080"><defs><style>.cls-1{fill:#',
                    _bytes3ToHexString(percent == 100 ? fbg : bg),
                    ';}.cls-2{fill:#',
                    _bytes3ToHexString(fg),
                    ';}.cls-3{fill:#',
                    _bytes3ToHexString(pbg),
                    ';}.cls-4{fill:#',
                    _bytes3ToHexString(pfg),
                    ';}</style></defs><rect class="cls-2" y="0" width="1080" height="1080"/><rect class="cls-1" y="',
                    uint2str(10800 - (108 * percent)),
                    '" width="1080" height="',
                    uint2str((1080 * percent) / 100),
                    '"/><path class="cls-4" d="m536.13,889.18c-83.07-5.83-163.6-33.51-234.74-89.69-49.89-39.42-79.54-91.78-106.16-147.49-17.86-37.36-23.35-76.95-26.07-117.28-4.63-68.32,9.94-132.28,48.51-189.16,14.06-20.71,31.04-40.23,49.74-56.78,35.63-31.52,74.72-59.75,120.18-74.31,51.64-16.51,104.18-29.11,160.07-25.54,45.1,2.87,89.71,6.19,133.15,18.59,72.96,20.83,131.82,61.03,171.22,127.6,26.85,45.39,45.26,93.98,54.54,145.78,10.41,58.08,5.03,114.13-17.63,169.63-18.52,45.36-42.42,86.31-74.66,122.71-43.35,48.93-98.71,77.88-160.33,96.1-36.4,10.76-73.43,18.21-117.83,19.85"/><path class="cls-3" d="m783.12,513.76c-.95,50.12-45.99,96.71-96.96,98.59-59.39,2.17-104.4-32.33-116.86-67.57-11.65-32.9-13.83-76.75,18.19-107.52,34.97-33.59,73.23-47.55,120.55-34.71,27.83,7.55,47.1,25.83,60.12,50.09,9.99,18.62,17.94,38.79,14.97,61.11"/><path class="cls-3" d="m424.53,608.1c-50.46,7.02-108.91-56.43-110.22-102.51-1.81-64.03,55.07-117.91,119.14-111.34,46.74,4.81,77.2,32.58,88.33,80.6,12.78,55.07-5.46,98.29-52.85,125.13-15.25,8.65-18.95,9.33-44.4,8.12"/></svg>'
                )
            )))
        );
    }

    function generateAttributes(uint256 unlockTime, uint256 targetBalance, address receiveAddress, uint256 percent) internal pure returns(string memory) {
        return string(abi.encodePacked(
            'attributes":[{"display_type":"date","trait_type":"Maturity Date","value":',
            uint2str(unlockTime),
            '},{"trait_type":"Target Balance","value":"',
            convertWeiToEthString(targetBalance),
            ' ETH"},{"trait_type":"Receive Address","value":"0x',
            toAsciiString(receiveAddress),
            '"},{"display_type":"boost_percentage","trait_type":"Percent Complete","value":',
            percent,
            ']}'
        ));
    }

    function _bytes3ToHexString(bytes3 value) internal pure returns (string memory) {
        bytes memory result = new bytes(6);
        bytes16 hexAlphabet = "0123456789abcdef";
        for (uint256 i = 0; i < 3; ++i) {
            result[i * 2] = hexAlphabet[uint8(value[i] >> 4)];
            result[1 + i * 2] = hexAlphabet[uint8(value[i] & 0x0f)];
        }
        return string(result);
    }


    function _daysToDate(
        uint _days
    ) internal pure returns (uint year, uint month, uint day) {
        int __days = int(_days);
        int L = __days + 2509157;
        int N = (4 * L) / 146097;
        L = L - (146097 * N + 3) / 4;
        int _year = (4000 * (L + 1)) / 1461001;
        L = L - (1461 * _year) / 4 + 31;
        int _month = (80 * L) / 2447;
        int _day = L - (2447 * _month) / 80;
        L = _month / 11;
        _month = _month + 2 - 12 * L;
        _year = 100 * (N - 49) + _year + L;
        year = uint(_year);
        month = uint(_month);
        day = uint(_day);
    }

    function getDateFromTimestamp(
        uint timestamp
    ) internal pure returns (string memory) {
        uint year;
        uint month;
        uint day;
        (year, month, day) = _daysToDate(timestamp / 86400);
        return
            string(
                abi.encodePacked(
                    uint2str(day),
                    "/",
                    uint2str(month),
                    "/",
                    uint2str(year)
                )
            );
    }

    function diffDays(
        uint fromTimestamp,
        uint toTimestamp
    ) internal pure returns (uint _days) {
        require(fromTimestamp <= toTimestamp);
        _days = (toTimestamp - fromTimestamp) / 86400;
    }

    function uint2str(
        uint _i
    ) internal pure returns (string memory _uintAsString) {
        if (_i == 0) {
            return "0";
        }
        uint j = _i;
        uint len;
        while (j != 0) {
            len++;
            j /= 10;
        }
        bytes memory bstr = new bytes(len);
        {
            uint k = len;
            while (_i != 0) {
                k = k - 1;
                uint8 temp = (48 + uint8(_i - (_i / 10) * 10));
                bytes1 b1 = bytes1(temp);
                bstr[k] = b1;
                _i /= 10;
            }
        }

        return string(bstr);
    }

    function toAsciiString(address x) internal pure returns (string memory) {
        bytes memory s = new bytes(40);
        for (uint i = 0; i < 20; i++) {
            bytes1 b = bytes1(uint8(uint(uint160(x)) / (2**(8*(19 - i)))));
            bytes1 hi = bytes1(uint8(b) / 16);
            bytes1 lo = bytes1(uint8(b) - 16 * uint8(hi));
            s[2*i] = char(hi);
            s[2*i+1] = char(lo);            
        }
        return string(s);
    }

    function char(bytes1 b) internal pure returns (bytes1 c) {
        if (uint8(b) < 10) return bytes1(uint8(b) + 0x30);
        else return bytes1(uint8(b) + 0x57);
    }

    function convertWeiToEthString(uint weiValue) internal pure returns (string memory) {
        // Check if the value is less than 0.00001 ETH (10000000000000 wei)
        if (weiValue < 10000000000000) {
            return "0";
        }
        
        // Truncate the last 14 digits of the wei value
        uint truncatedWeiValue = weiValue / 10000000000000;

        string memory str = uint2str(truncatedWeiValue);

        // If the length of the string is less than 5, prepend leading zeros
        if (bytes(str).length < 5) {
            uint leadingZeros = 5 - bytes(str).length;
            string memory zeros = new string(leadingZeros);
            bytes memory zerosBytes = bytes(zeros);
            for (uint i = 0; i < leadingZeros; i++) {
                zerosBytes[i] = "0";
            }
            str = string(abi.encodePacked(zerosBytes, bytes(str)));
        }

        uint len = bytes(str).length;

        if (len > 5) {
            // Insert '.' before the last 5 characters
            string memory prefix = insertCharAtIndex(str,len-5,'.');
            return prefix; 
        } else {
            // Prepend '0.' to the start of the string
            string memory prefix = string(abi.encodePacked("0.", str));
            return prefix;
        }
    }

    function insertCharAtIndex(string memory str, uint index, bytes1 newChar) internal pure returns (string memory) {
        bytes memory strBytes = bytes(str);
        bytes memory result = new bytes(strBytes.length + 1);
        
        require(index <= strBytes.length, "Invalid index");
        
        for (uint i = 0; i < result.length; i++) {
            if (i < index) {
                result[i] = strBytes[i];
            } else if (i == index) {
                result[i] = newChar;
            } else {
                result[i] = strBytes[i - 1];
            }
        }
        
        return string(result);
    }
}