// We import Chai to use its asserting functions here.
const { expect, assert } = require("chai")
const { ethers, upgrades, network } = require("hardhat")
const helpers = require("@nomicfoundation/hardhat-network-helpers")
const { deploy, deployVaultImplementation, deployGenerator, deployTreasury, getTypedData, getRevertReason, getCurrentBlockTime, deployMockToken, deployMockOETHToken, generateMintRequest, makeVault, makeVault_100edition_target100_noUnlockTime, makeVault_100edition_notarget_99days } = require("./test_helpers")

const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000'

describe(" -- Testing Generator v2 Contract -- ", function () {

  let factory
  let INITIAL_DEFAULT_ADMIN_AND_SIGNER
  let user1
  let feeRecipient

  before(async function () {
    [INITIAL_DEFAULT_ADMIN_AND_SIGNER, NEW_SIGNER, user1, feeRecipient] = await ethers.getSigners()
  })

  beforeEach(async function () {
    const deployedContracts = await deploy(feeRecipient.address, 'https://zebra.xyz/')
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
    const fund = await makeVault(factory, INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1)

    // Deploy the new generator 
    const generatorV2 = await deployGenerator("Generator_v3")
    await generatorV2.deployed()

    //set the new generator in the contract
    await factory.setGenerator(generatorV2.address)

    let r = await getImage() // 0%
    console.log(r)
  })
})