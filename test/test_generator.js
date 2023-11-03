// We import Chai to use its asserting functions here.
const { expect, assert } = require("chai")
const { ethers, upgrades, network } = require("hardhat")
const helpers = require("@nomicfoundation/hardhat-network-helpers")
const { deploy, deployFundImplementation, deployGenerator, deployTreasury, getTypedData, getRevertReason, getCurrentBlockTime, deployMockToken, deployMockOETHToken, generateMintRequest, makeFund, makeFund_100edition_target100_noUnlockTime, makeFund_100edition_notarget_99days } = require("./test_helpers")

const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000'

describe(" -- Testing Generator Contract -- ", function () {

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

  it("setSvgColours", async function () {
    console.log('TO DO: setSvgColours()')
  })

  it("uri", async function () {
    console.log('TO DO: uri()')
  })
})