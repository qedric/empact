// We import Chai to use its asserting functions here.
const { expect, assert } = require("chai")
const { ethers, upgrades, network } = require("hardhat")
const helpers = require("@nomicfoundation/hardhat-network-helpers")
const { deploy, getTypedData, getRevertReason, getCurrentBlockTime, deployMockToken, deployMockFund } = require("test_helpers")

const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000'

describe("Testing Factory Roles & permissions", function () {

  let cryptofunds
  let owner, newOwner, nonOwner
  let minter, newMinter, nonMinter
  let nftOwner, nonNftOwner
  let feeRecipient, newFeeRecipient

  beforeEach(async function () {
    [owner, newOwner, minter, newMinter, nonOwner, nonMinter, nftOwner, nonNftOwner, feeRecipient, newFeeRecipient] = await ethers.getSigners()
    cryptofunds = deploy('cryptofunds_HH_TEST', 'CPG', feeRecipient.address, '400')
  })

  it("should allow DEFAULT ADMIN run setTokenUrlPrefix()", async function () {
    const tokenUrlPrefix = "https://example.com/"
    await cryptofunds.connect(owner).setTokenUrlPrefix(tokenUrlPrefix)
    const updatedTokenUrlPrefix = await cryptofunds.tokenUrlPrefix()
    expect(updatedTokenUrlPrefix).to.equal(tokenUrlPrefix)
  })

  it("should not allow non DEFAULT ADMIN run setTokenUrlPrefix()", async function () {
    const tokenUrlPrefix = "https://example.com/"
    await expect(cryptofunds.connect(nonOwner).setTokenUrlPrefix(tokenUrlPrefix)).to.be.revertedWith("AccessControl: sender must be an admin")
  })

  it("should allow DEFAULT ADMIN run setMakeFundFee()", async function () {
    const newFee = ethers.utils.parseEther("0.005")
    await cryptofunds.connect(owner).setMakeFundFee(newFee)
    const updatedFee = await cryptofunds.makeFundFee()
    expect(updatedFee).to.equal(newFee)
  })

  it("should not allow non DEFAULT ADMIN run setMakeFundFee()", async function () {
    const newFee = ethers.utils.parseEther("0.005")
    await expect(cryptofunds.connect(nonOwner).setMakeFundFee(newFee)).to.be.revertedWith("AccessControl: sender must be an admin")
  })

  it("should allow DEFAULT ADMIN run setBreakFundBps()", async function () {
    const newBps = 500 // 5%
    await cryptofunds.connect(owner).setBreakFundBps(newBps)
    const updatedBps = await cryptofunds.breakFundFeeBps()
    expect(updatedBps).to.equal(newBps)
  })

  it("should not allow non DEFAULT ADMIN run setBreakFundBps()", async function () {
    const newBps = 500 // 5%
    await expect(cryptofunds.connect(nonOwner).setBreakFundBps(newBps)).to.be.revertedWith("AccessControl: sender must be an admin")
  })

  it("should allow DEFAULT ADMIN run setFeeRecipient()", async function () {
    await cryptofunds.connect(owner).setFeeRecipient(newFeeRecipient.address)
    const updatedRecipient = await cryptofunds.feeRecipient()
    expect(updatedRecipient).to.equal(newFeeRecipient.address)
  })

  it("should not allow non DEFAULT ADMIN run setFeeRecipient()", async function () {
    await expect(cryptofunds.connect(nonOwner).setFeeRecipient(newFeeRecipient.address)).to.be.revertedWith("AccessControl: sender must be an admin")
  })

  it("should allow DEFAULT ADMIN run setFundImplementation()", async function () {
    const newFundImplementation = await deployMockFund() // Deploy a new mock fund contract
    await cryptofunds.connect(owner).setFundImplementation(newFundImplementation.address)
    const updatedImplementation = await cryptofunds.fundImplementation()
    expect(updatedImplementation).to.equal(newFundImplementation.address)
  })

  it("should not allow non DEFAULT ADMIN run setFundImplementation()", async function () {
    const newFundImplementation = await deployMockFund() // Deploy a new mock fund contract
    await expect(cryptofunds.connect(nonOwner).setFundImplementation(newFundImplementation.address)).to.be.revertedWith("AccessControl: sender must be an admin")
  })

  it("should allow DEFAULT ADMIN run setGenerator()", async function () {
    const newGenerator = await deployMockToken() // Deploy a new mock generator contract
    await cryptofunds.connect(owner).setGenerator(newGenerator.address)
    const updatedGenerator = await cryptofunds.generator()
    expect(updatedGenerator).to.equal(newGenerator.address)
  })

  it("should not allow non DEFAULT ADMIN run setGenerator()", async function () {
    const newGenerator = await deployMockToken() // Deploy a new mock generator contract
    await expect(cryptofunds.connect(nonOwner).setGenerator(newGenerator.address)).to.be.revertedWith("AccessControl: sender must be an admin")
  })

  it("should allow DEFAULT ADMIN run setTreasury()", async function () {
    const newTreasury = await deployMockToken() // Deploy a new mock treasury contract
    await cryptofunds.connect(owner).setTreasury(newTreasury.address)
    const updatedTreasury = await cryptofunds.treasury()
    expect(updatedTreasury).to.equal(newTreasury.address)
  })

  it("should not allow non DEFAULT ADMIN run setTreasury()", async function () {
      const newTreasury = await deployMockToken() // Deploy a new mock treasury contract
      await expect(cryptofunds.connect(nonOwner).setTreasury(newTreasury.address)).to.be.revertedWith("AccessControl: sender must be an admin")
  })

  it("should allow DEFAULT ADMIN to grant Minter role", async function () {
      await cryptofunds.connect(owner).grantMinterRole(minter.address)
      const hasMinterRole = await cryptofunds.hasRole("SIGNER_ROLE", minter.address)
      expect(hasMinterRole).to.be.true
  })

  it("should not allow non DEFAULT ADMIN to grant Minter role", async function () {
      await expect(cryptofunds.connect(nonOwner).grantMinterRole(minter.address)).to.be.revertedWith("AccessControl: sender must be an admin")
  })

  it("should allow DEFAULT ADMIN to revoke Minter role", async function () {
      // First, grant the Minter role to minter
      await cryptofunds.connect(owner).grantMinterRole(minter.address)
      // Then, revoke the Minter role
      await cryptofunds.connect(owner).revokeMinterRole(minter.address)
      const hasMinterRole = await cryptofunds.hasRole("SIGNER_ROLE", minter.address)
      expect(hasMinterRole).to.be.false
  })

  it("should not allow non DEFAULT ADMIN to revoke Minter role", async function () {
      // First, grant the Minter role to minter
      await cryptofunds.connect(owner).grantMinterRole(minter.address)
      // Then, attempt to revoke the Minter role as a non-admin
      await expect(cryptofunds.connect(nonOwner).revokeMinterRole(minter.address)).to.be.revertedWith("AccessControl: sender must be an admin")
  })

  it("should fail to run mintWithSignature() if a the signer does not have SIGNER_ROLE", async function () {
      // Generate a signature for the mint request
      const timestamp = await ethers.provider.getBlockNumber().then(blockNumber =>
        // getBlock returns a block object and it has a timestamp property.
        ethers.provider.getBlock(blockNumber).then(block => block.timestamp))

      const endTime = Math.floor(timestamp + 60 * 60 * 24)
      const unlockTime = Math.floor(timestamp + 60 * 60 * 24 * 99)
      const targetBalance = ethers.utils.parseUnits("1", "ether").toString()

      const makeFundFee = ethers.utils.parseUnits("0.004", "ether")

      const typedData = await getTypedData(
        cryptofunds,
        nftOwner.address,
        4,
        timestamp,
        endTime,
        '4 Little Pigs',
        'description',
        unlockTime,
        targetBalance
      )

      // Sign the typed data
      const signature = await nonMinter._signTypedData(
        typedData.domain,
        typedData.types,
        typedData.message
      )

      await expect(cryptofunds.connect(nftOwner).mintWithSignature(typedData.message, signature, { value: makeFundFee })).to.be.revertedWith("Invalid request")
    })


})

describe("Testing Treasury Roles & permissions", function () {

  let cryptofunds
  let owner, newOwner, nonOwner
  let minter, newMinter, nonMinter
  let nftOwner, nonNftOwner
  let feeRecipient, newFeeRecipient

  beforeEach(async function () {
    [owner, newOwner, minter, newMinter, nonOwner, nonMinter, nftOwner, nonNftOwner, feeRecipient, newFeeRecipient] = await ethers.getSigners()
    cryptofunds = deployContracts('cryptofunds_HH_TEST', 'CPG', feeRecipient.address, '400')
  })

  it("should allow DEFAULT ADMIN to grant an address the TREASURER_ROLE", async function () {
    await cryptofunds.connect(owner).grantRole(await cryptofunds.TREASURER_ROLE(), minter.address)
    const isMinter = await cryptofunds.hasRole(await cryptofunds.TREASURER_ROLE(), minter.address)
    assert(isMinter)
  })

  it("should fail if non DEFAULT ADMIN tries to grant an address the TREASURER_ROLE", async function () {
    await expect(cryptofunds.connect(nonOwner).grantRole(await cryptofunds.TREASURER_ROLE(), minter.address)).to.be.revertedWith(
    /Permissions: account .* is missing role .*/)
  })

  it("should allow DEFAULT ADMIN to revoke TREASURER_ROLE for a given address", async function () {
    await cryptofunds.grantRole(await cryptofunds.TREASURER_ROLE(), minter.address)
    await cryptofunds.revokeRole(await cryptofunds.SIGNER_ROLE(), minter.address)
    const isMinter = await cryptofunds.hasRole(await cryptofunds.SIGNER_ROLE(), minter.address)
    assert(!isMinter)
  })

  it("should fail if non DEFAULT ADMIN tries to revoke the MINTER Role for a given address", async function () {
    await cryptofunds.grantRole(await cryptofunds.SIGNER_ROLE(), minter.address)
    await expect(
      cryptofunds.connect(newOwner).revokeRole(await cryptofunds.SIGNER_ROLE(), minter.address)
    ).to.be.revertedWith(/Permissions: account .* is missing role .*/)
  })

  it("should fail if a non-admin tries to set a new fee recipient", async function() {
     // Attempt to set a new fee recipient from a non-admin account
    await expect(
      cryptofunds.connect(nonOwner).setFeeRecipient(newFeeRecipient.address)
    ).to.be.revertedWith(
      new RegExp(`Permissions: account ${nonOwner.address} is missing role ${DEFAULT_ADMIN_ROLE}`,"i")
    )
  })

  it("should allow DEFAULT_ADMIN_ROLE to change the generator", async function() {
    await cryptofunds.connect(owner).setGenerator(newFeeRecipient.address)
    let newGen = await cryptofunds.generator()
    expect(newGen).to.equal(newFeeRecipient.address)
  })

  it("should not allow non DEFAULT_ADMIN_ROLE to change the generator", async function() {
    await expect(
      cryptofunds.connect(nonOwner).setGenerator(newFeeRecipient.address)
    ).to.be.revertedWith(
      new RegExp(`Permissions: account ${nonOwner.address} is missing role ${DEFAULT_ADMIN_ROLE}`,"i")
    )
  })

  it("should allow DEFAULT_ADMIN_ROLE to change the treasury", async function() {
    await cryptofunds.connect(owner).setTreasury(newFeeRecipient.address)
    let newGen = await cryptofunds.treasury()
    expect(newGen).to.equal(newFeeRecipient.address)
  })

  it("should not allow non DEFAULT_ADMIN_ROLE to change the treasury", async function() {
    await expect(
      cryptofunds.connect(nonOwner).setTreasury(newFeeRecipient.address)
    ).to.be.revertedWith(
      new RegExp(`Permissions: account ${nonOwner.address} is missing role ${DEFAULT_ADMIN_ROLE}`,"i")
    )
  })
})

describe("Testing Fund Roles & permissions", function () {
  it("should test something (TODO)", function () {
    // Add your TODO message here
    console.log("TODO: Implement this test");
  });
})

describe("Testing Generator Roles & permissions", function () {
  it("should test something (TODO)", function () {
    // Add your TODO message here
    console.log("TODO: Implement this test");
  });
})