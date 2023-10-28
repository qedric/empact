// We import Chai to use its asserting functions here.
const { expect, assert } = require("chai")
const { ethers, upgrades, network } = require("hardhat")
const helpers = require("@nomicfoundation/hardhat-network-helpers")
const { deploy, getTypedData, getRevertReason, getCurrentBlockTime, deployMockToken, generateMintRequest, makeFund } = require("./test_helpers")

const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000'

describe("Testing Factory functions", function () {

  let factory
  let INITIAL_DEFAULT_ADMIN_AND_SIGNER, NEW_SIGNER
  let FAKE_FUND_IMPL, FAKE_GENERATOR, FAKE_TREASURY
  let user1, user2
  let feeRecipient, newFeeRecipient

  beforeEach(async function () {
    [INITIAL_DEFAULT_ADMIN_AND_SIGNER, NEW_SIGNER, FAKE_FUND_IMPL, FAKE_GENERATOR, FAKE_TREASURY, user1, user2, feeRecipient, newFeeRecipient] = await ethers.getSigners()
    const deployedContracts = await deploy(feeRecipient.address)
    factory = deployedContracts.factory
  })

  it("should allow DEFAULT ADMIN run setTokenUrlPrefix()", async function () {
    expect(await factory.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).setTokenUrlPrefix("https://example.com/"))
  })

  it("should not allow non DEFAULT ADMIN run setTokenUrlPrefix()", async function () {
    await expect(factory.connect(user1).setTokenUrlPrefix("https://example.com/")).to.be.revertedWith(/AccessControl: account .* is missing role .*/)
  })

  it("should allow DEFAULT ADMIN run setMakeFundFee()", async function () {
    const newFee = ethers.utils.parseEther("0.005")
    await factory.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).setMakeFundFee(newFee)
    const updatedFee = await factory.makeFundFee()
    expect(updatedFee).to.equal(newFee)
  })

  it("should not allow non DEFAULT ADMIN run setMakeFundFee()", async function () {
    const newFee = ethers.utils.parseEther("0.005")
    await expect(factory.connect(user2).setMakeFundFee(newFee)).to.be.revertedWith(/AccessControl: account .* is missing role .*/)
  })

  it("should allow DEFAULT ADMIN run setBreakFundBps()", async function () {
    const newBps = 500 // 5%
    await factory.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).setBreakFundBps(newBps)
    const updatedBps = await factory.breakFundFeeBps()
    expect(updatedBps).to.equal(newBps)
  })

  it("should not allow non DEFAULT ADMIN run setBreakFundBps()", async function () {
    const newBps = 500 // 5%
    await expect(factory.connect(user2).setBreakFundBps(newBps)).to.be.revertedWith(/AccessControl: account .* is missing role .*/)
  })

  it("should allow DEFAULT ADMIN run setFeeRecipient()", async function () {
    await factory.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).setFeeRecipient(newFeeRecipient.address)
    const updatedRecipient = await factory.feeRecipient()
    expect(updatedRecipient).to.equal(newFeeRecipient.address)
  })

  it("should not allow non DEFAULT ADMIN run setFeeRecipient()", async function () {
    await expect(factory.connect(user2).setFeeRecipient(newFeeRecipient.address)).to.be.revertedWith(/AccessControl: account .* is missing role .*/)
  })

  it("should allow DEFAULT ADMIN run setFundImplementation()", async function () {
    await factory.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).setFundImplementation(FAKE_FUND_IMPL.address)
    const updatedImplementation = await factory.fundImplementation()
    expect(updatedImplementation).to.equal(FAKE_FUND_IMPL.address)
  })

  it("should not allow non DEFAULT ADMIN run setFundImplementation()", async function () {
    const newFundImplementation = await (factory, user1) // Deploy a new mock fund contract
    await expect(factory.connect(user2).setFundImplementation(newFundImplementation.address)).to.be.revertedWith(/AccessControl: account .* is missing role .*/)
  })

  it("should allow DEFAULT ADMIN run setGenerator()", async function () {
    await factory.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).setGenerator(FAKE_GENERATOR.address)
    const updatedGenerator = await factory.generator()
    expect(updatedGenerator).to.equal(FAKE_GENERATOR.address)
  })

  it("should not allow non DEFAULT ADMIN run setGenerator()", async function () {
    await expect(factory.connect(user2).setGenerator(FAKE_GENERATOR.address)).to.be.revertedWith(/AccessControl: account .* is missing role .*/)
  })

  it("should allow DEFAULT ADMIN run setTreasury()", async function () {
    await factory.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).setTreasury(FAKE_TREASURY.address)
    const updatedTreasury = await factory.treasury()
    expect(updatedTreasury).to.equal(FAKE_TREASURY.address)
  })

  it("should not allow non DEFAULT ADMIN run setTreasury()", async function () {
      await expect(factory.connect(user2).setTreasury(FAKE_TREASURY.address)).to.be.revertedWith(/AccessControl: account .* is missing role .*/)
  })

  it("should allow DEFAULT ADMIN to grant SIGNER role", async function () {
      await factory.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).grantSignerRole(NEW_SIGNER.address)
      const hasSignerRole = await factory.hasRole(factory.SIGNER_ROLE(), NEW_SIGNER.address)
      expect(hasSignerRole).to.be.true
  })

  it("should not allow non DEFAULT ADMIN to grant Signer role", async function () {
      await expect(factory.connect(user2).grantSignerRole(NEW_SIGNER.address)).to.be.revertedWith(/AccessControl: account .* is missing role .*/)
  })

  it("should allow DEFAULT ADMIN to revoke SIGNER role", async function () {
      // First, grant the Minter role to NEW_SIGNER
      await factory.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).grantSignerRole(NEW_SIGNER.address)
      // Then, revoke the Minter role
      await factory.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).revokeSignerRole(NEW_SIGNER.address)
      const hasSignerRole = await factory.hasRole(factory.SIGNER_ROLE(), NEW_SIGNER.address)
      expect(hasSignerRole).to.be.false
  })

  it("should not allow non DEFAULT ADMIN to SIGNER Minter role", async function () {
      // First, grant the Minter role to NEW SIGNER
      await factory.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).grantSignerRole(NEW_SIGNER.address)
      // Then, attempt to revoke the Minter role as a non-admin
      await expect(factory.connect(user2).revokeSignerRole(NEW_SIGNER.address)).to.be.revertedWith(/AccessControl: account .* is missing role .*/)
  })

  it("should succesfully run mintWithSignature() if the signer has the SIGNER_ROLE", async function () {
    const makeFundFee = ethers.utils.parseUnits("0.004", "ether")
    const mr = await generateMintRequest(factory.address, INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1.address)
    const tx = await factory.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).mintWithSignature(mr.typedData.message, mr.signature, { value: makeFundFee })

    // Verify that the token was minted and assigned to the correct recipient
    const balance = await factory.balanceOf(user1.address, 0)
    expect(balance).to.equal(4)
  })

  it("should fail to run mintWithSignature() if the signer does not have SIGNER_ROLE", async function () {
    const makeFundFee = ethers.utils.parseUnits("0.004", "ether")
    const mr = await generateMintRequest(factory.address, user1, user2.address)
    await expect(factory.connect(user2).mintWithSignature(mr.typedData.message, mr.signature, { value: makeFundFee })).to.be.revertedWith("Invalid request")
  })
})