// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {
        _mint(msg.sender, 1000000000000000000000000); // Mint 1,000,000 tokens to the contract deployer
    }
}

contract MockOETHToken is ERC20 {

    bool private _isNonRebasingAccount = true;

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {
        _mint(msg.sender, 1000000000000000000000000); // Mint 1,000,000 tokens to the contract deployer
    }

    function rebaseOptIn() public {
        require(_isNonRebasingAccount, "Account has not opted out");
        _isNonRebasingAccount = false;
    }
}

contract MockTokenWithDecimals is ERC20 {

    uint8 private decimals_;

    constructor(string memory name_, string memory symbol_, uint8 _decimals) ERC20(name_, symbol_) {
        _mint(msg.sender, 1000000000000000000000000); // Mint 1,000,000 tokens to the contract deployer
        decimals_ = _decimals;
    }

    /**
     * @dev Returns the number of decimals. This overrides the default value of 18.
     */
    function decimals() public view virtual override returns (uint8) {
        return decimals_;
    }
}