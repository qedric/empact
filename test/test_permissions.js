// We import Chai to use its asserting functions here.
const { expect, assert } = require("chai")
const { ethers, upgrades, network } = require("hardhat")
const helpers = require("@nomicfoundation/hardhat-network-helpers")
const { deploy, getTypedData, getRevertReason, getCurrentBlockTime, deployMockToken, generateMintRequest, makeFund } = require("./test_helpers")

const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000'

describe("Testing Factory Roles & permissions", function () {

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

describe("Testing Treasury Roles & permissions", function () {

  let treasury
  let INITIAL_DEFAULT_ADMIN_AND_SIGNER, TREASURER, NEW_TREASURER
  let user1, user2
  let feeRecipient
  let deployedContracts

  beforeEach(async function () {
    [INITIAL_DEFAULT_ADMIN_AND_SIGNER, TREASURER, NEW_TREASURER, user1, user2, feeRecipient] = await ethers.getSigners()
    deployedContracts = await deploy(feeRecipient.address)
    treasury = deployedContracts.treasury
  })

  it("should allow DEFAULT ADMIN to grant and revoke TREASURER_ROLE for a given address", async function () {
    // Check if NEW_TREASURER does not have the TREASURER_ROLE initially
    const isTreasurerBefore = await treasury.hasRole(await treasury.TREASURER_ROLE(), NEW_TREASURER.address);
    assert(!isTreasurerBefore, "NEW_TREASURER should not have TREASURER_ROLE initially");

    // Grant TREASURER_ROLE to NEW_TREASURER
    await treasury.grantRole(await treasury.TREASURER_ROLE(), NEW_TREASURER.address);

    // Check if NEW_TREASURER has the TREASURER_ROLE after granting
    const isTreasurerAfterGrant = await treasury.hasRole(await treasury.TREASURER_ROLE(), NEW_TREASURER.address);
    assert(isTreasurerAfterGrant, "NEW_TREASURER should have TREASURER_ROLE after granting");

    // Revoke TREASURER_ROLE from NEW_TREASURER
    await treasury.revokeRole(await treasury.TREASURER_ROLE(), NEW_TREASURER.address);

    // Check if NEW_TREASURER does not have the TREASURER_ROLE after revoking
    const isTreasurerAfterRevoke = await treasury.hasRole(await treasury.TREASURER_ROLE(), NEW_TREASURER.address);
    assert(!isTreasurerAfterRevoke, "NEW_TREASURER should not have TREASURER_ROLE after revoking");
  })

  it("should fail if non DEFAULT ADMIN tries to grant an address the TREASURER_ROLE", async function () {
    await expect(treasury.connect(user2).grantRole(await treasury.TREASURER_ROLE(), NEW_TREASURER.address)).to.be.revertedWith(
    /AccessControl: account .* is missing role .*/)
  })

  /*setOETHContractAddress*/
  it("should allow TREASURER to set OETH contract address", async function () {

    const treasurerRole = treasury.TREASURER_ROLE()
    // grant MINTER role to signer (if not already granted)
    if (!(await treasury.hasRole(treasurerRole, TREASURER.address))) {
        await treasury.grantRole(treasurerRole, TREASURER.address)
    }

    const oldOETHAddress = await treasury.oETHTokenAddress()

    // Set the OETH contract address by a TREASURER
    const tx = await treasury.connect(TREASURER).setOETHContractAddress(user1.address)
    const txReceipt = await tx.wait()

    // const mintedEvent = txReceipt.events.find(event => event.event === 'TokensMintedWithSignature')
    const OriginProtocolTokenUpdatedEvent = txReceipt.events.find(event => event.event === 'OriginProtocolTokenUpdated')

    const newOETHAddress = await treasury.oETHTokenAddress()

    // Verify that the event was emitted with the new address
    expect(OriginProtocolTokenUpdatedEvent.args[0]).to.equal(oldOETHAddress)
    expect(OriginProtocolTokenUpdatedEvent.args[1]).to.equal(user1.address)

    // Verify that the OETH contract address has been updated
    const updatedOETHAddress = await treasury.oETHTokenAddress()
    expect(updatedOETHAddress).to.equal(user1.address)
  })

  it("should not allow non-TREASURER to set OETH contract address", async function () {
    // Attempt to set the OETH contract address by a non-TREASURER
    await expect(treasury.connect(user1).setOETHContractAddress(NEW_TREASURER.address)).to.be.revertedWith(/AccessControl: account .* is missing role .*/)
  })

  /*addSupportedToken*/
  it("should allow TREASURER to add a supported token", async function () {

    const treasurerRole = treasury.TREASURER_ROLE()
    // grant MINTER role to signer (if not already granted)
    if (!(await treasury.hasRole(treasurerRole, TREASURER.address))) {
        await treasury.grantRole(treasurerRole, TREASURER.address)
    }

    // deploy a fake erc20 token 
    const token = await deployMockToken('FAKE', 'FKK')

    // add the token to the supported tokens array
    const tx = await treasury.connect(TREASURER).addSupportedToken(token.address)
    const txReceipt = await tx.wait()

    // const mintedEvent = txReceipt.events.find(event => event.event === 'TokensMintedWithSignature')
    const supportedTokenAddedEvent = txReceipt.events.find(event => event.event === 'SupportedTokenAdded')

    // Verify that the event was emitted with the expected args
    expect(supportedTokenAddedEvent.args[0]).to.equal(token.address)

    // Verify that the OETH contract address has been updated
    const supportedTokens = await treasury.supportedTokens()
    expect(supportedTokens).to.contain(token.address)
  })

  it("should not allow non-TREASURER to add a supported token", async function () {

    // deploy a fake erc20 token 
    const token = await deployMockToken('FAKE', 'FKK')

    // Attempt to set the OETH contract address by a non-TREASURER
    await expect(treasury.connect(user1).addSupportedToken(token.address)).to.be.revertedWith(/AccessControl: account .* is missing role .*/)
  })

  /*removeSupportedToken*/
  it("should allow TREASURER to remove a supported token", async function () {

    const treasurerRole = treasury.TREASURER_ROLE()
    // grant MINTER role to signer (if not already granted)
    if (!(await treasury.hasRole(treasurerRole, TREASURER.address))) {
        await treasury.grantRole(treasurerRole, TREASURER.address)
    }

    // deploy a fake erc20 token 
    const token = await deployMockToken('FAKE', 'FKK')

    // add the token to the supported tokens array
    const txAdd = await treasury.connect(TREASURER).addSupportedToken(token.address)
    const txReceipt = await txAdd.wait()

    // const mintedEvent = txReceipt.events.find(event => event.event === 'TokensMintedWithSignature')
    const supportedTokenAddedEvent = txReceipt.events.find(event => event.event === 'SupportedTokenAdded')

    // Verify that the event was emitted with the expected args
    expect(supportedTokenAddedEvent.args[0]).to.equal(token.address)

    // remove the token from the supported tokens array
    const txRemove = await treasury.connect(TREASURER).removeSupportedToken(token.address)
    const txRemoveReceipt = await txRemove.wait()

    // const mintedEvent = txReceipt.events.find(event => event.event === 'TokensMintedWithSignature')
    const supportedTokenRemovedEvent = txRemoveReceipt.events.find(event => event.event === 'SupportedTokenRemoved')

    // Verify that the event was emitted with the expected args
    expect(supportedTokenRemovedEvent.args[0]).to.equal(token.address)

    // Verify that the OETH contract address has been updated
    const supportedTokens = await treasury.supportedTokens()
    expect(supportedTokens).to.not.contain(token.address)
  })

  it("should not allow non-TREASURER to remove a supported token", async function () {

     const treasurerRole = treasury.TREASURER_ROLE()
    // grant MINTER role to signer (if not already granted)
    if (!(await treasury.hasRole(treasurerRole, TREASURER.address))) {
        await treasury.grantRole(treasurerRole, TREASURER.address)
    }

    // deploy a fake erc20 token 
    const token = await deployMockToken('FAKE', 'FKK')
    // add the token to the supported tokens array
    const tx = await treasury.connect(TREASURER).addSupportedToken(token.address)
    const txReceipt = await tx.wait()

    // const mintedEvent = txReceipt.events.find(event => event.event === 'TokensMintedWithSignature')
    const supportedTokenAddedEvent = txReceipt.events.find(event => event.event === 'SupportedTokenAdded')

    // Verify that the event was emitted with the expected args
    expect(supportedTokenAddedEvent.args[0]).to.equal(token.address)

    // Attempt to remove the token with a non-Treasurer account
    await expect(treasury.connect(user1).removeSupportedToken(token.address)).to.be.revertedWith(/AccessControl: account .* is missing role .*/)
  })

  /*addLockedFund*/
  it("should allow Factory to add a fund to the lockedFund array", async function () {

    // deploy the factory
    const factory = deployedContracts.factory

    const makeFundFee = ethers.utils.parseUnits("0.004", "ether")
    const mr = await generateMintRequest(factory.address, INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1.address)
    const tx = await factory.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).mintWithSignature(
      mr.typedData.message, mr.signature, { value: makeFundFee })
    const txReceipt = await tx.wait()

    // get the fund
    const fundCreatedEvent = txReceipt.events.find(event => event.event === 'FundDeployed')
    const Fund = await ethers.getContractFactory("Fund")
    const fund = Fund.attach(fundCreatedEvent.args.fund)

    const filter = treasury.filters.LockedFundAdded();
    const events = await treasury.queryFilter(filter, txReceipt.blockNumber);

    // Verify that the token was minted and assigned to the correct recipient
    const balance = await factory.balanceOf(user1.address, 0)
    expect(events[0].args[0]).to.equal(fund.address)
  })

  it("should not allow non-Factory to add a fund to the lockedFund array", async function () {

    // deploy the factory
    const MockFactory = await ethers.getContractFactory("MockFactory")
    const fake_factory = await MockFactory.deploy(feeRecipient.address)
    // wait for it to finish deploying
    await fake_factory.deployed()

    // set the treasurey in our fake factory:
    await fake_factory.setTreasury(treasury.address)

    const makeFundFee = ethers.utils.parseUnits("0.004", "ether")
    const mr = await generateMintRequest(fake_factory.address, INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1.address)
    const tx = await expect(fake_factory.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).mintWithSignature(
      mr.typedData.message, mr.signature, { value: makeFundFee })).to.be.revertedWith('onlyFactory')
  })

  /*moveToOpenFund*/
  it("should allow Factory to move a fund to the openFunds array", async function () {

    // get the deployed factory
    const factory = deployedContracts.factory
    const makeFundFee = ethers.utils.parseUnits("0.004", "ether")
    const mr = await generateMintRequest(factory.address, INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1.address)
    const tx = await factory.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).mintWithSignature(
      mr.typedData.message, mr.signature, { value: makeFundFee })
    const txReceipt = await tx.wait()

    // get the fund
    const fundCreatedEvent = txReceipt.events.find(event => event.event === 'FundDeployed')
    const Fund = await ethers.getContractFactory("Fund")
    const fund = Fund.attach(fundCreatedEvent.args.fund)

    // send 1 ETH to the fund to unlock it
    const amountToSend = ethers.utils.parseEther("1")
    await user2.sendTransaction({
      to: fund.address,
      value: amountToSend,
    })

    // move time forward 100 days
    await helpers.time.increase(60 * 60 * 24 * 100) // 3 days

    const txPayout = await factory.connect(user1).payout(0)
    const txPayoutReceipt = await txPayout.wait()

    const filter = treasury.filters.MovedToOpenFund();
    const events = await treasury.queryFilter(filter, txPayoutReceipt.blockNumber)

    expect(events[0].args[0]).to.equal(fund.address)
  })

  it("should not allow non-Factory to move a fund to the openFunds array", async function () {

    const makeFundFee = ethers.utils.parseUnits("0.004", "ether")
    const FundImplementation = await ethers.getContractFactory("Fund")
    const Treasury = await ethers.getContractFactory("Treasury")

    // get the deployed factory
    const factory = deployedContracts.factory
    // now deploy the mock factory
    const MockFactory = await ethers.getContractFactory("MockFactory")
    const fake_factory = await MockFactory.deploy(feeRecipient.address)
    // wait for it to finish deploying
    await fake_factory.deployed()

    // set fake fund implementation & treasury
    const fake_treasury = await Treasury.deploy(fake_factory.address)
    await fake_treasury.deployed()

    // deploy the fund implementation that will be cloned for each new fund
    const fake_fundImplementation = await FundImplementation.deploy(fake_factory.address, fake_treasury.address)
    await fake_fundImplementation.deployed()

    //set the implementation in the contract
    await fake_factory.setFundImplementation(fake_fundImplementation.address)

    //set the generator in the contract
    await fake_factory.setTreasury(fake_treasury.address)

    // generate a real mint request
    const mr = await generateMintRequest(factory.address, INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1.address)
    // generate a fake mint request
    const mr_fake = await generateMintRequest(fake_factory.address, INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1.address)

    // use the real mint request to mint from the real factory
    const txMint = await factory.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).mintWithSignature(
      mr.typedData.message, mr.signature, { value: makeFundFee })
    const txReceipt = await txMint.wait()
    // use the fake mint request to mint from the fake factory
    const txFakeMint = await fake_factory.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).mintWithSignature(
      mr_fake.typedData.message, mr_fake.signature, { value: makeFundFee })
    const txFakeReceipt = await txFakeMint.wait()

    // get the real fund that we want to set to open in the real treasury, with our fake factory
    const fundCreatedEvent = txReceipt.events.find(event => event.event === 'FundDeployed')
    const Fund = await ethers.getContractFactory("Fund")
    const fund = Fund.attach(fundCreatedEvent.args.fund)

    // now we have two identical mints, we swap the fake treasury and fund for the real ones...

    // get the real fund implementation from the real factory
    const fundImpl = await factory.fundImplementation()

    //set the real fund implementation in the fake contract
    await fake_factory.setFundImplementation(fundImpl)

    // set the real treasurey in our fake factory:
    await fake_factory.setTreasury(treasury.address)

    // send 1 ETH to the fund to unlock it
    const amountToSend = ethers.utils.parseEther("1")
    await user2.sendTransaction({
      to: fund.address,
      value: amountToSend,
    })

    // move time forward 100 days
    await helpers.time.increase(60 * 60 * 24 * 100) // 3 days

    // call our mock move to open function:
    const txFakePayout = await expect(fake_factory.connect(user1).moveToOpenFund(fund.address)).to.be.revertedWith('onlyFactory')
  })

  /*collect*/
  it("should allow TREASURER to collect open funds", async function () {
    // Grant TREASURER_ROLE to the user
    await treasury.grantRole(await treasury.TREASURER_ROLE(), TREASURER.address);

    // Mint a new fund and move it to the openFunds array
    // get the deployed factory
    const factory = deployedContracts.factory
    const makeFundFee = ethers.utils.parseUnits("0.004", "ether")
    const mr = await generateMintRequest(factory.address, INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1.address)
    const tx = await factory.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).mintWithSignature(
      mr.typedData.message, mr.signature, { value: makeFundFee })
    const txReceipt = await tx.wait()

    // get the fund
    const fundCreatedEvent = txReceipt.events.find(event => event.event === 'FundDeployed')
    const Fund = await ethers.getContractFactory("Fund")
    const fund = Fund.attach(fundCreatedEvent.args.fund)

    // send 1 ETH to the fund to unlock it
    const amountToSend = ethers.utils.parseEther("1")
    await user2.sendTransaction({
      to: fund.address,
      value: amountToSend,
    })

    // move time forward 100 days
    await helpers.time.increase(60 * 60 * 24 * 100) // 3 days

    const txPayout = await factory.connect(user1).payout(0)
    const txPayoutReceipt = await txPayout.wait()

    const filter = treasury.filters.MovedToOpenFund();
    const events = await treasury.queryFilter(filter, txPayoutReceipt.blockNumber)

    expect(events[0].args[0]).to.equal(fund.address)

    // send another 1 ETH to the fund so there's something to collect
    await user2.sendTransaction({
      to: fund.address,
      value: amountToSend,
    })

    // Get the initial treasury balance
    const initialTreasuryBalance = await ethers.provider.getBalance(treasury.address);

    // Call the collect function as TREASURER
    const tx2 = await treasury.connect(TREASURER).collect();
    const tx2Receipt = await tx2.wait();

    // Verify that the CollectedOpenFunds event was emitted
    const collectedOpenFundsEvent = tx2Receipt.events.find(event => event.event === 'CollectedOpenFunds');
    expect(collectedOpenFundsEvent).to.exist;

    // Get the final treasury balance after collecting
    const finalTreasuryBalance = await ethers.provider.getBalance(treasury.address);

    // Verify that the treasury balance has changed
    expect(finalTreasuryBalance).to.be.gt(initialTreasuryBalance);
  });

  it("should not allow non-TREASURER to collect open funds", async function () {
    // Attempt to collect open funds as a non-TREASURER user
    await expect(treasury.connect(user1).collect()).to.be.revertedWith(/AccessControl: account .* is missing role .*/);
  });

  /*distributeNativeToken*/
  it("should allow TREASURER to distribute native token balance to locked funds", async function () {
    // Grant TREASURER_ROLE to the user
    await treasury.grantRole(await treasury.TREASURER_ROLE(), TREASURER.address);

    // Mint a new locked fund
    // get the deployed factory
    const factory = deployedContracts.factory
    const makeFundFee = ethers.utils.parseUnits("0.004", "ether")
    const mr = await generateMintRequest(factory.address, INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1.address)
    const tx = await factory.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).mintWithSignature(
      mr.typedData.message, mr.signature, { value: makeFundFee })
    const txReceipt = await tx.wait()

    // get the fund
    const fundCreatedEvent = txReceipt.events.find(event => event.event === 'FundDeployed')
    const Fund = await ethers.getContractFactory("Fund")
    const fund = Fund.attach(fundCreatedEvent.args.fund)

    // send 0.9 ETH to the fund to keep it locked
    const amountToSendToLockedFund = ethers.utils.parseEther("0.9")
    await user2.sendTransaction({
      to: fund.address,
      value: amountToSendToLockedFund,
    })

    // Send ETH and supported tokens to the treasury contract
    const amountToSendToTreasury = ethers.utils.parseEther("2")
    await user2.sendTransaction({
      to: treasury.address,
      value: amountToSendToTreasury,
    })

    // add supported tokens - to do in functionality tests
    const treasuryBalance = await ethers.provider.getBalance(treasury.address)
    const lockedFunds = await treasury.lockedFunds(0)

    // Call the distribute function as TREASURER
    const tx2 = await treasury.connect(TREASURER).distributeNativeToken();
    const tx2Receipt = await tx2.wait();

    // Verify that the DistributedOpenFundsToLockedFunds event was emitted
    const distributedNativeTokensToLockedFundsEvent = tx2Receipt.events.find(event => event.event === 'DistributedNativeTokensToLockedFunds');
    expect(distributedNativeTokensToLockedFundsEvent).to.exist;
  });

  it("should not allow non-TREASURER to distribute native token balance to locked funds", async function () {
    // Attempt to distribute funds as a non-TREASURER user
    await expect(treasury.connect(user1).distributeNativeToken()).to.be.revertedWith(/AccessControl: account .* is missing role .*/);
  });

  /*distributeSupportedTokens*/
  it("should allow TREASURER to distribute supported token balances to locked funds", async function () {
    // Grant TREASURER_ROLE to the user
    await treasury.grantRole(await treasury.TREASURER_ROLE(), TREASURER.address);

    // Mint a new locked fund
    // get the deployed factory
    const factory = deployedContracts.factory
    const makeFundFee = ethers.utils.parseUnits("0.004", "ether")
    const mr = await generateMintRequest(factory.address, INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1.address)
    const tx = await factory.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).mintWithSignature(
      mr.typedData.message, mr.signature, { value: makeFundFee })
    const txReceipt = await tx.wait()

    // get the fund
    const fundCreatedEvent = txReceipt.events.find(event => event.event === 'FundDeployed')
    const Fund = await ethers.getContractFactory("Fund")
    const fund = Fund.attach(fundCreatedEvent.args.fund)

    // send 0.9 ETH to the fund to keep it locked
    const amountToSendToLockedFund = ethers.utils.parseEther("0.9")
    await user2.sendTransaction({
      to: fund.address,
      value: amountToSendToLockedFund,
    })

    // Send ETH and supported tokens to the treasury contract
    const amountToSendToTreasury = ethers.utils.parseEther("2")
    await user2.sendTransaction({
      to: treasury.address,
      value: amountToSendToTreasury,
    })

    // deploy a fake erc20 token 
    //const token = await deployMockToken('FAKE', 'FKK')

    // get the array of target funds
    const lockedFund = []
    lockedFund[0] = await treasury.lockedFunds(0)

    // Call the distribute function as TREASURER
    const tx2 = await treasury.connect(TREASURER).distributeSupportedTokens(lockedFund);
    const tx2Receipt = await tx2.wait();

    // Verify that the DistributedOpenFundsToLockedFunds event was emitted
    const distributedSupportedTokensToLockedFundsEvent = tx2Receipt.events.find(event => event.event === 'DistributedSupportedTokensToLockedFunds');
    expect(distributedSupportedTokensToLockedFundsEvent).to.exist;
  });

})

describe("Testing Fund Roles & permissions", function () {

  let fund, factory, treasury
  let INITIAL_DEFAULT_ADMIN_AND_SIGNER, FEE_RECIPIENT, TREASURER, user1, user2

  beforeEach(async function () {
    [INITIAL_DEFAULT_ADMIN_AND_SIGNER, FEE_RECIPIENT, TREASURER, user1, user2] = await ethers.getSigners()

    // Deploy Factory and Treasury contracts
    const deployedContracts = await deploy(FEE_RECIPIENT.address)
    factory = deployedContracts.factory
    treasury = deployedContracts.treasury

    // Grant TREASURER_ROLE
    await treasury.grantRole(await treasury.TREASURER_ROLE(), TREASURER.address);

    const hasSignerRole = await factory.hasRole(factory.SIGNER_ROLE(), INITIAL_DEFAULT_ADMIN_AND_SIGNER.address)
    expect(hasSignerRole).to.be.true

    const makeFundFee = ethers.utils.parseUnits("0.004", "ether")
    const mr = await generateMintRequest(factory.address, INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1.address)

    const tx = await factory.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).mintWithSignature(mr.typedData.message, mr.signature, { value: makeFundFee })
    const txReceipt = await tx.wait()

    // Verify that the token was minted and assigned to the correct recipient
    const balance = await factory.balanceOf(user1.address, 0)
    expect(balance).to.equal(4)

    // const mintedEvent = txReceipt.events.find(event => event.event === 'TokensMintedWithSignature')
    const fundCreatedEvent = txReceipt.events.find(event => event.event === 'FundDeployed')

    const Fund = await ethers.getContractFactory("Fund")
    fund = Fund.attach(fundCreatedEvent.args.fund)
  })

  it("should not allow non-factory to initialize the fund contract", async function () {
    // Attempt to call a function using onlyFactory modifier by a non-Factory account
    await expect(fund.connect(user1).initialize({}, 500)).to.be.reverted
  })

  it("should allow Factory to call payout function", async function () {
    // Call the payout function using onlyFactory modifier
    await expect(factory.connect(user1).payout(0)).to.be.revertedWith('You can\'t withdraw yet')
  })

  it("should not allow User to call payout function", async function () {
    // Attempt to call the payout function using onlyFactory modifier by a non-Factory account
    await expect(fund.connect(user1).payout(user1.address, FEE_RECIPIENT.address, 1, 1)).to.be.revertedWith("onlyFactory")
  })

  it("should allow Treasury to call sendToTreasury", async function () {
    // Call a function using onlyTreasury modifier
    await expect (treasury.connect(TREASURER).collect()).to.be.revertedWith('No open funds to collect from')
    // No revert is expected
  })

  it("should not allow User to call sendToTreasury", async function () {
    // Attempt to call a function using onlyTreasury modifier by a non-Treasury account
    await expect(fund.connect(user1).sendToTreasury()).to.be.revertedWith("onlyTreasury")
  })
})

describe("Testing Generator Roles & permissions", function () {
  let factory, generator
  let INITIAL_DEFAULT_ADMIN_AND_SIGNER
  let user1
  let feeRecipient

  beforeEach(async function () {
    [INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1, feeRecipient] = await ethers.getSigners()
    const deployedContracts = await deploy(feeRecipient.address)
    generator = deployedContracts.generator
  })

  it("should allow DEFAULT ADMIN run setSvgColours()", async function () {
    expect(await generator.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).setSvgColours(0x00300088, 0x300000, 0xf00000, 0x200000, 0xc00000))
  })

  it("should not allow non DEFAULT ADMIN run setSvgColours()", async function () {
    await expect(generator.connect(user1).setSvgColours(0x00300088, 0x300000, 0xf00000, 0x200000, 0xc00000)).to.be.revertedWith(/AccessControl: account .* is missing role .*/)
  })

})