const ThirdwebSDK = require("@thirdweb-dev/sdk/evm")

const sdk = new ThirdwebSDK("sepolia")
const { getTypedData, getRevertReason, getCurrentBlockTime, generateMintRequest } = require("../test_helpers")

async function main() {

      const factory = await sdk.getContract("0x71e5CcDF6dB960Cb2c5F4066cB01471B54061105")
      const [owner] = await ethers.getSigners();

      const timestamp = await getCurrentBlockTime()
      const endTime = Math.floor(timestamp + 60 * 60 * 24)
      const unlockTime = Math.floor(timestamp + 60 * 60 * 24 * 365) // 1 year
      const targetBalance = ethers.utils.parseUnits("0", "ether").toString()
      const to = owner.address
      const quantity = 100
      const name = 'Example Vault'
      const description = 'This fund has 100 impact tokens, and will unlock 1 year from creation. It has no target amount.'

      const typedData = getTypedData(
            factory.address,
            to,
            timestamp,
            endTime,
            quantity,
            unlockTime,
            targetBalance,
            name,
            description
      )

      const mr = await generateMintRequest(factory.address, owner, to, typedData)
      console.log(mr)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})