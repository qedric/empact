// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;

import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./IGenerator.sol";
import "./IFund.sol";

contract Generator_v3 is IGenerator, AccessControl {

	constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
	}

    function uri(IFund.Attr calldata attributes, address fundAddress, uint256 percent, uint256 balance, string memory tokenUrl, uint256 tokenId) external pure returns (string memory) {    
        return string(
            abi.encodePacked(
                "data:application/json;base64,",
                Base64.encode(
                    bytes(
                        abi.encodePacked(
                            '{"name":"',
                            attributes.name,
                            '","description":"',
                            attributes.description,
                            '","image_data":"',
                            generateSVG(percent),
                            '","external_url":"',
                            tokenUrl,
                            uint2str(tokenId),
                            '","',
                            generateAttributes(
                            	attributes,
                            	fundAddress,
                            	percent,
                            	balance
                            ),
                            '}'
                        )
                    )   
                )
            )
        );
    }

    function generateAttributes(IFund.Attr calldata attributes, address receiveAddress, uint256 percent, uint256 balance) internal pure returns(string memory) {
        return string(abi.encodePacked(
            'attributes":[{"display_type":"date","trait_type":"Maturity Date","value":',
            uint2str(attributes.unlockTime),
            '},{"trait_type":"Target Balance","value":"',
            convertWeiToEthString(attributes.targetBalance),
            ' ETH"},{"trait_type":"Current Balance","value":"',
            convertWeiToEthString(balance),
            ' ETH"},{"trait_type":"Receive Address","value":"0x',
            toAsciiString(receiveAddress),
            '"},{"display_type":"boost_percentage","trait_type":"Percent Complete","value":',
            uint2str(percent),
            '}]'
        ));
    }

    function generateSVG(uint256 percent) internal pure returns (bytes memory) {
        return abi.encodePacked(
            "data:image/svg+xml;base64,",
            Base64.encode(bytes(string(
                abi.encodePacked(
                    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200" fill="none"><rect width="1200" height="1200" fill="#323D9E"/>',
                    percent > 0 ? generatePaths(percent) : '',
                    '<text x="600" y="600" fill="#fff" alignment-baseline="middle" text-anchor="middle" font-size="440">',
                    uint2str(percent),
                    '%</text></svg>'
                )
            )))
        );
    }

    function generatePaths(uint256 percentage) internal pure returns (string memory pathsString) {
        uint256 pathsToShow = (percentage * 30) / 100; // Calculate paths to display

        for (uint256 i = 0; i < pathsToShow; i++) {
            uint256 yCoordinate = 1200 - (40 * i); // Invert Y-coordinate
            pathsString = string(abi.encodePacked(
                pathsString,
                '<path d="M1200 ', uint2str(yCoordinate), 'H0V', uint2str(yCoordinate - 20),
                'H1200V', uint2str(yCoordinate), 'Z" fill="white"/>\n'
            ));
        }
    }

    /*
        UTILS - internal functions only
    */

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