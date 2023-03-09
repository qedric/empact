import "./utils.sol";
import "@thirdweb-dev/contracts/openzeppelin-presets/proxy/utils/Initializable.sol";
import "@thirdweb-dev/contracts/extension/Ownable.sol";

contract PiggyBank is Initializable, Ownable {
    event Received(address _from, uint _amount);
    event Withdrawal(address who, uint amount, uint balance);

    Attr public attributes;
    uint8 public breakPiggy_fee_Bps = 4;

    function initialize(Attr memory _data) public initializer {
        _setupOwner(msg.sender);
        attributes = _data;
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