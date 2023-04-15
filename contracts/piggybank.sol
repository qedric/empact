// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.11; 
import "@thirdweb-dev/contracts/openzeppelin-presets/proxy/utils/Initializable.sol";
import "@thirdweb-dev/contracts/extension/Ownable.sol";

interface IPiggyBank {

    struct Attr { 
        uint256 tokenId;
        string name;
        string description;
        string externalUrl;
        string metadata;
        uint256 unlockTime;
        uint256 targetBalance;
    }

    event PiggyInitialised(Attr attributes);
    event Received(address _from, uint _amount);
    event Withdrawal(address who, uint amount, uint balance);

    function initialize(Attr calldata _data) external;

    function payout(address recipient, uint256 thisOwnerBalance, uint256 totalSupply) external payable;

    function setBreakPiggyBps(uint8 bps) external;
}

interface IFactory {
     function feeRecipient() external returns (address payable);
}

contract PiggyBank is IPiggyBank, Initializable, Ownable {
    
    Attr public attributes;
    uint8 public breakPiggy_fee_Bps;

    function initialize(Attr calldata _data) public initializer {
        _setupOwner(msg.sender);
        attributes = _data;
        breakPiggy_fee_Bps = 4;
        emit PiggyInitialised(_data);
    }

    function payout(
        address recipient,
        uint256 thisOwnerBalance,
        uint256 totalSupply
    ) external payable onlyOwner {
        require(
            block.timestamp >= attributes.unlockTime,
            "You can't withdraw yet"
        );
        require(
            address(this).balance >= attributes.targetBalance,
            "Piggy is still hungry!"
        );
        require(address(this).balance > 0, "Piggy has nothing to give!");

        // calculate the amount owed
        uint256 payoutAmount = (address(this).balance *
            thisOwnerBalance) / totalSupply;
        uint256 payoutFee = (payoutAmount * breakPiggy_fee_Bps) / 100;

        // send the withdrawal event and pay the owner
        payable(recipient).transfer(payoutAmount - payoutFee);

        /// @dev get the current fee Recipient from the factory contract
        IFactory factoryInstance = IFactory(owner());
        address payable feeRecipient = factoryInstance.feeRecipient();

        // send the fee to the factory contract owner
        feeRecipient.transfer(payoutFee);

        emit Withdrawal(recipient, payoutAmount, thisOwnerBalance);
    }

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    /// @dev Returns whether owner can be set in the given execution context.
    function _canSetOwner() internal view virtual override returns (bool) {
        return false;
    }

    function setBreakPiggyBps(uint8 bps) public onlyOwner {
        require(bps <= 9, "Don't be greedy!");
        breakPiggy_fee_Bps = bps;
    }
}