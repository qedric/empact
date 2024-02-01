// We import Chai to use its asserting functions here.
const { expect, assert } = require("chai")
const { ethers, upgrades, network } = require("hardhat")
const helpers = require("@nomicfoundation/hardhat-network-helpers")
const { deploy, deployVaultImplementation, deployGenerator, deployTreasury, getTypedData, getRevertReason, getCurrentBlockTime, deployMockToken, deployMockOETHToken, generateMintRequest, makeLockedVault, makeUnlockedVault, makeOpenVault } = require("./test_helpers")

const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000'

describe(" -- Testing Generator Contract -- ", function () {

  let factory
  let generator
  let DEFAULT_ADMIN_AND_SIGNER, user1, feeRecipient

  // Extract the svg and percentage from the token metadata
  async function getImage(tokenId) {
    const metadata = await factory.uri(tokenId)
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

  before(async function () {
    [DEFAULT_ADMIN_AND_SIGNER, user1, feeRecipient] = await ethers.getSigners()
  })

  beforeEach(async function () {
    const deployedContracts = await deploy(feeRecipient.address, 'SepoliaETH', 'https://zebra.xyz/')
    factory = deployedContracts.factory
    generator = deployedContracts.generator
  })

  it("should generate the image with correct values - 0%", async function () {

    // Generate a sample token and its attributes
    const vault = await makeLockedVault(factory, DEFAULT_ADMIN_AND_SIGNER, user1)
    const tokenId = await vault.attributes().then(x => x.tokenId)
    let r = await getImage(tokenId)

    expect(r.percent).to.equal(0)
  })

  it("should generate the image with correct values - 60%", async function () {

    // Generate a sample token and its attributes
    const vault = await makeLockedVault(factory, DEFAULT_ADMIN_AND_SIGNER, user1)

    //send some ETH
    const amountToSend = ethers.utils.parseEther("60")
    const tx = await DEFAULT_ADMIN_AND_SIGNER.sendTransaction({
      to: vault.address,
      value: amountToSend,
    })

    const tokenId = await vault.attributes().then(x => x.tokenId)
    let r = await getImage(tokenId)
    expect(r.percent).to.equal(60)

  })

  it("should generate the image with correct values - 100%", async function () {

    // Generate a sample token and its attributes
    const vault = await makeUnlockedVault(factory, DEFAULT_ADMIN_AND_SIGNER, user1)
    const tokenId = await vault.attributes().then(x => x.tokenId)
    let r = await getImage(tokenId)
    expect(r.percent).to.equal(100)
  })

  // open vaults have no tokens because they are burned
  /*it("should generate the image with correct values - open", async function () {

    // Generate a sample token and its attributes
    const vault = await makeOpenVault(factory, DEFAULT_ADMIN_AND_SIGNER, user1)
    const tokenId = await vault.attributes().then(x => x.tokenId)
    let r = await getImage(0)
  })*/

  it("should set the token URL prefix and emit the TokenUrlPrefixUpdated event", async function () {
    const newTokenUrlPrefix = "https://new-prefix.com/"
    const receipt = await generator.connect(DEFAULT_ADMIN_AND_SIGNER).setTokenUrlPrefix(newTokenUrlPrefix)

    const events = await generator.queryFilter("TokenUrlPrefixUpdated", receipt.blockHash)
    expect(events.length).to.equal(1)

    const event = events[0]
    expect(event.args.oldPrefix).to.equal("https://zebra.xyz/")
    expect(event.args.newPrefix).to.equal(newTokenUrlPrefix)
  })
})