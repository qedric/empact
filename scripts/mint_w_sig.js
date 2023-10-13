import { ThirdwebSDK } from "@thirdweb-dev/sdk/evm";

const sdk = new ThirdwebSDK("hardhat");
const contract = await sdk.getContract("0xe7f1725e7734ce288f8367e1bb143e90bb3f0512");

console.log(contract)

//const { data: fundContractAddress } = useContractRead(contract, "contracts", address);

const mintRequest = {
      to: authorAddress,
      quantity: ethers.BigNumber.from(12),
      validityStartTimestamp: startTime,
      validityEndTimestamp: endTime,
      name: "TwelveLittleFunds",
      metadata: '',
      unlockTime: 1697889467,
      targetBalance: ethers.BigNumber.from(12)
    }


const tx = contract.call("mintWithSignature",
        mintRequest,
        signature,
        {value: ethers.utils.parseEther('0.004')});
    