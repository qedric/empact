// We import Chai to use its asserting functions here.
const { expect, assert } = require("chai")
const { ethers, upgrades, network } = require("hardhat")
const helpers = require("@nomicfoundation/hardhat-network-helpers")
const { deploy, deployVaultImplementation, deployGenerator, deployTreasury, getTypedData, getRevertReason, getCurrentBlockTime, deployMockToken, deployMockOETHToken, generateMintRequest, makeVault, makeVault_100edition_target100_noUnlockTime, makeVault_100edition_notarget_99days } = require("./test_helpers")

const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000'

describe(" -- Testing Treasury Contract -- ", function () {
  let deployedContracts, treasury
  let user1, TREASURER
  let feeRecipient

  before(async function () {
    [user1, feeRecipient, TREASURER] = await ethers.getSigners()
  })

  beforeEach(async function () {
    deployedContracts = await deploy(feeRecipient.address, 'SepoliaETH', 'https://zebra.xyz/')
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

  describe("Vault State arrays", function () {

    /*addOpenVault*/
    it("should add a vault to the openVaults array", async function () {
      // get the deployed factory
      const factory = deployedContracts.factory
      const makeVaultFee = ethers.utils.parseUnits("0.004", "ether")
      const mr = await generateMintRequest(factory.address, user1, user1.address)
      const tx = await factory.connect(user1).mintWithSignature(
        mr.typedData.message, mr.signature, { value: makeVaultFee })
      const txReceipt = await tx.wait()

      // get the vault
      const vaultCreatedEvent = txReceipt.events.find(event => event.event === 'VaultDeployed')
      const Vault = await ethers.getContractFactory("Vault")
      const vault = Vault.attach(vaultCreatedEvent.args.vault)

      // move time forward 100 days
      await helpers.time.increase(60 * 60 * 24 * 100)

      // send 1 ETH to the vault to unlock it
      const amountToSend = ethers.utils.parseEther("1")
      await user1.sendTransaction({
        to: vault.address,
        value: amountToSend,
      })

      const txPayout = await factory.connect(user1).payout(0)
      const txPayoutReceipt = await txPayout.wait()

      const filter = treasury.filters.AddedOpenVault();
      const events = await treasury.queryFilter(filter, txPayoutReceipt.blockNumber)

      expect(events[0].args[0]).to.equal(vault.address)

      // Verify that the vault address is a member of the open vaults array
      const openVault = await treasury.openVaults(0)
      expect(openVault).to.equal(vault.address)
      expect(await treasury.isOpenVault(vault.address)).to.be.true
    })
  })

  describe("Collect & Distribute", function () {
    let deployedContracts, factory, treasury
    let lockedVault, unlockedVault, openVault
    let user1, user2
    let feeRecipient
    let token1, token2

    before(async function () {
      [user1, user2, feeRecipient] = await ethers.getSigners()
    })

    it("should fail if there are no vaults to collect from", async function () {
      const treasury_with_no_vaults = await deploy(feeRecipient.address, 'https://zebra.xyz/').then((x) => x.treasury)
      await expect(treasury_with_no_vaults.collect()).to.be.revertedWith("No open vaults to collect from")
    })

    beforeEach(async function () {
      deployedContracts = await deploy(feeRecipient.address, 'SepoliaETH', 'https://zebra.xyz/')
      factory = deployedContracts.factory
      treasury = deployedContracts.treasury
      lockedVault = await makeVault_100edition_target100_noUnlockTime(factory, user1, user1)
      unlockedVault = await makeVault_100edition_target100_noUnlockTime(factory, user1, user1)
      openVault = await makeVault_100edition_target100_noUnlockTime(factory, user1, user1)
      
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

      // Transfer enough tokens to reach 66% target amount of unlocked and open vaults
      let tokenAmount = ethers.utils.parseUnits("33", 18)
      await token1.transfer(unlockedVault.address, tokenAmount)
      await token2.transfer(unlockedVault.address, tokenAmount)
      await token1.transfer(openVault.address, tokenAmount)
      await token2.transfer(openVault.address, tokenAmount)

      // send the remaining required ETH:
      let ethToSend = ethers.utils.parseUnits("34", 18)
      await user2.sendTransaction({
        to: unlockedVault.address,
        value: ethToSend,
      })
      await user2.sendTransaction({
        to: openVault.address,
        value: ethToSend,
      })

      // call payout on the open vault (index 2) to set it to Open
      const tx = await factory.connect(user1).payout(2)
      tx.wait()

      // Transfer some tokens to the open vault
      tokenAmount = ethers.utils.parseUnits("60", 18)
      await token1.transfer(openVault.address, tokenAmount)
      await token2.transfer(openVault.address, tokenAmount)

      // and some ETH:
      ethToSend = ethers.utils.parseUnits("60", 18)
      await user2.sendTransaction({
        to: openVault.address,
        value: ethToSend,
      })

      // confirm we have one of each vault
      expect(await treasury.isOpenVault(openVault.address)).to.be.true
      expect(await treasury.isOpenVault(lockedVault.address)).to.be.false
      expect(await treasury.isOpenVault(unlockedVault.address)).to.be.false

      expect(await lockedVault.state()).to.equal(0)
      expect(await unlockedVault.state()).to.equal(1)
      expect(await openVault.state()).to.equal(2)

      /*console.log('lockedVault.address', lockedVault.address)
      console.log('unlockedVault.address', unlockedVault.address)
      console.log('openVault.address', openVault.address)*/
    })

    it("should send open vaults and not locked vaults or unlocked vaults to treasury", async function () {

      // verify that the locked vault is in the Locked state
      expect(await lockedVault.state()).to.equal(0)
      // verify that the unlocked vault is in the Unlocked state
      expect(await unlockedVault.state()).to.equal(1)
      // verify that the open vault is in the Open state
      expect(await openVault.state()).to.equal(2)
      expect(await treasury.isOpenVault(openVault.address)).to.be.true

      // Get the initial balances of native tokens and supported tokens
      const initialEthBalance = await ethers.provider.getBalance(treasury.address)
      const initialToken1Balance = await token1.balanceOf(treasury.address)
      const initialToken2Balance = await token2.balanceOf(treasury.address)

      // call collect on the treasury which should pull balance from the Open Vault only
      const tx = await treasury.connect(user1).collect()
      const txReceipt = await tx.wait()

      // Get the updated balances after collecting from the Open Vault
      const updatedEthBalance = await ethers.provider.getBalance(treasury.address)
      const updatedToken1Balance = await token1.balanceOf(treasury.address)
      const updatedToken2Balance = await token2.balanceOf(treasury.address)

      // Verify that balances have changed as expected
      const amountCollectedOfEachToken = ethers.utils.parseUnits("60", 18)
      expect(updatedEthBalance).to.equal(initialEthBalance.add(amountCollectedOfEachToken))
      expect(updatedToken1Balance).to.equal(initialToken1Balance.add(amountCollectedOfEachToken))
      expect(updatedToken2Balance).to.equal(initialToken2Balance.add(amountCollectedOfEachToken))
    })

    it("should distribute native token balance to locked vaults", async function () {

      // deploy a couple more lockedVaults
      const lockedVault2 = await makeVault_100edition_target100_noUnlockTime(factory, user1, user1)
      const lockedVault3 = await makeVault_100edition_target100_noUnlockTime(factory, user1, user1)
      
      // Count the number of locked and open vaults
      let numLockedVaults = 0
      let numVaults = 0
      let f

      // Count the number of locked vaults
      while (true) {
        try {
          const F = await ethers.getContractFactory("Vault")
          const fAddress = await factory.vaults(numVaults)
          const vault = F.attach(fAddress)
          if (await vault.state() == 0) {
            numLockedVaults++
          }
          numVaults++
        } catch {
          break
        }
          
      }
      expect(await ethers.provider.getBalance(lockedVault.address)).to.equal(0)
      expect(await ethers.provider.getBalance(lockedVault2.address)).to.equal(0)
      expect(await ethers.provider.getBalance(lockedVault3.address)).to.equal(0)
      expect(await ethers.provider.getBalance(openVault.address)).to.equal(ethers.utils.parseEther("60"))
      expect(numLockedVaults).to.equal(3)

      const openVaultNativeBalance = await ethers.provider.getBalance(openVault.address)
      //console.log('open vault balance:', openVaultNativeBalance)

      // send some ETH to vaults 2 & 3:
      await user2.sendTransaction({
        to: lockedVault2.address,
        value: ethers.utils.parseUnits("20", 18),
      })
      expect(await ethers.provider.getBalance(lockedVault2.address)).to.equal(ethers.utils.parseUnits("20", 18))
      // send some ETH to vaults 2 & 3:
      await user2.sendTransaction({
        to: lockedVault3.address,
        value: ethers.utils.parseUnits("30", 18),
      })
      expect(await ethers.provider.getBalance(lockedVault3.address)).to.equal(ethers.utils.parseUnits("30", 18))

      // check that all our locked vaults are actually locked
      expect(await lockedVault.state()).to.equal(0)
      expect(await lockedVault2.state()).to.equal(0)
      expect(await lockedVault3.state()).to.equal(0)

      // there should be nothing yet to distribute
      await expect(treasury.distributeNativeTokenRewards()).to.be.revertedWith('No native tokens')

      // call collect on the treasury which should pull balance from the Open Vault only
      const collectTx = await treasury.connect(user1).collect()
      const txReceipt = await collectTx.wait()
      expect(await ethers.provider.getBalance(openVault.address)).to.equal(0)

      // Check if the locked vaults received the expected amount of native token (ETH)
      let treasuryBalanceBefore = await ethers.provider.getBalance(treasury.address)
      let balance1Before = await ethers.provider.getBalance(lockedVault.address)
      let balance2Before = await ethers.provider.getBalance(lockedVault2.address)
      let balance3Before = await ethers.provider.getBalance(lockedVault3.address)

      // Distribute vaults to the locked vaults
      const tx = await treasury.distributeNativeTokenRewards() // Distribute to the three locked vaults
      const distVaultEvents = await treasury.queryFilter("DistributedNativeTokensToLockedVault")
      const distEvents = await treasury.queryFilter("DistributedNativeTokensToLockedVaults")
      expect(distEvents[0].args.balanceBeforeDistribution).to.equal(treasuryBalanceBefore)
      expect(distEvents[0].args.numberOfRecipients).to.equal(2)

      // Retrieve Receive events emitted by each locked vault
      const receiveEvents1 = await lockedVault3.queryFilter("Received")
      //console.log(receiveEvents1)

      // Check if the locked vaults received the expected amount of native token (ETH)
      const balance1After = await ethers.provider.getBalance(lockedVault.address)
      const balance2After = await ethers.provider.getBalance(lockedVault2.address)
      const balance3After = await ethers.provider.getBalance(lockedVault3.address)
      /*console.log('locked vault 1 after distribute:', balance1After)
      console.log('locked vault 2 after distribute:', balance2After)
      console.log('locked vault 3 after distribute:', balance3After)*/
      expect(balance1After).to.equal(balance1Before)
      expect(balance2After).to.equal(balance2Before.add(ethers.utils.parseEther("24")))
      expect(balance3After).to.equal(balance3Before.add(ethers.utils.parseEther("36")))
    })

    it("should fail if there are no native tokens in the treasury", async function () {
      // there should be nothing yet to distribute
      await expect(treasury.distributeNativeTokenRewards()).to.be.revertedWith('No native tokens')
    })

    it("should distribute supported token balances to locked vaults", async function () {

      // deploy a couple more lockedVaults
      const lockedVault2 = await makeVault_100edition_target100_noUnlockTime(factory, user1, user1)
      const lockedVault3 = await makeVault_100edition_target100_noUnlockTime(factory, user1, user1)

      // Transfer supported tokens to lockedvault 
      await token1.transfer(lockedVault.address, ethers.utils.parseUnits("1", 18))
      await token2.transfer(lockedVault.address, ethers.utils.parseUnits("10", 18))

      // Transfer supported tokens to lockedvault 3
      await token1.transfer(lockedVault3.address, ethers.utils.parseUnits("25", 18))
      await token2.transfer(lockedVault3.address, ethers.utils.parseUnits("0.5", 18))

      expect(await token1.balanceOf(lockedVault.address)).to.equal(ethers.utils.parseUnits("1", 18))
      expect(await token2.balanceOf(lockedVault.address)).to.equal(ethers.utils.parseUnits("10", 18))

      expect(await token1.balanceOf(lockedVault2.address)).to.equal(ethers.utils.parseUnits("0", 18))
      expect(await token2.balanceOf(lockedVault2.address)).to.equal(ethers.utils.parseUnits("0", 18))

      expect(await token1.balanceOf(lockedVault3.address)).to.equal(ethers.utils.parseUnits("25", 18))
      expect(await token2.balanceOf(lockedVault3.address)).to.equal(ethers.utils.parseUnits("0.5", 18))

      // check that all our locked vaults are actually locked
      expect(await lockedVault.state()).to.equal(0)
      expect(await lockedVault2.state()).to.equal(0)
      expect(await lockedVault3.state()).to.equal(0)

      // there should be nothing yet to distribute
      await expect(treasury.distributeSupportedTokenRewards(token1.address)).to.be.revertedWith('No supported tokens')
      await expect(treasury.distributeSupportedTokenRewards(token2.address)).to.be.revertedWith('No supported tokens')

      // call collect on the treasury which should pull balance from the Open Vault only
      const collectTx = await treasury.connect(user1).collect()
      const txReceipt = await collectTx.wait()
      expect(await ethers.provider.getBalance(openVault.address)).to.equal(0)

      // check that the token balances have been collected from open vault into the treasury
      expect(await token1.balanceOf(treasury.address)).to.equal(ethers.utils.parseUnits("60", 18))
      expect(await token2.balanceOf(treasury.address)).to.equal(ethers.utils.parseUnits("60", 18))

      // Check if the locked vaults received the expected amount of supported tokens
      let treasuryTokenBalanceBefore = ethers.utils.parseUnits("60", 18)

      let token1balance1Before = await token1.balanceOf(lockedVault.address)
      let token1balance2Before = await token1.balanceOf(lockedVault2.address)
      let token1balance3Before = await token1.balanceOf(lockedVault3.address)
      let token2balance1Before = await token2.balanceOf(lockedVault.address)
      let token2balance2Before = await token2.balanceOf(lockedVault2.address)
      let token2balance3Before = await token2.balanceOf(lockedVault3.address)

      /*console.log('token1balance1Before', token1balance1Before)
      console.log('token1balance2Before', token1balance2Before)
      console.log('token1balance3Before', token1balance3Before)
      console.log('token2balance1Before', token2balance1Before)
      console.log('token2balance2Before', token2balance2Before)
      console.log('token2balance3Before', token2balance3Before)*/

      // Distribute token 1 to the locked vaults
      const tx1 = await treasury.distributeSupportedTokenRewards(token1.address)
      let distVaultEvents = await treasury.queryFilter("DistributedSupportedTokenToLockedVault")
      let distEvents = await treasury.queryFilter("DistributedSupportedTokensToLockedVaults")
      expect(distEvents[0].args.supportedToken).to.equal(token1.address)
      expect(distEvents[0].args.balanceBeforeDistribution).to.equal(treasuryTokenBalanceBefore)
      expect(distEvents[0].args.numberOfRecipients).to.equal(2)

      // Distribute token 2 to the locked vaults
      const tx2 = await treasury.distributeSupportedTokenRewards(token2.address)
      distVaultEvents = await treasury.queryFilter("DistributedSupportedTokenToLockedVault")
      distEvents = await treasury.queryFilter("DistributedSupportedTokensToLockedVaults")
      expect(distEvents[1].args.supportedToken).to.equal(token2.address)
      expect(distEvents[1].args.balanceBeforeDistribution).to.equal(treasuryTokenBalanceBefore)
      expect(distEvents[1].args.numberOfRecipients).to.equal(2)

      // Retrieve Receive events emitted by each locked vault
      //const receiveEvents1 = await lockedVault2.queryFilter("Received")
      //console.log(receiveEvents1)

      //proportionateShare = (treasuryTokenBalance * lockedBalances[i]) / tokenTotalBalance;

      const token1_share_vault1 = treasuryTokenBalanceBefore.mul(token1balance1Before).div(token1balance1Before.add(token1balance2Before).add(token1balance3Before))
      const token2_share_vault1 = treasuryTokenBalanceBefore.mul(token2balance1Before).div(token2balance1Before.add(token2balance2Before).add(token2balance3Before))

      const token1_share_vault3 = treasuryTokenBalanceBefore.mul(token1balance3Before).div(token1balance1Before.add(token1balance2Before).add(token1balance3Before))
      const token2_share_vault3 = treasuryTokenBalanceBefore.mul(token2balance3Before).div(token2balance1Before.add(token2balance2Before).add(token2balance3Before))
      /*console.log(token1_share_vault1)
      console.log(token2_share_vault1)
      console.log(token1_share_vault3)
      console.log(token2_share_vault3)*/

      // Check if the locked vaults received the expected amount of native token (ETH)
      let token1balance1After = await token1.balanceOf(lockedVault.address)
      let token1balance2After = await token1.balanceOf(lockedVault2.address)
      let token1balance3After = await token1.balanceOf(lockedVault3.address)
      let token2balance1After = await token2.balanceOf(lockedVault.address)
      let token2balance2After = await token2.balanceOf(lockedVault2.address)
      let token2balance3After = await token2.balanceOf(lockedVault3.address)
      /*console.log('locked vault 1 after distribute:', balance1After)
      console.log('locked vault 2 after distribute:', balance2After)
      console.log('locked vault 3 after distribute:', balance3After)*/
      
      expect(token1balance1After).to.equal(token1balance1Before.add(token1_share_vault1))
      expect(token2balance1After).to.equal(token2balance1Before.add(token2_share_vault1))

      expect(token1balance2After).to.equal(token1balance2Before)
      expect(token2balance2After).to.equal(token2balance2Before)

      expect(token1balance3After).to.equal(token1balance3Before.add(token1_share_vault3))
      expect(token2balance3After).to.equal(token2balance3Before.add(token2_share_vault3))
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

    it("should distribute supported token balances to many locked vaults", async function () {

      // first, create n vaults
      //
      const nLockedVaults = 100

      const lockedVaults = []
      for (var i = nLockedVaults - 1; i >= 0; i--) {

        const randomNum1 = 0.1 + Math.random() * (100 - 0.1)
        const randomNum2 = 0.1 + Math.random() * (100 - 0.1)

        lockedVaults[i] = await makeVault_100edition_target100_noUnlockTime(factory, user1, user1)

        // Transfer supported tokens to lockedvault 
        await token1.transfer(lockedVaults[i].address, ethers.utils.parseUnits(randomNum1.toString(), 18))
        await token2.transfer(lockedVaults[i].address, ethers.utils.parseUnits(randomNum2.toString(), 18))

        expect(await token1.balanceOf(lockedVaults[i].address)).to.equal(ethers.utils.parseUnits(randomNum1.toString(), 18))
        expect(await token2.balanceOf(lockedVaults[i].address)).to.equal(ethers.utils.parseUnits(randomNum2.toString(), 18))
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

      // Distribute supported token 1 to the locked vaults
      //
      const tx1 = await treasury.distributeSupportedTokenRewards(token1.address)
      let distVaultEvents = await treasury.queryFilter("DistributedSupportedTokenToLockedVault")
      let distEvents = await treasury.queryFilter("DistributedSupportedTokensToLockedVaults")
      expect(distVaultEvents.length).to.equal(nLockedVaults)
      expect(distEvents[0].args.supportedToken).to.equal(token1.address)
      expect(distEvents[0].args.balanceBeforeDistribution).to.equal(token1Amount)
      expect(distEvents[0].args.numberOfRecipients).to.equal(nLockedVaults)

      // Distribute supported token 2 to the locked vaults
      //
      const tx2 = await treasury.distributeSupportedTokenRewards(token2.address)
      distVaultEvents = await treasury.queryFilter("DistributedSupportedTokenToLockedVault")
      distEvents = await treasury.queryFilter("DistributedSupportedTokensToLockedVaults")
      expect(distVaultEvents.length).to.equal(nLockedVaults * 2)
      expect(distEvents[1].args.supportedToken).to.equal(token2.address)
      expect(distEvents[1].args.balanceBeforeDistribution).to.equal(token2Amount)
      expect(distEvents[1].args.numberOfRecipients).to.equal(nLockedVaults)

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