import { ThirdwebSDK } from "@thirdweb-dev/sdk/evm";

const sdk = new ThirdwebSDK("goerli");
const contract = await sdk.getContract("0xd9e5f418398BE708F804C03c5Ca958Edd5DaF2Af");