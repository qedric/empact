// We import Chai to use its asserting functions here.
const { expect, assert } = require("chai")
const { ethers, upgrades, network } = require("hardhat")
const helpers = require("@nomicfoundation/hardhat-network-helpers")
const { deploy, deployFundImplementation, deployGenerator, deployTreasury, getTypedData, getRevertReason, getCurrentBlockTime, deployMockToken, deployMockOETHToken, generateMintRequest, makeFund, makeFund_100edition_target100_noUnlockTime, makeFund_100edition_notarget_99days } = require("./test_helpers")

const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000'

describe("Fund Creation", function () {

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
  })

  /*
    1. calls factory mintWithSignature()
    2. checks that fund's FundInitialised event was fired with correct args
    3. gets fund attributes and checks they have expected values
  */
  it("should successfully mint new tokens and initalise fund with correct attributes", async function () {
    const makeFundFee = ethers.utils.parseUnits("0.004", "ether")
    const mr = await generateMintRequest(factory.address, INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1.address)

    const initialBalanceUser1 = await factory.balanceOf(user1.address, 0)

    const tx = await factory.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).mintWithSignature(mr.typedData.message, mr.signature, { value: makeFundFee })

    // Retrieve the fund address from the FundDeployed event
    const fundDeployedEvent = await factory.queryFilter('FundDeployed', tx.blockHash)

    // Verify events in the Fund contract
    const fundContract = await ethers.getContractAt('IFund', fundDeployedEvent[0].args.fund)
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
})

describe("Configuration", function () {

  let owner, feeRecipient, user1
  let factory, treasury, fund

  before(async function () {
    [owner, feeRecipient, user1] = await ethers.getSigners()
  })

  beforeEach(async function () {
    const deployedContracts = await deploy(feeRecipient.address, 'https://zebra.xyz/')
    factory = deployedContracts.factory
    treasury = deployedContracts.treasury
    fund = await makeFund(factory, owner, user1)
  })

  it("should successfully opt in for oETH rebasing and emit event", async function () {
    const oETHToken = await deployMockOETHToken()
    await treasury.setOETHContractAddress(oETHToken.address)
    expect(await treasury.oETHTokenAddress()).to.equal(oETHToken.address)
    const tx = await fund.optInForOETHRebasing()
    const optedInForOriginProtocolRebasingEvent = await fund.queryFilter('OptedInForOriginProtocolRebasing', tx.blockHash)
    expect(optedInForOriginProtocolRebasingEvent.length).to.equal(1)
  })

  it("should revert if opting in again", async function () {
    const oETHToken = await deployMockOETHToken()
    await treasury.setOETHContractAddress(oETHToken.address)
    const tx = await fund.optInForOETHRebasing()
    tx.wait()
    await expect(fund.optInForOETHRebasing()).to.be.revertedWith('oETH rebasing already enabled')
  })

  it("should revert if oETH contract address is not set in the treasury", async function () {
    await expect(fund.optInForOETHRebasing()).to.be.revertedWith('oETH contract address is not set')
  })

  it("should setStateUnlocked and emit StateChanged if fund is locked & target and unlock date met", async function () {
    //send enough ETH
    const amountToSend = ethers.utils.parseEther("1")
    let receiveTx = await user1.sendTransaction({
      to: fund.address,
      value: amountToSend,
    })

    // Increase block time to after the unlockTime
    await helpers.time.increase(60 * 60 * 24 * 100)

    // there should not be the event submitted
    const tx = await fund.setStateUnlocked()
    const stateChangedEvent = await fund.queryFilter('StateChanged', tx.blockHash)
    expect(stateChangedEvent.length).to.equal(1)
    await expect(await fund.state()).to.equal(1)
  })

  it("should fail to setStateUnlocked if fund is not locked", async function () {
    // Increase block time to after the unlockTime
    await helpers.time.increase(60 * 60 * 24 * 100)

    //send enough ETH - this will set it to unlocked
    const amountToSend = ethers.utils.parseEther("1")
    let receiveTx = await user1.sendTransaction({
      to: fund.address,
      value: amountToSend,
    })

    await expect(fund.setStateUnlocked()).to.be.revertedWith('Fund is not locked')
  })

  it("should fail to setStateUnlocked if target is not reached", async function () {
    //send not enough ETH
    const amountToSend = ethers.utils.parseEther("0.5")
    let receiveTx = await user1.sendTransaction({
      to: fund.address,
      value: amountToSend,
    })

    await expect(fund.setStateUnlocked()).to.be.revertedWith('Fund has not met target')
  })

  it("should fail to setStateUnlocked if unlock date is in the future", async function () {
    //send enough ETH
    const amountToSend = ethers.utils.parseEther("1")
    let receiveTx = await user1.sendTransaction({
      to: fund.address,
      value: amountToSend,
    })
    await expect(fund.setStateUnlocked()).to.be.revertedWith('Fund has not reached maturity')
  })
})

describe("Native token deposits", function () {
  let owner, feeRecipient, user1, user2
  let factory, treasury, fund

  before(async function () {
    [owner, feeRecipient, user1, user2] = await ethers.getSigners()
  })

  beforeEach(async function () {
    const deployedContracts = await deploy(feeRecipient.address, 'https://zebra.xyz/')
    factory = deployedContracts.factory
    treasury = deployedContracts.treasury
    fund = await makeFund(factory, owner, user1)
  })

  it("should emit Received with expected args when native token is received", async function () {
    //send some ETH
    const amountToSend = ethers.utils.parseEther("0.33")
    const tx = await user1.sendTransaction({
      to: fund.address,
      value: amountToSend,
    })

    const receivedEvent = await fund.queryFilter('Received', tx.blockHash)

    expect(receivedEvent.length).to.equal(1)
    expect(receivedEvent[0].args._from).to.equal(user1.address)
    expect(receivedEvent[0].args._amount).to.equal(amountToSend)
  })

  it("should set state to Unlocked and emit StateChanged event when receiving native tokens, if requriements are met", async function () {
    // Increase block time to after the unlockTime
    await helpers.time.increase(60 * 60 * 24 * 100)

    //send some ETH
    const amountToSend = ethers.utils.parseEther("1")
    const tx = await user1.sendTransaction({
      to: fund.address,
      value: amountToSend,
    })

    const stateChangedEvent = await fund.queryFilter('StateChanged', tx.blockHash)
    expect(stateChangedEvent.length).to.equal(1)
    expect(stateChangedEvent[0].args.newState).to.equal(1)
  })
})

describe("Native and supported token balances", function () {

  let owner, feeRecipient, user1
  let factory, treasury, fund

  before(async function () {
    [owner, feeRecipient, user1] = await ethers.getSigners()
  })

  beforeEach(async function () {
    const deployedContracts = await deploy(feeRecipient.address, 'https://zebra.xyz/')
    factory = deployedContracts.factory
    treasury = deployedContracts.treasury
    fund = await makeFund(factory, owner, user1)
  })

  /*
    1. create two mock tokens
    2. transfer some token 1 to the fund, check that balance = 0, because it's an unsupported token
    3. add token 1 to supported tokens, check that balance updates
    4. send some native token, check that the balance updates
    5. add token 2 to supported tokens, send some token 2, check that balance updates
  */
  it("getTotalBalance() should return correct sum of native and supported tokens", async function () {
    // Deploy a mock ERC20 token for testing
    const MockToken = await ethers.getContractFactory("MockToken")
    const token1 = await MockToken.deploy("Mock Token 1", "MOCK1")
    await token1.deployed()

    // Deploy a mock ERC20 token for testing
    const token2 = await MockToken.deploy("Mock Token 2", "MOCK2")
    await token2.deployed()

    // Check the token balances before the transfer
    expect(await token1.balanceOf(fund.address)).to.equal(0)
    expect(await token2.balanceOf(fund.address)).to.equal(0)

    // Transfer some tokens to the fund contract
    const tokenAmount = ethers.utils.parseUnits("0.2", 18)
    const tx1 = await token1.transfer(fund.address, tokenAmount)
    tx1.wait()

    expect(await token1.balanceOf(fund.address)).to.equal(tokenAmount)

    // balance should still be zero until we add it as a supported token
    let totalBalance1 = await fund.getTotalBalance()
    expect(totalBalance1).to.equal(0)

    // add the token as a supported token in the treasury contract
    expect(await treasury.addSupportedToken(token1.address)).to.not.be.reverted

    // now the fund balance should be equal to the token1 balance
    totalBalance1 = await fund.getTotalBalance()
    expect(totalBalance1).to.equal(tokenAmount)

    // send some native token to the fund
    const amountToSend = ethers.utils.parseEther("0.2")
    const tx = await user1.sendTransaction({
      to: fund.address,
      value: amountToSend,
    })

    expect(await ethers.provider.getBalance(fund.address)).to.equal(amountToSend)
    expect(await fund.getTotalBalance()).to.equal(ethers.utils.parseEther("0.4"))

    // add the second token as a supported token in the treasury contract
    expect(await treasury.addSupportedToken(token2.address)).to.not.be.reverted

    // Transfer some of the second tokens to the fund contract
    const tx2 = await token1.transfer(fund.address, tokenAmount)
    tx2.wait()

    // check that token 2 is accounted for in the total balance
    expect(await fund.getTotalBalance()).to.equal(ethers.utils.parseEther("0.6"))
  })

  /*
    1. create a mock token, add it to supported tokens, advance the time
    2. transfer 50% of target amount of the token to the fund
    3. transfer 50% of target amount of native token to the fund 
    4. check total balance is equivalent to 100%
    5. check that the state change event was fired
    6. check that the state actually changed
  */
  it("should set state to Unlocked and emit StateChanged event when receiving 50% native tokens, with 50% supported token balance", async function () {
    // Increase block time to after the unlockTime
    await helpers.time.increase(60 * 60 * 24 * 100)

    // Deploy a mock ERC20 token for testing
    const MockToken = await ethers.getContractFactory("MockToken")
    const token1 = await MockToken.deploy("Mock Token 1", "MOCK1")
    await token1.deployed()

    // add the token as a supported token in the treasury contract
    expect(await treasury.addSupportedToken(token1.address)).to.not.be.reverted

    // Transfer some tokens to the fund contract
    const tokenAmount = ethers.utils.parseUnits("0.5", 18)
    const tx1 = await token1.transfer(fund.address, tokenAmount)
    tx1.wait()

    //send some ETH
    const amountToSend = ethers.utils.parseEther("0.5")
    const tx = await user1.sendTransaction({
      to: fund.address,
      value: amountToSend,
    })

    const totalBalance = await fund.getTotalBalance()
    expect(totalBalance).to.equal(ethers.utils.parseEther("1"))

    const stateChangedEvent = await fund.queryFilter('StateChanged', tx.blockHash)
    expect(stateChangedEvent.length).to.equal(1)
    expect(stateChangedEvent[0].args.newState).to.equal(1)

    // check the state is Unlocked
    expect(await fund.state()).to.equal(1)
  })

  /*
    1. create a mock token, add it to supported tokens, advance the time
    2. transfer some token to the fund
    4. check total balance is captures it
    5. remove token from supported tokens
    6. check that the balance reduced accordingly
  */
  it("should stop including token in balance after 'removeSupportedToken'", async function () {
    // Deploy a mock ERC20 token for testing
    const MockToken = await ethers.getContractFactory("MockToken")
    const token1 = await MockToken.deploy("Mock Token 1", "MOCK1")
    await token1.deployed()

    // add the token as a supported token in the treasury contract
    expect(await treasury.addSupportedToken(token1.address)).to.not.be.reverted

    // Transfer some tokens to the fund contract
    const tokenAmount = ethers.utils.parseUnits("55", 18)
    const tx1 = await token1.transfer(fund.address, tokenAmount)
    tx1.wait()

    expect(await token1.balanceOf(fund.address)).to.equal(tokenAmount)

    // remove the token from supported tokens
    expect(await treasury.removeSupportedToken(token1.address)).to.not.be.reverted 

    // now the fund balance should be 0
    expect(await fund.getTotalBalance()).to.equal(0)
  })
})

describe("Payout", function () {

  let factory, treasury, fund, fund100, fund99days
  let INITIAL_DEFAULT_ADMIN_AND_SIGNER
  let user1, user2, user3
  let feeRecipient

  before(async function () {
    [INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1, user2, user3, feeRecipient] = await ethers.getSigners()
  })

  beforeEach(async function () {
    const deployedContracts = await deploy(feeRecipient.address, 'https://zebra.xyz/')
    factory = deployedContracts.factory
    treasury = deployedContracts.treasury
    fund = await makeFund(factory, INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1)
    fund100 = await makeFund_100edition_target100_noUnlockTime(factory, INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1)
    fund99days = await makeFund_100edition_notarget_99days(factory, INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1)
  })

  it("should revert if fund is Locked", async function () {
    // verify that the fund is in the Locked state
    expect(await fund.state()).to.equal(0)

    // Try to transfer tokens out of the fund contract before unlock
    await expect(factory.connect(user1).payout(0))
      .to.be.revertedWith("Fund must be Unlocked")
  })

  it("should update the fund state to Open when last payout", async function () {

    // Increase block time to after the unlockTime
    await helpers.time.increase(60 * 60 * 24 * 100) // 100 days

    //send enough ETH
    const amountToSend = ethers.utils.parseEther("1")
    const tx = await user1.sendTransaction({
      to: fund.address,
      value: amountToSend,
    })
    tx.wait()

    // transfer 2 tokens from user1 to user2
    await factory.connect(user1).safeTransferFrom(user1.address, user2.address, 0, 2, "0x")
    expect(await factory.balanceOf(user1.address, 0)).to.equal(2)
    expect(await factory.balanceOf(user2.address, 0)).to.equal(2)

    // Call the payout function for user 1
    let payoutTx = await factory
      .connect(user1)
      .payout(0)

    await payoutTx.wait()

    // state should be 1 (unlocked)
    expect(await fund.state()).to.equal(1, 'fund should be Unlocked')

    // Call the payout function for user 2
    payoutTx = await factory
      .connect(user2)
      .payout(0)
    await payoutTx.wait()

    // there should be the StateChanged event submitted
    const stateChangedEvent = await fund.queryFilter('StateChanged', payoutTx.blockHash)
    expect(stateChangedEvent.length).to.equal(1)
    expect(stateChangedEvent[0].args.newState).to.equal(2, 'Event arg newState should equal 2')

    // state should now be 2 (Open)
    expect(await fund.state()).to.equal(2, 'fund should be unlocked')
  })

  /*
    1. call payout on unlocked fund
    2. check that withdraw and fee events are fired with correct arguments
    3. check that recipient and fee recipient receive correct amounts
  */
  it("should payout native tokens, with expected events and arguments", async function () {

    // Increase block time to after the unlockTime
    await helpers.time.increase(60 * 60 * 24 * 100) // 100 days

    // check the state is locked
    expect(await fund.state()).to.equal(0, 'fund should be locked')

    //send enough ETH
    const amountToSend = ethers.utils.parseEther("1")

    // Send the ETH to the fund contract
    let receiveTx = await user2.sendTransaction({
      to: fund.address,
      value: amountToSend,
    })

    // Check that recipient (user1) and fee recipient receive correct amounts
    const recipientBalanceBefore = await user1.getBalance()
    const feeRecipientBalanceBefore = await feeRecipient.getBalance()

    // Call the payout function
    const payoutTx = await factory.connect(user1).payout(0)
    await payoutTx.wait()

    // get gas used
    const txReceipt = await ethers.provider.getTransactionReceipt(payoutTx.hash)
    const gasCost = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice)

    events = await fund.queryFilter("Withdrawal", payoutTx.blockHash)
    expect(events.length).to.equal(1, 'there should be 1 Withdrawal event')

    const withdrawalFeeBps = await factory.withdrawalFeeBps()
    const withdrawalFee = amountToSend.mul(withdrawalFeeBps).div(10000)
    const withdrawNetAmount = amountToSend.sub(withdrawalFee)

    const event = events[0]
    expect(event.args.who).to.equal(user1.address, 'Withdrawal should have correct recipient address')
    expect(event.args.amount).to.equal(withdrawNetAmount, 'Withdrawal should be for correct amount')
    expect(event.args.balance).to.equal(4, 'Withdrawal should show correct amount of tokens redeemed')

    const feeEvents = await fund.queryFilter("WithdrawalFeePaid", payoutTx.blockHash)
    expect(feeEvents.length).to.equal(1, 'there should be 1 WithdrawalFeePaid event')
    expect(feeEvents[0].args.recipient).to.equal(feeRecipient.address, 'recipient should match feeRecipient address')
    expect(feeEvents[0].args.amount).to.equal(withdrawalFee, 'fee should match fee amount')
    
    // Calculate the expected recipient and fee recipient balances
    const expectedRecipientBalance = recipientBalanceBefore.add(withdrawNetAmount.sub(gasCost))
    const expectedFeeRecipientBalance = feeRecipientBalanceBefore.add(withdrawalFee)

    // Check if the actual balances match the expected balances
    expect(await user1.getBalance()).to.equal(expectedRecipientBalance, 'Recipient should receive correct amount')
    expect(await feeRecipient.getBalance()).to.equal(expectedFeeRecipientBalance, 'Fee recipient should receive correct amount')
  })

  /*
    1. send tokens to fund
    2. send native tokens to fund
    3. execute payout
    4. verifty correct amounts to recipient
    5. verify events have corect params
  */
  it("should withdraw correct amounts of native & supported tokens to sole owner", async function () {

    // Deploy mock ERC20 tokens for testing
    const MockToken = await ethers.getContractFactory("MockToken")
    const token1 = await MockToken.deploy("Mock Token 1", "MOCK1")
    await token1.deployed()
    const token2 = await MockToken.deploy("Mock Token 2", "MOCK2")
    await token2.deployed()

    // Transfer enough tokens to reach 66% target amount
    const tokenAmount = ethers.utils.parseUnits("33", 18)
    await token1.transfer(fund100.address, tokenAmount)
    await token2.transfer(fund100.address, tokenAmount)

    // send the remaining required ETH:
    const ethToSend = ethers.utils.parseUnits("34", 18)
    await user2.sendTransaction({
      to: fund100.address,
      value: ethToSend,
    })

    // Approve our mock tokens:
    await treasury.addSupportedToken(token1.address)
    await treasury.addSupportedToken(token2.address)

    // setStateUnlocked should be unlocked
    expect(await fund100.state()).to.equal(1, 'fund state should == 1 (locked)')

    //get holders balance before payout
    const initialOwnerETHBalance = await ethers.provider.getBalance(user1.address)
    const initialOwnerToken1Balance = await token1.balanceOf(user1.address)
    const initialOwnerToken2Balance = await token2.balanceOf(user1.address)

    // should payout all funds
    const tx = await factory.connect(user1).payout(1)
    fundETHBalance = await ethers.provider.getBalance(fund100.address)
    fundToken1Balance = await token1.balanceOf(fund100.address)
    fundToken2Balance = await token2.balanceOf(fund100.address)
    expect(fundETHBalance).to.equal(0)
    expect(fundToken1Balance).to.equal(0)
    expect(fundToken2Balance).to.equal(0)

    // get gas used
    const txReceipt = await ethers.provider.getTransactionReceipt(tx.hash)
    const gasCost = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice)

    // holder should receive all ETH minus break fee and gas:
    const user1ETHBalanceAfterPayout = await ethers.provider.getBalance(user1.address)
    const payoutFee = ethToSend.mul(400).div(10000) // 400 basis points
    const tokenPayoutFee = tokenAmount.mul(400).div(10000) // 400 basis points
    const expectedBalanceChange = ethToSend.sub(payoutFee).sub(gasCost)
    expect(user1ETHBalanceAfterPayout).to.equal(initialOwnerETHBalance.add(expectedBalanceChange))

    // holder should receive all token1 and token2 balance:
    const ownerToken1BalanceAfterPayout = await token1.balanceOf(user1.address)
    const ownerToken2BalanceAfterPayout = await token2.balanceOf(user1.address)
    //console.log('ownerToken1BalanceAfterPayout', ownerToken1BalanceAfterPayout)
    //console.log('ownerToken2BalanceAfterPayout', ownerToken2BalanceAfterPayout)
    expect(ownerToken1BalanceAfterPayout).to.equal(initialOwnerToken1Balance.add(tokenAmount).sub(tokenPayoutFee))
    expect(ownerToken2BalanceAfterPayout).to.equal(initialOwnerToken2Balance.add(tokenAmount).sub(tokenPayoutFee))
  })

  it("should send correct fee amounts when withdrawing mix of native & supported tokens for sole owner", async function () {
    // Deploy mock ERC20 tokens for testing
    const MockToken = await ethers.getContractFactory("MockToken")
    const token1 = await MockToken.deploy("Mock Token 1", "MOCK1")
    await token1.deployed()
    const token2 = await MockToken.deploy("Mock Token 2", "MOCK2")
    await token2.deployed()

    // Transfer enough tokens to reach the target amount
    const tokenAmount = ethers.utils.parseUnits("33", 18)
    await token1.transfer(fund100.address, tokenAmount)
    await token2.transfer(fund100.address, tokenAmount)

    // Send the remaining required ETH
    const ethToSend = ethers.utils.parseUnits("34", 18)
    await user2.sendTransaction({
      to: fund100.address,
      value: ethToSend,
    })

    // Approve our mock tokens
    await treasury.addSupportedToken(token1.address)
    await treasury.addSupportedToken(token2.address)

    // Get initial owner balances
    const initialOwnerETHBalance = await ethers.provider.getBalance(user1.address)
    const initialOwnerToken1Balance = await token1.balanceOf(user1.address)
    const initialOwnerToken2Balance = await token2.balanceOf(user1.address)

    // Get initial fee recipient balances
    const initialFeeRecipientToken1Balance = await token1.balanceOf(feeRecipient.address)
    const initialFeeRecipientToken2Balance = await token2.balanceOf(feeRecipient.address)

    // Perform payout
    const tx = await factory.connect(user1).payout(1)

    // Get fund balances after payout
    const fundETHBalance = await ethers.provider.getBalance(fund100.address)
    const fundToken1Balance = await token1.balanceOf(fund100.address)
    const fundToken2Balance = await token2.balanceOf(fund100.address)
    expect(fundETHBalance).to.equal(0)
    expect(fundToken1Balance).to.equal(0)
    expect(fundToken2Balance).to.equal(0)

    // Get gas cost
    const txReceipt = await ethers.provider.getTransactionReceipt(tx.hash)
    const gasCost = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice)

    // Calculate expected fee amounts
    const payoutFee = ethToSend.mul(400).div(10000) // 400 basis points
    const tokenPayoutFee = tokenAmount.mul(400).div(10000) // 400 basis points

    // Calculate expected balance changes
    const expectedETHChange = ethToSend.sub(payoutFee).sub(gasCost)
    const expectedToken1Change = tokenAmount.sub(tokenPayoutFee)
    const expectedToken2Change = tokenAmount.sub(tokenPayoutFee)

    // Get owner balances after payout
    const ownerETHBalanceAfterPayout = await ethers.provider.getBalance(user1.address)
    const ownerToken1BalanceAfterPayout = await token1.balanceOf(user1.address)
    const ownerToken2BalanceAfterPayout = await token2.balanceOf(user1.address)

    // Get fee recipient balances after payout
    const feeRecipientToken1BalanceAfterPayout = await token1.balanceOf(feeRecipient.address)
    const feeRecipientToken2BalanceAfterPayout = await token2.balanceOf(feeRecipient.address)

    // Verify expected balances and fee amounts
    expect(ownerETHBalanceAfterPayout).to.equal(initialOwnerETHBalance.add(expectedETHChange))
    expect(ownerToken1BalanceAfterPayout).to.equal(initialOwnerToken1Balance.add(expectedToken1Change))
    expect(ownerToken2BalanceAfterPayout).to.equal(initialOwnerToken2Balance.add(expectedToken2Change))
    expect(feeRecipientToken1BalanceAfterPayout).to.equal(initialFeeRecipientToken1Balance.add(tokenPayoutFee))
    expect(feeRecipientToken2BalanceAfterPayout).to.equal(initialFeeRecipientToken2Balance.add(tokenPayoutFee))
  })

  it("should withdraw correct proportion of native & supported tokens to 20% owner", async function () {

    // distribute 20% of tokens to new owner
    await factory.connect(user1).safeTransferFrom(user1.address, user3.address, 1, 20, '0x')
    expect(await factory.balanceOf(user3.address, 1)).to.equal(20)
    // Deploy mock ERC20 tokens for testing
    const MockToken = await ethers.getContractFactory("MockToken")
    const token1 = await MockToken.connect(user2).deploy("Mock Token 1", "MOCK1")
    await token1.deployed()
    const token2 = await MockToken.connect(user2).deploy("Mock Token 2", "MOCK2")
    await token2.deployed()

    // Transfer enough tokens to reach the target amount
    const tokenAmount = ethers.utils.parseUnits("33", 18)
    await token1.connect(user2).transfer(fund100.address, tokenAmount)
    await token2.connect(user2).transfer(fund100.address, tokenAmount)

    // send the remaining required ETH:
    const ethToSend = ethers.utils.parseUnits("34", 18)
    await user2.sendTransaction({
      to: fund100.address,
      value: ethToSend,
    })

    // Check fund balance is as expected
    const fundETHBalance_beforePayout = await ethers.provider.getBalance(fund100.address)
    const fundToken1Balance_beforePayout = await token1.balanceOf(fund100.address)
    const fundToken2Balance_beforePayout = await token2.balanceOf(fund100.address)
    expect(fundETHBalance_beforePayout).to.equal(ethers.utils.parseUnits("34", 18))
    expect(fundToken1Balance_beforePayout).to.equal(ethers.utils.parseUnits("33", 18))
    expect(fundToken2Balance_beforePayout).to.equal(ethers.utils.parseUnits("33", 18))

    // Approve our mock tokens:
    await treasury.addSupportedToken(token1.address)
    await treasury.addSupportedToken(token2.address)

    // get holders balance before payout
    const nftHolderETHBalance_beforePayout = await ethers.provider.getBalance(user3.address)
    const nftHolderToken1Balance_beforePayout = await token1.balanceOf(user3.address)
    const nftHolderToken2Balance_beforePayout = await token2.balanceOf(user3.address)

    //console.log('nftHolderETHBalance_beforePayout', nftHolderETHBalance_beforePayout)
    //console.log('nftHolderToken1Balance_beforePayout', nftHolderToken1Balance_beforePayout)
    //console.log('nftHolderToken2Balance_beforePayout', nftHolderToken2Balance_beforePayout)

    // Payout to a 20% holder
    const tx = await factory.connect(user3).payout(1)

    // set expected value of 20% of fund balances:
    const oneFifthOfFundETHBalance = ethers.BigNumber.from(ethToSend.mul(2).div(10))
    const oneFifthOfFundToken1Balance = ethers.BigNumber.from(tokenAmount.mul(2).div(10))
    const oneFifthOfFundToken2Balance = ethers.BigNumber.from(tokenAmount.mul(2).div(10))

    // Fund should be left with 80% of ETH & Supported tokens
    const fundETHBalance_afterPayout = await ethers.provider.getBalance(fund100.address)
    const fundToken1Balance_afterPayout = await token1.balanceOf(fund100.address)
    const fundToken2Balance_afterPayout = await token2.balanceOf(fund100.address)
    expect(fundETHBalance_afterPayout).to.equal(fundETHBalance_beforePayout.sub(oneFifthOfFundETHBalance))
    expect(fundToken1Balance_afterPayout).to.equal(fundToken1Balance_beforePayout.sub(oneFifthOfFundToken1Balance))
    expect(fundToken2Balance_afterPayout).to.equal(fundToken2Balance_beforePayout.sub(oneFifthOfFundToken2Balance))

    // get gas used
    const txReceipt = await ethers.provider.getTransactionReceipt(tx.hash)
    const gasCost = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice)

    // holder should receive 20% of the fund's ETH, minus break fee and gas:
    const nftHolderETHBalance_afterPayout = await ethers.provider.getBalance(user3.address)
    const payoutFee = oneFifthOfFundETHBalance.mul(400).div(10000) // 400 basis points
    const tokenPayoutFee = oneFifthOfFundToken1Balance.mul(400).div(10000) // 400 basis points

    // expected balance change == (fundETHbalance_before * 0.2) - payout fee - gas cost

    const expectedBalanceChange = oneFifthOfFundETHBalance.sub(payoutFee).sub(gasCost)

    expect(nftHolderETHBalance_afterPayout).to.equal(nftHolderETHBalance_beforePayout.add(expectedBalanceChange))

    // holder should receive 20% of fund's token1 and token2 balances:
    const nftHolderToken1Balance_afterPayout = await token1.balanceOf(user3.address)
    const nftHolderToken2Balance_afterPayout = await token2.balanceOf(user3.address)
    //console.log('ownerToken1BalanceAfterPayout', ownerToken1BalanceAfterPayout)
    //console.log('ownerToken2BalanceAfterPayout', ownerToken2BalanceAfterPayout)
    expect(nftHolderToken1Balance_afterPayout).to.equal(nftHolderToken1Balance_beforePayout.add(oneFifthOfFundToken1Balance).sub(tokenPayoutFee))
    expect(nftHolderToken2Balance_afterPayout).to.equal(nftHolderToken2Balance_beforePayout.add(oneFifthOfFundToken2Balance).sub(tokenPayoutFee))
  })

  it("should send correct fee amounts when withdrawing mix of native & supported tokens for 20% owner", async function () {

    // distribute 20% of tokens to new owner
    await factory.connect(user1).safeTransferFrom(user1.address, user3.address, 1, 20, '0x')
    expect(await factory.balanceOf(user3.address, 1)).to.equal(20)

    // Deploy mock ERC20 tokens for testing
    const MockToken = await ethers.getContractFactory("MockToken")
    const token1 = await MockToken.connect(user2).deploy("Mock Token 1", "MOCK1")
    await token1.deployed()
    const token2 = await MockToken.connect(user2).deploy("Mock Token 2", "MOCK2")
    await token2.deployed()

    // Transfer enough tokens to reach the target amount
    const tokenAmount = ethers.utils.parseUnits("33", 18)
    await token1.connect(user2).transfer(fund100.address, tokenAmount)
    await token2.connect(user2).transfer(fund100.address, tokenAmount)

    // send the remaining required ETH:
    const ethToSend = ethers.utils.parseUnits("34", 18)
    await user2.sendTransaction({
      to: fund100.address,
      value: ethToSend,
    })

    // Check fund balance is as expected
    const fundETHBalance_beforePayout = await ethers.provider.getBalance(fund100.address)
    const fundToken1Balance_beforePayout = await token1.balanceOf(fund100.address)
    const fundToken2Balance_beforePayout = await token2.balanceOf(fund100.address)
    expect(fundETHBalance_beforePayout).to.equal(ethToSend)
    expect(fundToken1Balance_beforePayout).to.equal(tokenAmount)
    expect(fundToken2Balance_beforePayout).to.equal(tokenAmount)

    // Approve our mock tokens:
    await treasury.addSupportedToken(token1.address)
    await treasury.addSupportedToken(token2.address)

    // get holders balance before payout
    const nftHolderETHBalance_beforePayout = await ethers.provider.getBalance(user3.address)
    const nftHolderToken1Balance_beforePayout = await token1.balanceOf(user3.address)
    const nftHolderToken2Balance_beforePayout = await token2.balanceOf(user3.address)

    // Get initial fee recipient balances
    const initialFeeRecipientETHBalance = await ethers.provider.getBalance(feeRecipient.address)
    const initialFeeRecipientToken1Balance = await token1.balanceOf(feeRecipient.address)
    const initialFeeRecipientToken2Balance = await token2.balanceOf(feeRecipient.address)

    // Payout to a 20% holder
    const tx = await factory.connect(user3).payout(1)

    // set expected value of 20% of fund balances:
    const oneFifthOfFundETHBalance = ethers.BigNumber.from(ethToSend.mul(2).div(10))
    const oneFifthOfFundToken1Balance = ethers.BigNumber.from(tokenAmount.mul(2).div(10))
    const oneFifthOfFundToken2Balance = ethers.BigNumber.from(tokenAmount.mul(2).div(10))

    // Fund should be left with 80% of ETH & Supported tokens
    const fundETHBalance_afterPayout = await ethers.provider.getBalance(fund100.address)
    const fundToken1Balance_afterPayout = await token1.balanceOf(fund100.address)
    const fundToken2Balance_afterPayout = await token2.balanceOf(fund100.address)
    expect(fundETHBalance_afterPayout).to.equal(fundETHBalance_beforePayout.sub(oneFifthOfFundETHBalance))
    expect(fundToken1Balance_afterPayout).to.equal(fundToken1Balance_beforePayout.sub(oneFifthOfFundToken1Balance))
    expect(fundToken2Balance_afterPayout).to.equal(fundToken2Balance_beforePayout.sub(oneFifthOfFundToken2Balance))

    // get gas used
    const txReceipt = await ethers.provider.getTransactionReceipt(tx.hash)
    const gasCost = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice)

    // holder should receive 20% of the fund's ETH, minus break fee and gas:
    const nftHolderETHBalance_afterPayout = await ethers.provider.getBalance(user3.address)
    const payoutFee = oneFifthOfFundETHBalance.mul(400).div(10000) // 400 basis points
    const tokenPayoutFee = oneFifthOfFundToken1Balance.mul(400).div(10000) // 400 basis points

    // expected balance change == (fundETHbalance_before * 0.2) - payout fee - gas cost
    const expectedBalanceChange = oneFifthOfFundETHBalance.sub(payoutFee).sub(gasCost)

    expect(nftHolderETHBalance_afterPayout).to.equal(nftHolderETHBalance_beforePayout.add(expectedBalanceChange))

    // holder should receive 20% of fund's token1 and token2 balances:
    const nftHolderToken1Balance_afterPayout = await token1.balanceOf(user3.address)
    const nftHolderToken2Balance_afterPayout = await token2.balanceOf(user3.address)
    expect(nftHolderToken1Balance_afterPayout).to.equal(nftHolderToken1Balance_beforePayout.add(oneFifthOfFundToken1Balance).sub(tokenPayoutFee))
    expect(nftHolderToken2Balance_afterPayout).to.equal(nftHolderToken2Balance_beforePayout.add(oneFifthOfFundToken2Balance).sub(tokenPayoutFee))

    // Get fee recipient balances after payout
    const feeRecipientETHBalanceAfterPayout = await ethers.provider.getBalance(feeRecipient.address)
    const feeRecipientToken1BalanceAfterPayout = await token1.balanceOf(feeRecipient.address)
    const feeRecipientToken2BalanceAfterPayout = await token2.balanceOf(feeRecipient.address)

    // Verify expected balances and fee amounts
    expect(feeRecipientETHBalanceAfterPayout).to.equal(initialFeeRecipientETHBalance.add(payoutFee))
    expect(feeRecipientToken1BalanceAfterPayout).to.equal(initialFeeRecipientToken1Balance.add(tokenPayoutFee))
    expect(feeRecipientToken2BalanceAfterPayout).to.equal(initialFeeRecipientToken2Balance.add(tokenPayoutFee))
  })

  it("should payout token holder % of balance proportional to token holder's share of token", async function () {
    
    const fullAmountToSend = ethers.utils.parseEther("100")

    // send all the ETH
    await user2.sendTransaction({
      to: fund100.address,
      value: fullAmountToSend,
    })

    // Check the fund contract balance is correct
    let fundBalance = await ethers.provider.getBalance(fund100.address)
    expect(fundBalance).to.equal(ethers.utils.parseEther("100"))

    // distribute the token
    await factory.connect(user1).safeTransferFrom(user1.address, user3.address, 1, 25, "0x")
    expect(await factory.balanceOf(user1.address, 1)).to.equal(75)
    expect(await factory.balanceOf(user3.address, 1)).to.equal(25)

    // HOLDER 1
    const holder1BalanceBeforePayout = await ethers.provider.getBalance(user1.address)

    // should payout 75% of the funds to holder 1, leaving 25% of tokens with holder 2
    let tx = await factory.connect(user1).payout(1)
    expect(await factory.totalSupply(1)).to.equal(25)

    // get gas used
    let txReceipt = await ethers.provider.getTransactionReceipt(tx.hash)
    let gasCost = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice)

    //holder should receive 75% of funds minus break fee and gas:
    const holder1BalanceAfterPayout = await ethers.provider.getBalance(user1.address)
    let payoutFee = ethers.utils.parseEther("75").mul(400).div(10000) // 400 basis points
    let expectedBalanceChange = ethers.utils.parseEther("75").sub(payoutFee).sub(gasCost)

    expect(holder1BalanceAfterPayout).to.equal(holder1BalanceBeforePayout.add(expectedBalanceChange))

    // HOLDER 2:
    const holder2BalanceBeforePayout = await ethers.provider.getBalance(user3.address)

    // should payout remaining 25% of the funds to holder 2, leaving 0 tokens
    tx = await factory.connect(user3).payout(1)
    expect(await factory.totalSupply(1)).to.equal(0)

    // get gas used
    txReceipt = await ethers.provider.getTransactionReceipt(tx.hash)
    gasCost = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice)
    
    //console.log('gasCost:', gasCost)

    //holder should receive all funds minus break fee and gas:
    const holder2BalanceAfterPayout = await ethers.provider.getBalance(user3.address)
    payoutFee = ethers.utils.parseEther("25").mul(400).div(10000) // 400 basis points
    expectedBalanceChange = ethers.utils.parseEther("25").sub(payoutFee).sub(gasCost)

    expect(holder2BalanceAfterPayout).to.equal(holder2BalanceBeforePayout.add(expectedBalanceChange))
  })

  it("should fail if fund has no money", async function () {
    // Increase block time to after the unlockTime
    await helpers.time.increase(60 * 60 * 24 * 99) // 99 days

    // confirm that fund is unlocked
    await expect(fund99days.setStateUnlocked()).to.not.be.reverted

    // should not allow payout
    await expect(factory.connect(user1).payout(2)).to.be.revertedWith("Fund is empty")
  })
})