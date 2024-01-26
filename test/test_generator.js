// We import Chai to use its asserting functions here.
const { expect, assert } = require("chai")
const { ethers, upgrades, network } = require("hardhat")
const helpers = require("@nomicfoundation/hardhat-network-helpers")
const { deploy, deployVaultImplementation, deployGenerator, deployTreasury, getTypedData, getRevertReason, getCurrentBlockTime, deployMockToken, deployMockOETHToken, generateMintRequest, makeVault, makeVault_100edition_target100_noUnlockTime, makeVault_100edition_notarget_99days } = require("./test_helpers")

const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000'

describe(" -- Testing Generator Contract -- ", function () {

  let factory
  let generator
  let INITIAL_DEFAULT_ADMIN_AND_SIGNER
  let user1
  let feeRecipient

  before(async function () {
    [INITIAL_DEFAULT_ADMIN_AND_SIGNER, NEW_SIGNER, user1, feeRecipient] = await ethers.getSigners()
  })

  beforeEach(async function () {
    const deployedContracts = await deploy(feeRecipient.address, 'SepoliaETH', 'https://zebra.xyz/')
    factory = deployedContracts.factory
    generator = deployedContracts.generator
  })

  it("should generate the image with correct values", async function () {

    // Extract the svg and percentage from the token metadata
    async function getImage() {
      const metadata = await factory.uri(0)
      console.log(metadata)
      // Decode the base64 metadata
      const decodedMetadata = JSON.parse(atob(metadata.split(',')[1]))
      const p = decodedMetadata.attributes.find(attr => attr.trait_type === "Percent Complete").value
      const decodedImg = atob(decodedMetadata.image_data.split(",")[1])
      return {
        percent: p,
        img: decodedImg
      }
    }

    // Generate a sample token and its attributes
    const vault = await makeVault(factory, INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1)

    //console.log(vault)

    let r = await getImage() // 0%

    expect(r.percent).to.equal(0)
    //console.log(r)
  })

  it("should set the token URL prefix and emit the TokenUrlPrefixUpdated event", async function () {
    const newTokenUrlPrefix = "https://new-prefix.com/"
    const receipt = await generator.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).setTokenUrlPrefix(newTokenUrlPrefix)

    const events = await generator.queryFilter("TokenUrlPrefixUpdated", receipt.blockHash)
    expect(events.length).to.equal(1)

    const event = events[0]
    expect(event.args.oldPrefix).to.equal("https://zebra.xyz/")
    expect(event.args.newPrefix).to.equal(newTokenUrlPrefix)
  })
})