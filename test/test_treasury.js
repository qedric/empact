// We import Chai to use its asserting functions here.
const { expect, assert } = require("chai")
const { ethers, upgrades, network } = require("hardhat")
const helpers = require("@nomicfoundation/hardhat-network-helpers")
const { deploy, deployFundImplementation, deployGenerator, deployTreasury, getTypedData, getRevertReason, getCurrentBlockTime, deployMockToken, deployMockOETHToken, generateMintRequest, makeFund, makeFund_100edition_target100_noUnlockTime, makeFund_100edition_notarget_99days } = require("./test_helpers")

const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000'

describe(" -- Testing Treasury Contract -- ", function () {
  let deployedContracts, treasury
  let user1, TREASURER
  let feeRecipient

  before(async function () {
    [user1, feeRecipient, TREASURER] = await ethers.getSigners()
  })

  beforeEach(async function () {
    deployedContracts = await deploy(feeRecipient.address, 'https://zebra.xyz/')
    treasury = deployedContracts.treasury
    // grant TREASURY ROLE
    const treasurerRole = treasury.TREASURER_ROLE()
    await treasury.grantRole(treasurerRole, TREASURER.address)
  })

  describe("Configuration", function () {
    /*setOETHContractAddress*/
    it("should set OETH contract address", async function () {

      const oldOETHAddress = await treasury.oETHTokenAddress()

      // Set the OETH contract address by a TREASURER
      const tx = await treasury.connect(TREASURER).setOETHContractAddress(user1.address)
      const txReceipt = await tx.wait()

      const OriginProtocolTokenUpdatedEvent = txReceipt.events.find(event => event.event === 'OriginProtocolTokenUpdated')

      // Verify that the event was emitted with the new address
      expect(OriginProtocolTokenUpdatedEvent.args[0]).to.equal(oldOETHAddress)
      expect(OriginProtocolTokenUpdatedEvent.args[1]).to.equal(user1.address)

      // Verify that the OETH contract address has been updated
      const updatedOETHAddress = await treasury.oETHTokenAddress()
      expect(updatedOETHAddress).to.equal(user1.address)
    })

    it("should add and remove supported tokens", async function () {
      const token1 = await deployMockToken("Token1", "T1");
      const token2 = await deployMockToken("Token2", "T2");

      // Add token1 as a supported token
      let tx = await treasury.addSupportedToken(token1.address)
      tx.wait()
      let supportedTokens = await treasury.supportedTokens()
      expect(supportedTokens[0]).to.equal(token1.address)

      // Add token2 as a supported token
      tx = await treasury.addSupportedToken(token2.address)
      tx.wait()

      supportedTokens = await treasury.supportedTokens()
      expect(supportedTokens[1]).to.equal(token2.address)

      // Remove token1 from supported tokens
      await treasury.removeSupportedToken(token1.address)
      supportedTokens = await treasury.supportedTokens()
      expect(supportedTokens[0]).to.equal(token2.address)

      // Remove token2 from supported tokens
      await treasury.removeSupportedToken(token2.address)
      supportedTokens = await treasury.supportedTokens()
      expect(supportedTokens.length).to.equal(0)
    })
  })

  describe("Fund State arrays", function () {

    /*addOpenFund*/
    it("should add a fund to the openFunds array", async function () {
      // get the deployed factory
      const factory = deployedContracts.factory
      const makeFundFee = ethers.utils.parseUnits("0.004", "ether")
      const mr = await generateMintRequest(factory.address, user1, user1.address)
      const tx = await factory.connect(user1).mintWithSignature(
        mr.typedData.message, mr.signature, { value: makeFundFee })
      const txReceipt = await tx.wait()

      // get the fund
      const fundCreatedEvent = txReceipt.events.find(event => event.event === 'FundDeployed')
      const Fund = await ethers.getContractFactory("Fund")
      const fund = Fund.attach(fundCreatedEvent.args.fund)

      // move time forward 100 days
      await helpers.time.increase(60 * 60 * 24 * 100)

      // send 1 ETH to the fund to unlock it
      const amountToSend = ethers.utils.parseEther("1")
      await user1.sendTransaction({
        to: fund.address,
        value: amountToSend,
      })

      const txPayout = await factory.connect(user1).payout(0)
      const txPayoutReceipt = await txPayout.wait()

      const filter = treasury.filters.AddedOpenFund();
      const events = await treasury.queryFilter(filter, txPayoutReceipt.blockNumber)

      expect(events[0].args[0]).to.equal(fund.address)

      // Verify that the fund address is a member of the open funds array
      const openFund = await treasury.openFunds(0)
      expect(openFund).to.equal(fund.address)
      expect(await treasury.isOpenFund(fund.address)).to.be.true
    })
  })

  describe("Collect & Distribute", function () {
    let deployedContracts, factory, treasury
    let lockedFund, unlockedFund, openFund
    let user1, user2
    let feeRecipient
    let token1, token2

    before(async function () {
      [user1, user2, feeRecipient] = await ethers.getSigners()
    })

    it("should fail if there are no funds to collect from", async function () {
      const treasury_with_no_funds = await deploy(feeRecipient.address, 'https://zebra.xyz/').then((x) => x.treasury)
      await expect(treasury_with_no_funds.collect()).to.be.revertedWith("No open funds to collect from")
    })

    beforeEach(async function () {
      deployedContracts = await deploy(feeRecipient.address, 'https://zebra.xyz/')
      factory = deployedContracts.factory
      treasury = deployedContracts.treasury
      lockedFund = await makeFund_100edition_target100_noUnlockTime(factory, user1, user1)
      unlockedFund = await makeFund_100edition_target100_noUnlockTime(factory, user1, user1)
      openFund = await makeFund_100edition_target100_noUnlockTime(factory, user1, user1)
      
      const treasurerRole = treasury.TREASURER_ROLE()
      await treasury.grantRole(treasurerRole, user1.address)

      // Deploy mock ERC20 tokens for testing
      const MockToken = await ethers.getContractFactory("MockToken")
      token1 = await MockToken.deploy("Mock Token 1", "MOCK1")
      await token1.deployed()
      token2 = await MockToken.deploy("Mock Token 2", "MOCK2")
      await token2.deployed()

      // Approve our mock tokens:
      await treasury.addSupportedToken(token1.address)
      await treasury.addSupportedToken(token2.address)

      // Transfer enough tokens to reach 66% target amount of unlocked and open funds
      let tokenAmount = ethers.utils.parseUnits("33", 18)
      await token1.transfer(unlockedFund.address, tokenAmount)
      await token2.transfer(unlockedFund.address, tokenAmount)
      await token1.transfer(openFund.address, tokenAmount)
      await token2.transfer(openFund.address, tokenAmount)

      // send the remaining required ETH:
      let ethToSend = ethers.utils.parseUnits("34", 18)
      await user2.sendTransaction({
        to: unlockedFund.address,
        value: ethToSend,
      })
      await user2.sendTransaction({
        to: openFund.address,
        value: ethToSend,
      })

      // call payout on the open fund (index 2) to set it to Open
      const tx = await factory.connect(user1).payout(2)
      tx.wait()

      // Transfer some tokens to the open fund
      tokenAmount = ethers.utils.parseUnits("60", 18)
      await token1.transfer(openFund.address, tokenAmount)
      await token2.transfer(openFund.address, tokenAmount)

      // and some ETH:
      ethToSend = ethers.utils.parseUnits("60", 18)
      await user2.sendTransaction({
        to: openFund.address,
        value: ethToSend,
      })

      // confirm we have one of each fund
      expect(await treasury.isOpenFund(openFund.address)).to.be.true
      expect(await treasury.isOpenFund(lockedFund.address)).to.be.false
      expect(await treasury.isOpenFund(unlockedFund.address)).to.be.false

      expect(await lockedFund.state()).to.equal(0)
      expect(await unlockedFund.state()).to.equal(1)
      expect(await openFund.state()).to.equal(2)

      /*console.log('lockedFund.address', lockedFund.address)
      console.log('unlockedFund.address', unlockedFund.address)
      console.log('openFund.address', openFund.address)*/
    })

    it("should send open funds and not locked funds or unlocked funds to treasury", async function () {

      // verify that the locked fund is in the Locked state
      expect(await lockedFund.state()).to.equal(0)
      // verify that the unlocked fund is in the Unlocked state
      expect(await unlockedFund.state()).to.equal(1)
      // verify that the open fund is in the Open state
      expect(await openFund.state()).to.equal(2)
      expect(await treasury.isOpenFund(openFund.address)).to.be.true

      // Get the initial balances of native tokens and supported tokens
      const initialEthBalance = await ethers.provider.getBalance(treasury.address)
      const initialToken1Balance = await token1.balanceOf(treasury.address)
      const initialToken2Balance = await token2.balanceOf(treasury.address)

      // call collect on the treasury which should pull balance from the Open Fund only
      const tx = await treasury.connect(user1).collect()
      const txReceipt = await tx.wait()

      // Get the updated balances after collecting from the Open Fund
      const updatedEthBalance = await ethers.provider.getBalance(treasury.address)
      const updatedToken1Balance = await token1.balanceOf(treasury.address)
      const updatedToken2Balance = await token2.balanceOf(treasury.address)

      // Verify that balances have changed as expected
      const amountCollectedOfEachToken = ethers.utils.parseUnits("60", 18)
      expect(updatedEthBalance).to.equal(initialEthBalance.add(amountCollectedOfEachToken))
      expect(updatedToken1Balance).to.equal(initialToken1Balance.add(amountCollectedOfEachToken))
      expect(updatedToken2Balance).to.equal(initialToken2Balance.add(amountCollectedOfEachToken))
    })

    it("should distribute native token balance to locked funds", async function () {

      // deploy a couple more lockedFunds
      const lockedFund2 = await makeFund_100edition_target100_noUnlockTime(factory, user1, user1)
      const lockedFund3 = await makeFund_100edition_target100_noUnlockTime(factory, user1, user1)
      
      // Count the number of locked and open funds
      let numLockedFunds = 0
      let numFunds = 0
      let f

      // Count the number of locked funds
      while (true) {
        try {
          const F = await ethers.getContractFactory("Fund")
          const fAddress = await factory.funds(numFunds)
          const fund = F.attach(fAddress)
          if (await fund.state() == 0) {
            numLockedFunds++
          }
          numFunds++
        } catch {
          break
        }
          
      }
      expect(await ethers.provider.getBalance(lockedFund.address)).to.equal(0)
      expect(await ethers.provider.getBalance(lockedFund2.address)).to.equal(0)
      expect(await ethers.provider.getBalance(lockedFund3.address)).to.equal(0)
      expect(await ethers.provider.getBalance(openFund.address)).to.equal(ethers.utils.parseEther("60"))
      expect(numLockedFunds).to.equal(3)

      const openFundNativeBalance = await ethers.provider.getBalance(openFund.address)
      //console.log('open fund balance:', openFundNativeBalance)

      // send some ETH to funds 2 & 3:
      await user2.sendTransaction({
        to: lockedFund2.address,
        value: ethers.utils.parseUnits("20", 18),
      })
      expect(await ethers.provider.getBalance(lockedFund2.address)).to.equal(ethers.utils.parseUnits("20", 18))
      // send some ETH to funds 2 & 3:
      await user2.sendTransaction({
        to: lockedFund3.address,
        value: ethers.utils.parseUnits("30", 18),
      })
      expect(await ethers.provider.getBalance(lockedFund3.address)).to.equal(ethers.utils.parseUnits("30", 18))

      // check that all our locked funds are actually locked
      expect(await lockedFund.state()).to.equal(0)
      expect(await lockedFund2.state()).to.equal(0)
      expect(await lockedFund3.state()).to.equal(0)

      // there should be nothing yet to distribute
      await expect(treasury.distributeNativeTokenRewards()).to.be.revertedWith('No native tokens')

      // call collect on the treasury which should pull balance from the Open Fund only
      const collectTx = await treasury.connect(user1).collect()
      const txReceipt = await collectTx.wait()
      expect(await ethers.provider.getBalance(openFund.address)).to.equal(0)

      // Check if the locked funds received the expected amount of native token (ETH)
      let treasuryBalanceBefore = await ethers.provider.getBalance(treasury.address)
      let balance1Before = await ethers.provider.getBalance(lockedFund.address)
      let balance2Before = await ethers.provider.getBalance(lockedFund2.address)
      let balance3Before = await ethers.provider.getBalance(lockedFund3.address)

      // Distribute funds to the locked funds
      const tx = await treasury.distributeNativeTokenRewards() // Distribute to the three locked funds
      const distFundEvents = await treasury.queryFilter("DistributedNativeTokensToLockedFund")
      const distEvents = await treasury.queryFilter("DistributedNativeTokensToLockedFunds")
      expect(distEvents[0].args.balanceBeforeDistribution).to.equal(treasuryBalanceBefore)
      expect(distEvents[0].args.numberOfRecipients).to.equal(2)

      // Retrieve Receive events emitted by each locked fund
      const receiveEvents1 = await lockedFund3.queryFilter("Received")
      //console.log(receiveEvents1)

      // Check if the locked funds received the expected amount of native token (ETH)
      const balance1After = await ethers.provider.getBalance(lockedFund.address)
      const balance2After = await ethers.provider.getBalance(lockedFund2.address)
      const balance3After = await ethers.provider.getBalance(lockedFund3.address)
      /*console.log('locked fund 1 after distribute:', balance1After)
      console.log('locked fund 2 after distribute:', balance2After)
      console.log('locked fund 3 after distribute:', balance3After)*/
      expect(balance1After).to.equal(balance1Before)
      expect(balance2After).to.equal(balance2Before.add(ethers.utils.parseEther("24")))
      expect(balance3After).to.equal(balance3Before.add(ethers.utils.parseEther("36")))
    })

    it("should fail if there are no native tokens in the treasury", async function () {
      // there should be nothing yet to distribute
      await expect(treasury.distributeNativeTokenRewards()).to.be.revertedWith('No native tokens')
    })

    it("should distribute supported token balances to locked funds", async function () {

      // deploy a couple more lockedFunds
      const lockedFund2 = await makeFund_100edition_target100_noUnlockTime(factory, user1, user1)
      const lockedFund3 = await makeFund_100edition_target100_noUnlockTime(factory, user1, user1)

      // Transfer supported tokens to lockedfund 
      await token1.transfer(lockedFund.address, ethers.utils.parseUnits("1", 18))
      await token2.transfer(lockedFund.address, ethers.utils.parseUnits("10", 18))

      // Transfer supported tokens to lockedfund 3
      await token1.transfer(lockedFund3.address, ethers.utils.parseUnits("25", 18))
      await token2.transfer(lockedFund3.address, ethers.utils.parseUnits("0.5", 18))

      expect(await token1.balanceOf(lockedFund.address)).to.equal(ethers.utils.parseUnits("1", 18))
      expect(await token2.balanceOf(lockedFund.address)).to.equal(ethers.utils.parseUnits("10", 18))

      expect(await token1.balanceOf(lockedFund2.address)).to.equal(ethers.utils.parseUnits("0", 18))
      expect(await token2.balanceOf(lockedFund2.address)).to.equal(ethers.utils.parseUnits("0", 18))

      expect(await token1.balanceOf(lockedFund3.address)).to.equal(ethers.utils.parseUnits("25", 18))
      expect(await token2.balanceOf(lockedFund3.address)).to.equal(ethers.utils.parseUnits("0.5", 18))

      // check that all our locked funds are actually locked
      expect(await lockedFund.state()).to.equal(0)
      expect(await lockedFund2.state()).to.equal(0)
      expect(await lockedFund3.state()).to.equal(0)

      // there should be nothing yet to distribute
      await expect(treasury.distributeSupportedTokenRewards(token1.address)).to.be.revertedWith('No supported tokens')
      await expect(treasury.distributeSupportedTokenRewards(token2.address)).to.be.revertedWith('No supported tokens')

      // call collect on the treasury which should pull balance from the Open Fund only
      const collectTx = await treasury.connect(user1).collect()
      const txReceipt = await collectTx.wait()
      expect(await ethers.provider.getBalance(openFund.address)).to.equal(0)

      // check that the token balances have been collected from open fund into the treasury
      expect(await token1.balanceOf(treasury.address)).to.equal(ethers.utils.parseUnits("60", 18))
      expect(await token2.balanceOf(treasury.address)).to.equal(ethers.utils.parseUnits("60", 18))

      // Check if the locked funds received the expected amount of supported tokens
      let treasuryTokenBalanceBefore = ethers.utils.parseUnits("60", 18)

      let token1balance1Before = await token1.balanceOf(lockedFund.address)
      let token1balance2Before = await token1.balanceOf(lockedFund2.address)
      let token1balance3Before = await token1.balanceOf(lockedFund3.address)
      let token2balance1Before = await token2.balanceOf(lockedFund.address)
      let token2balance2Before = await token2.balanceOf(lockedFund2.address)
      let token2balance3Before = await token2.balanceOf(lockedFund3.address)

      /*console.log('token1balance1Before', token1balance1Before)
      console.log('token1balance2Before', token1balance2Before)
      console.log('token1balance3Before', token1balance3Before)
      console.log('token2balance1Before', token2balance1Before)
      console.log('token2balance2Before', token2balance2Before)
      console.log('token2balance3Before', token2balance3Before)*/

      // Distribute token 1 to the locked funds
      const tx1 = await treasury.distributeSupportedTokenRewards(token1.address)
      let distFundEvents = await treasury.queryFilter("DistributedSupportedTokenToLockedFund")
      let distEvents = await treasury.queryFilter("DistributedSupportedTokensToLockedFunds")
      expect(distEvents[0].args.supportedToken).to.equal(token1.address)
      expect(distEvents[0].args.balanceBeforeDistribution).to.equal(treasuryTokenBalanceBefore)
      expect(distEvents[0].args.numberOfRecipients).to.equal(2)

      // Distribute token 2 to the locked funds
      const tx2 = await treasury.distributeSupportedTokenRewards(token2.address)
      distFundEvents = await treasury.queryFilter("DistributedSupportedTokenToLockedFund")
      distEvents = await treasury.queryFilter("DistributedSupportedTokensToLockedFunds")
      expect(distEvents[1].args.supportedToken).to.equal(token2.address)
      expect(distEvents[1].args.balanceBeforeDistribution).to.equal(treasuryTokenBalanceBefore)
      expect(distEvents[1].args.numberOfRecipients).to.equal(2)

      // Retrieve Receive events emitted by each locked fund
      //const receiveEvents1 = await lockedFund2.queryFilter("Received")
      //console.log(receiveEvents1)

      //proportionateShare = (treasuryTokenBalance * lockedBalances[i]) / tokenTotalBalance;

      const token1_share_fund1 = treasuryTokenBalanceBefore.mul(token1balance1Before).div(token1balance1Before.add(token1balance2Before).add(token1balance3Before))
      const token2_share_fund1 = treasuryTokenBalanceBefore.mul(token2balance1Before).div(token2balance1Before.add(token2balance2Before).add(token2balance3Before))

      const token1_share_fund3 = treasuryTokenBalanceBefore.mul(token1balance3Before).div(token1balance1Before.add(token1balance2Before).add(token1balance3Before))
      const token2_share_fund3 = treasuryTokenBalanceBefore.mul(token2balance3Before).div(token2balance1Before.add(token2balance2Before).add(token2balance3Before))
      /*console.log(token1_share_fund1)
      console.log(token2_share_fund1)
      console.log(token1_share_fund3)
      console.log(token2_share_fund3)*/

      // Check if the locked funds received the expected amount of native token (ETH)
      let token1balance1After = await token1.balanceOf(lockedFund.address)
      let token1balance2After = await token1.balanceOf(lockedFund2.address)
      let token1balance3After = await token1.balanceOf(lockedFund3.address)
      let token2balance1After = await token2.balanceOf(lockedFund.address)
      let token2balance2After = await token2.balanceOf(lockedFund2.address)
      let token2balance3After = await token2.balanceOf(lockedFund3.address)
      /*console.log('locked fund 1 after distribute:', balance1After)
      console.log('locked fund 2 after distribute:', balance2After)
      console.log('locked fund 3 after distribute:', balance3After)*/
      
      expect(token1balance1After).to.equal(token1balance1Before.add(token1_share_fund1))
      expect(token2balance1After).to.equal(token2balance1Before.add(token2_share_fund1))

      expect(token1balance2After).to.equal(token1balance2Before)
      expect(token2balance2After).to.equal(token2balance2Before)

      expect(token1balance3After).to.equal(token1balance3Before.add(token1_share_fund3))
      expect(token2balance3After).to.equal(token2balance3Before.add(token2_share_fund3))
    })

    it("should fail if there are no supported tokens in the treasury", async function () {
      // there should be nothing yet to distribute
      await expect(treasury.distributeSupportedTokenRewards(token1.address)).to.be.revertedWith('No supported tokens')
      await expect(treasury.distributeSupportedTokenRewards(token2.address)).to.be.revertedWith('No supported tokens')
    })

    it("should fail if token is unsupported", async function () {
      // there should be nothing yet to distribute
      await expect(treasury.distributeSupportedTokenRewards(user1.address)).to.be.revertedWith('Unsupported token')
      await expect(treasury.distributeSupportedTokenRewards(factory.address)).to.be.revertedWith('Unsupported token')
    })

    it("should distribute supported token balances to many locked funds", async function () {

      // first, create n funds
      //
      const nLockedFunds = 100

      const lockedFunds = []
      for (var i = nLockedFunds - 1; i >= 0; i--) {

        const randomNum1 = 0.1 + Math.random() * (100 - 0.1)
        const randomNum2 = 0.1 + Math.random() * (100 - 0.1)

        lockedFunds[i] = await makeFund_100edition_target100_noUnlockTime(factory, user1, user1)

        // Transfer supported tokens to lockedfund 
        await token1.transfer(lockedFunds[i].address, ethers.utils.parseUnits(randomNum1.toString(), 18))
        await token2.transfer(lockedFunds[i].address, ethers.utils.parseUnits(randomNum2.toString(), 18))

        expect(await token1.balanceOf(lockedFunds[i].address)).to.equal(ethers.utils.parseUnits(randomNum1.toString(), 18))
        expect(await token2.balanceOf(lockedFunds[i].address)).to.equal(ethers.utils.parseUnits(randomNum2.toString(), 18))
      }

      // transfer tokens to the treasury so there's something to distribute
      //
      let token1Amount = ethers.utils.parseUnits("250", 18)
      let token2Amount = ethers.utils.parseUnits("2", 18)
      await token1.transfer(treasury.address, token1Amount)
      await token2.transfer(treasury.address, token2Amount)

      let treasuryBalanceToken1 = await token1.balanceOf(treasury.address)
      let treasuryBalanceToken2 = await token2.balanceOf(treasury.address)
      
      //console.log(treasuryBalanceToken1)
      //console.log(treasuryBalanceToken2)

      // Distribute supported token 1 to the locked funds
      //
      const tx1 = await treasury.distributeSupportedTokenRewards(token1.address)
      let distFundEvents = await treasury.queryFilter("DistributedSupportedTokenToLockedFund")
      let distEvents = await treasury.queryFilter("DistributedSupportedTokensToLockedFunds")
      expect(distFundEvents.length).to.equal(nLockedFunds)
      expect(distEvents[0].args.supportedToken).to.equal(token1.address)
      expect(distEvents[0].args.balanceBeforeDistribution).to.equal(token1Amount)
      expect(distEvents[0].args.numberOfRecipients).to.equal(nLockedFunds)

      // Distribute supported token 2 to the locked funds
      //
      const tx2 = await treasury.distributeSupportedTokenRewards(token2.address)
      distFundEvents = await treasury.queryFilter("DistributedSupportedTokenToLockedFund")
      distEvents = await treasury.queryFilter("DistributedSupportedTokensToLockedFunds")
      expect(distFundEvents.length).to.equal(nLockedFunds * 2)
      expect(distEvents[1].args.supportedToken).to.equal(token2.address)
      expect(distEvents[1].args.balanceBeforeDistribution).to.equal(token2Amount)
      expect(distEvents[1].args.numberOfRecipients).to.equal(nLockedFunds)

      //console.log('distribution summary:',distEvents)


      treasuryBalanceToken1 = await token1.balanceOf(treasury.address)
      treasuryBalanceToken2 = await token2.balanceOf(treasury.address)
      
      //console.log(treasuryBalanceToken1)
      //console.log(treasuryBalanceToken2)

      // Expect the treasury to be empty of both tokens now
      expect(await token1.balanceOf(treasury.address)).to.be.closeTo(0, 5000)
      expect(await token2.balanceOf(treasury.address)).to.be.closeTo(0, 5000)
    })

  })
})