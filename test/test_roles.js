// We import Chai to use its asserting functions here.
const { expect, assert } = require("chai")
const { ethers, upgrades, network } = require("hardhat")
const helpers = require("@nomicfoundation/hardhat-network-helpers")
const { deployContracts, getTypedData, getRevertReason, getCurrentBlockTime, deployMockToken, deployMockFund } = require("test_helpers")

const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000'

describe("Testing Factory Roles & permissions", function () {

  let cryptofunds
  let owner, newOwner, nonOwner
  let minter, newMinter, nonMinter
  let nftOwner, nonNftOwner
  let feeRecipient, newFeeRecipient

  beforeEach(async function () {
    [owner, newOwner, minter, newMinter, nonOwner, nonMinter, nftOwner, nonNftOwner, feeRecipient, newFeeRecipient] = await ethers.getSigners()
    cryptofunds = deployContracts('cryptofunds_HH_TEST', 'CPG', feeRecipient.address, '400')
  })

  it("should allow DEFAULT ADMIN to grant an address the MINTER Role", async function () {
    await cryptofunds.connect(owner).grantRole(await cryptofunds.MINTER_ROLE(), minter.address)
    const isMinter = await cryptofunds.hasRole(await cryptofunds.MINTER_ROLE(), minter.address)
    assert(isMinter)
  })

  it("should fail if non DEFAULT ADMIN tries to grant an address the MINTER Role", async function () {
    await expect(cryptofunds.connect(nonOwner).grantRole(await cryptofunds.MINTER_ROLE(), minter.address)).to.be.revertedWith(
    /Permissions: account .* is missing role .*/)
  })

  it("should allow DEFAULT ADMIN to revoke MINTER Role for a given address", async function () {
    await cryptofunds.grantRole(await cryptofunds.MINTER_ROLE(), minter.address)
    await cryptofunds.revokeRole(await cryptofunds.MINTER_ROLE(), minter.address)
    const isMinter = await cryptofunds.hasRole(await cryptofunds.MINTER_ROLE(), minter.address)
    assert(!isMinter)
  })

  it("should fail if non DEFAULT ADMIN tries to revoke the MINTER Role for a given address", async function () {
    await cryptofunds.grantRole(await cryptofunds.MINTER_ROLE(), minter.address)
    await expect(
      cryptofunds.connect(newOwner).revokeRole(await cryptofunds.MINTER_ROLE(), minter.address)
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
    await cryptofunds.revokeRole(await cryptofunds.MINTER_ROLE(), minter.address)
    const isMinter = await cryptofunds.hasRole(await cryptofunds.MINTER_ROLE(), minter.address)
    assert(!isMinter)
  })

  it("should fail if non DEFAULT ADMIN tries to revoke the MINTER Role for a given address", async function () {
    await cryptofunds.grantRole(await cryptofunds.MINTER_ROLE(), minter.address)
    await expect(
      cryptofunds.connect(newOwner).revokeRole(await cryptofunds.MINTER_ROLE(), minter.address)
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