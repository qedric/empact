// We import Chai to use its asserting functions here.
const { expect, assert } = require("chai")
const { ethers, upgrades, network } = require("hardhat")
const helpers = require("@nomicfoundation/hardhat-network-helpers")
const { deploy, deployFundImplementation, deployGenerator, deployTreasury, getTypedData, getRevertReason, getCurrentBlockTime, deployMockToken, generateMintRequest, makeFund } = require("./test_helpers")

const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000'

describe("Fund Creation", function () {

  let factory
  let INITIAL_DEFAULT_ADMIN_AND_SIGNER, NEW_SIGNER
  let FAKE_FUND_IMPL, FAKE_GENERATOR, FAKE_TREASURY
  let user1, user2
  let feeRecipient, newFeeRecipient

  before(async function () {
    [INITIAL_DEFAULT_ADMIN_AND_SIGNER, NEW_SIGNER, FAKE_FUND_IMPL, FAKE_GENERATOR, FAKE_TREASURY, user1, user2, feeRecipient, newFeeRecipient] = await ethers.getSigners()
  })

  beforeEach(async function () {
    const deployedContracts = await deploy(feeRecipient.address, 'https://zebra.xyz/')
    factory = deployedContracts.factory
  })

  /*
    1. calls factory mintWithSignature()
    2. checks that user received the minted tokens
    3. checks that TokensMintedWithSignature' event was fired with correct args
    4. checks that FundDeployed event was fired with correct args
    5. checks that fund's FundInitialised event was fired with correct args
    6. gets fund attributes and checks they have expected values
  */
  it("should successfully mint new tokens and initalise funds", async function () {
    const makeFundFee = ethers.utils.parseUnits("0.004", "ether")
    const mr = await generateMintRequest(factory.address, INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1.address)

    const initialBalanceUser1 = await factory.balanceOf(user1.address, 0)

    const tx = await factory.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).mintWithSignature(mr.typedData.message, mr.signature, { value: makeFundFee })

    // Verify that the token was minted and assigned to the correct recipient
    const finalBalanceUser1 = await factory.balanceOf(user1.address, 0)
    expect(finalBalanceUser1).to.equal(initialBalanceUser1.add(4))

    // Verify events in the Factory contract
    const tokensMintedEvent = await factory.queryFilter('TokensMintedWithSignature', tx.blockHash)
    expect(tokensMintedEvent.length).to.equal(1)
    expect(tokensMintedEvent[0].args.signer).to.equal(INITIAL_DEFAULT_ADMIN_AND_SIGNER.address)
    expect(tokensMintedEvent[0].args.mintedTo).to.equal(user1.address)
    expect(tokensMintedEvent[0].args.tokenIdMinted.toNumber()).to.equal(0)

    const fundDeployedEvent = await factory.queryFilter('FundDeployed', tx.blockHash)
    expect(fundDeployedEvent.length).to.equal(1)
    expect(fundDeployedEvent[0].args.msgSender).to.equal(INITIAL_DEFAULT_ADMIN_AND_SIGNER.address)

    // Retrieve the fund address from the FundDeployed event
    const fundAddress = fundDeployedEvent[0].args.fund

    // Verify events in the Fund contract
    const fundContract = await ethers.getContractAt('IFund', fundAddress)
    const fundInitialisedEvent = await fundContract.queryFilter('FundInitialised', tx.blockHash)
    expect(fundInitialisedEvent.length).to.equal(1)
    expect(fundInitialisedEvent[0].args.attributes.tokenId).to.equal(0)

    // Verify the attributes of the Fund contract
    const fundAttributes = await fundContract.attributes()
    expect(fundAttributes.tokenId).to.equal(0)
    expect(fundAttributes.unlockTime).to.equal(mr.typedData.message.unlockTime)
    expect(fundAttributes.targetBalance).to.equal(mr.typedData.message.targetBalance)
    expect(fundAttributes.name).to.equal(mr.typedData.message.name)
    expect(fundAttributes.description).to.equal(mr.typedData.message.description)
  })

  it("should not allow a signature to be used before the start time", async function() {
    // Generate a signature for the mint request
    const timestamp = await ethers.provider.getBlockNumber().then(blockNumber =>
    // getBlock returns a block object and it has a timestamp property.
    ethers.provider.getBlock(blockNumber).then(block => block.timestamp))
    const startTime = Math.floor(timestamp + 60 * 60 * 24 * 2) // + 2 days - should FAIL
    const endTime = Math.floor(timestamp + 60 * 60 * 24 * 7) // + 7 days
    const unlockTime = Math.floor(timestamp + 60 * 60 * 24 * 99)
    const targetBalance = ethers.utils.parseUnits("1", "ether").toString()

    const typedData = await getTypedData(
      factory.address,
      user1.address,
      startTime,
      endTime,
      4,
      unlockTime,
      targetBalance,
      'A test fund',
      'invalid start time'    
    )

    const mr = await generateMintRequest(
      factory.address,
      INITIAL_DEFAULT_ADMIN_AND_SIGNER,
      user1.address,
      typedData
    )

    const makeFundFee = ethers.utils.parseUnits("0.004", "ether")

    await expect(factory.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).mintWithSignature(
      mr.typedData.message,
      mr.signature,
      { value: makeFundFee })
    ).to.be.revertedWith("Request expired")
  })

  it("should not allow a signature to be used after the expiry time", async function() {
    const timestamp = await ethers.provider.getBlockNumber().then(blockNumber =>
    // getBlock returns a block object and it has a timestamp property.
    ethers.provider.getBlock(blockNumber).then(block => block.timestamp))
    const startTime = Math.floor(timestamp - 60 * 60 * 24 * 7) // a week ago
    const endTime = Math.floor(timestamp - 60 * 60 * 24 * 3) // 3 days ago
    const unlockTime = Math.floor(timestamp + 60 * 60 * 24 * 99)
    const targetBalance = ethers.utils.parseUnits("1", "ether").toString()

    const typedData = await getTypedData(
      factory.address,
      user1.address,
      startTime,
      endTime,
      4,
      unlockTime,
      targetBalance,
      'A test fund',
      'invalid end time'    
    )

    const mr = await generateMintRequest(
      factory.address,
      INITIAL_DEFAULT_ADMIN_AND_SIGNER,
      user1.address,
      typedData
    )

    const makeFundFee = ethers.utils.parseUnits("0.004", "ether")

    await expect(factory.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).mintWithSignature(
      mr.typedData.message,
      mr.signature,
      { value: makeFundFee })
    ).to.be.revertedWith("Request expired")
  }) 

  it("should fail if a user sets unlock date in the past AND targetbalance <= 0", async function () {
    const timestamp = await ethers.provider.getBlockNumber().then(blockNumber =>
    // getBlock returns a block object and it has a timestamp property.
    ethers.provider.getBlock(blockNumber).then(block => block.timestamp))
    const startTime = Math.floor(timestamp - 60 * 60 * 24 * 7) // a week ago
    const endTime = Math.floor(timestamp + 60 * 60 * 24 * 3) // in 3 days

    const unlockTime = Math.floor(Date.now() / 1000) - 60 // 60 seconds in the past
    const targetBalance = 0

    const typedData = await getTypedData(
      factory.address,
      user1.address,
      startTime,
      endTime,
      4,
      unlockTime,
      targetBalance,
      'A test fund',
      'invalid unlock time with targetBalance zero'    
    )

    const mr = await generateMintRequest(
      factory.address,
      INITIAL_DEFAULT_ADMIN_AND_SIGNER,
      user1.address,
      typedData
    )

    const makeFundFee = ethers.utils.parseUnits("0.004", "ether")
    await expect(factory.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).mintWithSignature(
      mr.typedData.message,
      mr.signature,
      { value: makeFundFee })
    ).to.be.revertedWith("Unlock time should be in the future, or target balance greater than 0")
  })

  it("should fail if a the quantity is <= 0", async function () {

     // Generate a signature for the mint request
    const timestamp = await ethers.provider.getBlockNumber().then(blockNumber =>
    // getBlock returns a block object and it has a timestamp property.
    ethers.provider.getBlock(blockNumber).then(block => block.timestamp))
    const startTime = Math.floor(timestamp - 60 * 60 * 24 * 7) // a week ago
    const endTime = Math.floor(timestamp + 60 * 60 * 24 * 7) // + 7 days
    const unlockTime = Math.floor(timestamp + 60 * 60 * 24 * 99)
    const targetBalance = ethers.utils.parseUnits("1", "ether").toString()

    const typedData = await getTypedData(
      factory.address,
      user1.address,
      startTime,
      endTime,
      0,
      unlockTime,
      targetBalance,
      'A test fund',
      'invalid start time'    
    )

    const mr = await generateMintRequest(
      factory.address,
      INITIAL_DEFAULT_ADMIN_AND_SIGNER,
      user1.address,
      typedData
    )

    const makeFundFee = ethers.utils.parseUnits("0.004", "ether")
    await expect(factory.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).mintWithSignature(
      mr.typedData.message,
      mr.signature,
      { value: makeFundFee })
    ).to.be.revertedWith("Minting zero tokens.")
  })
})

describe("Configuration", function () {

  let owner, feeRecipient
  let factory, treasury

  before(async function () {
    [owner, feeRecipient] = await ethers.getSigners()
  })

  beforeEach(async function () {
    const deployedContracts = await deploy(feeRecipient.address, 'https://zebra.xyz/')
    factory = deployedContracts.factory
    treasury = deployedContracts.treasury
  })

  it("should set the token URL prefix and emit the TokenUrlPrefixUpdated event", async function () {
    const newTokenUrlPrefix = "https://new-prefix.com/"
    const receipt = await factory.connect(owner).setTokenUrlPrefix(newTokenUrlPrefix)

    const events = await factory.queryFilter("TokenUrlPrefixUpdated", receipt.blockHash)
    expect(events.length).to.equal(1)

    const event = events[0]
    expect(event.args.oldPrefix).to.equal("https://zebra.xyz/")
    expect(event.args.newPrefix).to.equal(newTokenUrlPrefix)
  })

  it("should set the make fund fee and emit the MakeFundFeeUpdated event", async function () {
    const newMakeFundFee = ethers.utils.parseUnits("0.005", "ether")
    const receipt = await factory.connect(owner).setMakeFundFee(newMakeFundFee)

    const events = await factory.queryFilter("MakeFundFeeUpdated", receipt.blockHash)
    expect(events.length).to.equal(1)

    const event = events[0]
    expect(event.args.fee).to.equal(newMakeFundFee)
  })

  it("should set the break fund fee basis points and emit the BreakFundBpsUpdated event", async function () {
    const newBreakFundBps = 500 // 5% represented in basis points
    const receipt = await factory.connect(owner).setBreakFundBps(newBreakFundBps)

    const events = await factory.queryFilter("BreakFundBpsUpdated", receipt.blockHash)
    expect(events.length).to.equal(1)

    const event = events[0]
    expect(event.args.bps).to.equal(newBreakFundBps)
  })

  it("should set the fee recipient and emit the FeeRecipientUpdated event", async function () {
    const newFeeRecipient = await ethers.Wallet.createRandom().address
    const receipt = await factory.connect(owner).setFeeRecipient(newFeeRecipient)

    const events = await factory.queryFilter("FeeRecipientUpdated", receipt.blockHash)
    expect(events.length).to.equal(1)

    const event = events[0]
    expect(event.args.recipient).to.equal(newFeeRecipient)
  })

  it("should set the Fund implementation address and emit the FundImplementationUpdated event", async function () {
    const newFundImplementation = await deployFundImplementation(factory.address, treasury.address)
    const receipt = await factory.connect(owner).setFundImplementation(newFundImplementation.address)

    const events = await factory.queryFilter("FundImplementationUpdated", receipt.blockHash)
    expect(events.length).to.equal(1)

    const event = events[0]
    expect(event.args.implementation).to.equal(newFundImplementation.address)
  })

  it("should set the Generator address and emit the GeneratorUpdated event", async function () {
    const newGenerator = await deployGenerator()
    const receipt = await factory.connect(owner).setGenerator(newGenerator.address)

    const events = await factory.queryFilter("GeneratorUpdated", receipt.blockHash)
    expect(events.length).to.equal(1)

    const event = events[0]
    expect(event.args.generator).to.equal(newGenerator.address)
  })

  it("should set the Treasury address and emit the TreasuryUpdated event", async function () {
    const newTreasury = await deployTreasury(factory.address)
    const receipt = await factory.connect(owner).setTreasury(newTreasury.address)

    const events = await factory.queryFilter("TreasuryUpdated", receipt.blockHash)
    expect(events.length).to.equal(1)

    const event = events[0]
    expect(event.args.treasury).to.equal(newTreasury.address)
  })
})

describe("Payout", function () {

  let factory, fund
  let INITIAL_DEFAULT_ADMIN_AND_SIGNER
  let user1, user2
  let feeRecipient

  before(async function () {
    [INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1, user2, feeRecipient] = await ethers.getSigners()
  })

  beforeEach(async function () {
    const deployedContracts = await deploy(feeRecipient.address, 'https://zebra.xyz/')
    factory = deployedContracts.factory
    fund = await makeFund(factory, INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1)
  })

  /*
    1. check that user has a balance
    2. send enough funds to unlock
    3. execute payout
    4. check that tokens have been burned
  */
  it("Payout should succeed when token exists and user has balance; tokens should then be burned", async function () {

    // Verify that the token was minted and assigned to the correct recipient
    const intialBalanceUser1 = await factory.balanceOf(user1.address, 0)
    expect(intialBalanceUser1).to.equal(4)

    //send enough ETH
    const amountToSend = ethers.utils.parseEther("1")
    let receiveTx = await user2.sendTransaction({
      to: fund.address,
      value: amountToSend,
    })

    // get the Received event from the transaction
    let events = await fund.queryFilter("Received", receiveTx.blockHash)

    // get the TargetReached event from the transaction
    events = await fund.queryFilter("TargetReached", receiveTx.blockHash)

    // Increase block time to after the unlockTime
    await helpers.time.increase(60 * 60 * 24 * 100) // 100 days

    // Call setTargetReached()
    const targetReachedTx = await fund.setTargetReached()

    // get the StateChanged event from the transaction
    events = await fund.queryFilter("StateChanged", targetReachedTx.blockHash)

    // Call the payout function
    const payoutTx = await factory.connect(user1).payout(0)
    await payoutTx.wait()

    // Verify that the tokens were burned
    const balanceUser1 = await factory.balanceOf(user1.address, 0)
    expect(balanceUser1).to.equal(0)
  })

  /*
    1. check fund is locked
    2. send insufficient funds, check it's still locked
    3. send enough funds to unlock, check state is unlocked
  */
  it("should payout ETH only, with expected events and arguments", async function () {

    // check the state is locked
    expect(await fund.state()).to.equal(0)

    // Verify that the token was minted and assigned to the correct recipient
    const balanceUser1 = await factory.balanceOf(user1.address, 0)
    expect(balanceUser1).to.equal(4)

    //send not enough ETH
    const amountToSend = ethers.utils.parseEther("0.5")

    // Send the ETH to the fund contract
    let receiveTx = await user2.sendTransaction({
      to: fund.address,
      value: amountToSend,
    })

    // get the Received event from the transaction
    let events = await fund.queryFilter("Received", receiveTx.blockHash)

    // Increase block time to after the unlockTime
    await helpers.time.increase(60 * 60 * 24 * 100) // 100 days

    // check the state is still locked
    expect(await fund.state()).to.equal(0)

    // try a payout - it should fail
    //expect(factory.connect(user1).payout(0)).to.be.revertedWith('FFund must be Unlocked')

    // Send enough ETH to unlock the fund
    receiveTx = await user2.sendTransaction({
      to: fund.address,
      value: amountToSend,
    })

    // get the 2nd Received event from the transaction
    events = await fund.queryFilter("Received", receiveTx.blockHash)

    // get the TargetReached event from the transaction
    events = await fund.queryFilter("TargetReached", receiveTx.blockHash)

    // get the StateChanged event from the transaction
    events = await fund.queryFilter("StateChanged", receiveTx.blockHash)

    // Call the payout function
    const payoutTx = await factory.connect(user1).payout(0)
    await payoutTx.wait()

    events = await fund.queryFilter("Withdrawal", payoutTx.blockHash)
    expect(events.length).to.equal(1)

    const event = events[0]
    expect(event.args.who).to.equal(user1.address)
    expect(event.args.amount).to.equal(4)
    expect(event.args.balance).to.equal(initialSupply)

    const feeEvents = await fund.queryFilter("SupportedTokenWithdrawal", payoutTx.blockHash)
    expect(feeEvents.length).to.equal(1)

    const feeEvent = feeEvents[0]
    expect(feeEvent.args.recipient).to.equal(recipient.address)
    // Add similar checks for other event arguments as needed
  })

  /*
    1. create a fund with target 1ETH
    2. check that state == locked
    3. send 1 ETH to the fund
    4. check that the state == unlocked
  */
  it("should payout ETH and supported tokens, with expected events and arguments", async function () {

    //send enough ETH
    const amountToSend = ethers.utils.parseEther("1")

    // Send the ETH to the fund contract
    await nonOwner.sendTransaction({
      to: fund.address,
      value: amountToSend,
    })

    // Simulate reaching the target balance
    await fund.connect(owner).setTargetReached()

    // Call the payout function
    const payoutTx = await fundFactory
      .connect(owner)
      .payout(recipient.address, feeRecipient.address, initialSupply, initialSupply)

    await payoutTx.wait()

    const events = await fund.queryFilter("Withdrawal", payoutTx.blockHash)
    expect(events.length).to.equal(1)

    const event = events[0]
    expect(event.args.recipient).to.equal(recipient.address)
    expect(event.args.payoutAmount).to.equal(initialSupply)
    expect(event.args.thisOwnerBalance).to.equal(initialSupply)

    const feeEvents = await fund.queryFilter("SupportedTokenWithdrawal", payoutTx.blockHash)
    expect(feeEvents.length).to.equal(1)

    const feeEvent = feeEvents[0]
    expect(feeEvent.args.recipient).to.equal(recipient.address)
    // Add similar checks for other event arguments as needed
  })

  it("should update the fund state to Open when last payout", async function () {
    // Simulate reaching the target balance
    await fund.connect(owner).setTargetReached()

    // Call the payout function
    const payoutTx = await fundFactory
      .connect(owner)
      .payout(recipient.address, feeRecipient.address, initialSupply, initialSupply)

    await payoutTx.wait()

    const newState = await fundFactory.getFundState(fund.address)
    expect(newState).to.equal(State.Open)
  })

  it("should not update the fund state to Open when not the last payout", async function () {
    // Simulate reaching the target balance
    await fund.connect(owner).setTargetReached()

    // Call the payout function multiple times
    await fundFactory.connect(owner).payout(recipient.address, feeRecipient.address, initialSupply, initialSupply)
    await fundFactory.connect(owner).payout(recipient.address, feeRecipient.address, initialSupply, initialSupply)

    const newState = await fundFactory.getFundState(fund.address)
    expect(newState).to.equal(State.Unlocked)
  })

  // Add more tests as needed to cover all scenarios and edge cases
})