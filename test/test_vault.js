// We import Chai to use its asserting functions here.
const { expect, assert } = require("chai")
const { ethers, upgrades, network } = require("hardhat")
const helpers = require("@nomicfoundation/hardhat-network-helpers")
const { 
  deploy,
  deployVaultImplementation,
  deployGenerator,
  deployTreasury,
  getTypedData,
  getRevertReason,
  getCurrentBlockTime,
  deployMockToken,
  deployMockOETHToken,
  generateMintRequest,
  makeVault,
  makeVault_100edition_target100_noUnlockTime,
  makeVault_100edition_notarget_99days,
  makeLockedVault,
  makeUnlockedVault,
  makeOpenVault } = require("./test_helpers")

const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000'

describe(" -- Testing Vault Contract -- ", function () {

  describe("Vault Creation", function () {

    let factory
    let INITIAL_DEFAULT_ADMIN_AND_SIGNER
    let user1
    let feeRecipient

    before(async function () {
      [INITIAL_DEFAULT_ADMIN_AND_SIGNER, NEW_SIGNER, user1, feeRecipient] = await ethers.getSigners()
    })

    beforeEach(async function () {
      const deployedContracts = await deploy(feeRecipient.address, 'SepoliaETH', 'https://zebra.xyz/')
      factory = deployedContracts.factory
    })

    /*
      1. calls factory mintWithSignature()
      2. checks that vault's VaultInitialised event was fired with correct args
      3. gets vault attributes and checks they have expected values
    */
    it("should successfully mint new tokens and initalise vault with correct attributes", async function () {
      const makeVaultFee = ethers.parseUnits("0.004", "ether")
      const mr = await generateMintRequest(factory.target, INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1.address)

      const initialBalanceUser1 = await factory.balanceOf(user1.address, 0)

      const tx = await factory.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).mintWithSignature(mr.typedData.message, mr.signature, { value: makeVaultFee })

      // Retrieve the vault address from the VaultDeployed event
      const vaultDeployedEvent = await factory.queryFilter('VaultDeployed', tx.blockHash)

      // Verify events in the Vault contract
      const vaultContract = await ethers.getContractAt('IVault', vaultDeployedEvent[0].args.vault)
      const vaultInitialisedEvent = await vaultContract.queryFilter('VaultInitialised', tx.blockHash)
      expect(vaultInitialisedEvent.length).to.equal(1)
      expect(vaultInitialisedEvent[0].args.attributes.tokenId).to.equal(0)

      // Verify the attributes of the Vault contract
      const vaultAttributes = await vaultContract.attributes()
      expect(vaultAttributes.tokenId).to.equal(0)
      expect(vaultAttributes.unlockTime).to.equal(mr.typedData.message.unlockTime)
      expect(vaultAttributes.targetBalance).to.equal(mr.typedData.message.targetBalance)
      expect(vaultAttributes.name).to.equal(mr.typedData.message.name)
      expect(vaultAttributes.description).to.equal(mr.typedData.message.description)
    })
  })

  describe("Configuration", function () {

    let owner, feeRecipient, user1
    let factory, treasury, vault, lockedVault

    before(async function () {
      [owner, feeRecipient, user1] = await ethers.getSigners()
    })

    beforeEach(async function () {
      const deployedContracts = await deploy(feeRecipient.address, 'SepoliaETH', 'https://zebra.xyz/')
      factory = deployedContracts.factory
      treasury = deployedContracts.treasury
      vault = await makeVault(factory, owner, user1)
      lockedVault = await makeLockedVault(factory, owner, user1)
    })

    it("should successfully opt in for oETH rebasing and emit event", async function () {
      const oETHToken = await deployMockOETHToken()
      await treasury.setOETHContractAddress(oETHToken.target)
      expect(await treasury.oETHTokenAddress()).to.equal(oETHToken.target)
      const tx = await vault.optInForOETHRebasing()
      const optedInForOriginProtocolRebasingEvent = await vault.queryFilter('OptedInForOriginProtocolRebasing', tx.blockHash)
      expect(optedInForOriginProtocolRebasingEvent.length).to.equal(1)
    })

    it("should revert if opting in again", async function () {
      const oETHToken = await deployMockOETHToken()
      await treasury.setOETHContractAddress(oETHToken.target)
      const tx = await vault.optInForOETHRebasing()
      tx.wait()
      await expect(vault.optInForOETHRebasing()).to.be.revertedWith('oETH rebasing already enabled')
    })

    it("should revert if oETH contract address is not set in the treasury", async function () {
      await expect(vault.optInForOETHRebasing()).to.be.revertedWith('oETH contract address is not set')
    })

    it("should setStateUnlocked and emit StateChanged if vault is locked & target and unlock date met", async function () {
      //send enough ETH
      const amountToSend = ethers.parseEther("1")
      let receiveTx = await user1.sendTransaction({
        to: vault.target,
        value: amountToSend,
      })

      // Increase block time to after the unlockTime
      await helpers.time.increase(60 * 60 * 24 * 100)

      // there should not be the event submitted
      const tx = await vault.setStateUnlocked()
      const stateChangedEvent = await vault.queryFilter('StateChanged', tx.blockHash)
      expect(stateChangedEvent.length).to.equal(1)
      await expect(await vault.state()).to.equal(1)
    })

    it("should fail to setStateUnlocked if vault is not locked", async function () {
      // Increase block time to after the unlockTime
      await helpers.time.increase(60 * 60 * 24 * 100)

      //send enough ETH - this will set it to unlocked
      const amountToSend = ethers.parseEther("1")
      let receiveTx = await user1.sendTransaction({
        to: vault.target,
        value: amountToSend,
      })

      await expect(vault.setStateUnlocked()).to.be.revertedWith('Vault not locked')
    })

    it("should fail to setStateUnlocked if target is not reached", async function () {
      //send not enough ETH
      const amountToSend = ethers.parseEther("0.5")
      let receiveTx = await user1.sendTransaction({
        to: lockedVault.target,
        value: amountToSend,
      })

      await expect(lockedVault.setStateUnlocked()).to.be.revertedWith('Target not met')
    })

    it("should fail to setStateUnlocked if unlock date is in the future", async function () {
      //send enough ETH
      const amountToSend = ethers.parseEther("1")
      let receiveTx = await user1.sendTransaction({
        to: vault.target,
        value: amountToSend,
      })
      await expect(vault.setStateUnlocked()).to.be.revertedWith('Vault has not reached maturity')
    })
  })

  describe("Native token deposits", function () {
    let owner, feeRecipient, user1, user2
    let factory, treasury, vault

    before(async function () {
      [owner, feeRecipient, user1, user2] = await ethers.getSigners()
    })

    beforeEach(async function () {
      const deployedContracts = await deploy(feeRecipient.address, 'SepoliaETH', 'https://zebra.xyz/')
      factory = deployedContracts.factory
      treasury = deployedContracts.treasury
      vault = await makeVault(factory, owner, user1)
    })

    it("should emit Received with expected args when native token is received", async function () {
      //send some ETH
      const amountToSend = ethers.parseEther("0.33")
      const tx = await user1.sendTransaction({
        to: vault.target,
        value: amountToSend,
      })

      const receivedEvent = await vault.queryFilter('Received', tx.blockHash)

      expect(receivedEvent.length).to.equal(1)
      expect(receivedEvent[0].args._from).to.equal(user1.address)
      expect(receivedEvent[0].args._amount).to.equal(amountToSend)
    })

    it("should set state to Unlocked and emit StateChanged event when receiving native tokens, if requriements are met", async function () {
      // Increase block time to after the unlockTime
      await helpers.time.increase(60 * 60 * 24 * 100)

      //send some ETH
      const amountToSend = ethers.parseEther("1")
      const tx = await user1.sendTransaction({
        to: vault.target,
        value: amountToSend,
      })

      const stateChangedEvent = await vault.queryFilter('StateChanged', tx.blockHash)
      expect(stateChangedEvent.length).to.equal(1)
      expect(stateChangedEvent[0].args.newState).to.equal(1)
    })
  })

  describe("Unsupported token deposits", function () {
    let owner, feeRecipient, user1, user2
    let factory, treasury, vault

    before(async function () {
      [owner, feeRecipient, user1, user2] = await ethers.getSigners()
    })

    beforeEach(async function () {
      const deployedContracts = await deploy(feeRecipient.address, 'SepoliaETH', 'https://zebra.xyz/')
      factory = deployedContracts.factory
      treasury = deployedContracts.treasury
      vault = await makeVault(factory, owner, user1)
    })

    it("should fail when sending erc1155 tokens to a vault", async function () {
      await expect(factory.connect(user1).safeTransferFrom(user1.address, vault.target, 0, 2, "0x"))
      .to.be.revertedWith("ERC1155InvalidReceiver")
    })
  })

  describe("Token balances & unlocking", function () {

    let owner, feeRecipient, user1
    let factory, treasury, vault

    before(async function () {
      [owner, feeRecipient, user1] = await ethers.getSigners()
    })

    beforeEach(async function () {
      const deployedContracts = await deploy(feeRecipient.address, 'SepoliaETH', 'https://zebra.xyz/')
      factory = deployedContracts.factory
      treasury = deployedContracts.treasury
      vault = await makeVault(factory, owner, user1)
    })

    /*
      1. create two mock tokens
      2. transfer some token 1 to the vault, check that balance = 0, because it's an unsupported token
      3. add token 1 to supported tokens, check that balance updates
      4. send some native token, check that the balance updates
      5. add token 2 to supported tokens, send some token 2, check that balance updates
    */
    it("getTotalBalance() should return correct sum of native and staked tokens", async function () {
      // Deploy a mock ERC20 token for testing
      const MockToken = await ethers.getContractFactory("MockToken")
      const token1 = await MockToken.deploy("Mock Token 1", "MOCK1")
      await token1.waitForDeployment()

      // Deploy a mock ERC20 token for testing
      const token2 = await MockToken.deploy("Mock Token 2", "MOCK2")
      await token2.waitForDeployment()

      // Check the token balances before the transfer
      expect(await token1.balanceOf(vault.target)).to.equal(0)
      expect(await token2.balanceOf(vault.target)).to.equal(0)

      // Transfer some tokens to the vault contract
      const tokenAmount = ethers.parseUnits("0.2", 18)
      const tx1 = await token1.transfer(vault.target, tokenAmount)
      tx1.wait()

      expect(await token1.balanceOf(vault.target)).to.equal(tokenAmount)

      // balance should still be zero until we add it as a supported token
      let totalBalance1 = await vault.getTotalBalance()
      expect(totalBalance1).to.equal(0)

      // add the token as a supported token in the treasury contract
      expect(await treasury.addNativeStakedToken(token1.target)).to.not.be.reverted

      // now the vault balance should be equal to the token1 balance
      totalBalance1 = await vault.getTotalBalance()
      expect(totalBalance1).to.equal(tokenAmount)

      // send some native token to the vault
      const amountToSend = ethers.parseEther("0.2")
      const tx = await user1.sendTransaction({
        to: vault.target,
        value: amountToSend,
      })

      expect(await ethers.provider.getBalance(vault.target)).to.equal(amountToSend)
      expect(await vault.getTotalBalance()).to.equal(ethers.parseEther("0.4"))

      // add the second token as a supported token in the treasury contract
      expect(await treasury.addSupportedToken(token2.target)).to.not.be.reverted

      // Transfer some of the second tokens to the vault contract
      const tx2 = await token1.transfer(vault.target, tokenAmount)
      tx2.wait()

      // check that token 2 is accounted for in the total balance
      expect(await vault.getTotalBalance()).to.equal(ethers.parseEther("0.6"))
    })

    it("should remain locked then unlock correctly with supported base token", async function () {

      // Deploy a mock ERC20 supported token for testing
      const MockToken = await ethers.getContractFactory("MockToken")
      const token1 = await MockToken.deploy("Mock Token 1", "MOCK1")
      await token1.waitForDeployment()

      // deploy mock staking token
      const token2 = await MockToken.deploy("Mock Token 2", "MOCK2")
      await token2.waitForDeployment()

      // make a Locked vault
      vault = await makeLockedVault(factory, owner, user1, token1.target)

      // Check the token balances before the transfer
      expect(await token1.balanceOf(vault.target)).to.equal(0)

      // Transfer some tokens to the vault contract
      const tokenAmount = ethers.parseUnits("20", 18)
      const tx1 = await token1.transfer(vault.target, tokenAmount)
      tx1.wait()

      // Check the token balance after the transfer
      expect(await token1.balanceOf(vault.target)).to.equal(tokenAmount)

      // check the vault is still locked
      expect(await vault.state()).to.equal(0, 'vault state should == 0 (locked)')

      // add token2 as a native staking token in the treasury contract
      expect(await treasury.addNativeStakedToken(token2.target)).to.not.be.reverted

      // send enough native token to the vault to unlock (shouldn't)
      const tx = await user1.sendTransaction({
        to: vault.target,
        value: ethers.parseUnits("100", 18),
      })

      // check the vault is still locked
      expect(await vault.state()).to.equal(0, 'vault state should == 0 (locked)')

      // try to unlock it 
      await expect(vault.setStateUnlocked()).to.be.revertedWith('Unsupported token')

      // add token1 as a supported token in the treasury contract
      expect(await treasury.addSupportedToken(token1.target)).to.not.be.reverted
      
      // try to unlock it again
      await expect(vault.setStateUnlocked()).to.be.revertedWith('Target not met')

      // Transfer some native staked tokens to the vault contract
      const tx2 = await token2.transfer(vault.target, ethers.parseUnits("100", 18))
      tx2.wait()

      // check the vault is still locked
      expect(await vault.state()).to.equal(0, 'vault state should == 0 (locked)')

      // try to unlock it 
      await expect(vault.setStateUnlocked()).to.be.revertedWith('Target not met')

      // Transfer enough supported tokens to the vault contract to meet target
      const tx3 = await token1.transfer(vault.target, ethers.parseUnits("80", 18))
      tx3.wait()

      // Check the token balance after the transfer is equal to target amount
      expect(await token1.balanceOf(vault.target)).to.equal(ethers.parseUnits("100", 18))

      // check the vault is still locked
      expect(await vault.state()).to.equal(0, 'vault state should == 0 (locked)')

      // try to unlock it 
      const unlockTx = await vault.setStateUnlocked()
      expect(unlockTx).to.not.be.reverted

      const stateChangedEvent = await vault.queryFilter('StateChanged', unlockTx.blockHash)
      expect(stateChangedEvent.length).to.equal(1)
      expect(stateChangedEvent[0].args.newState).to.equal(1)

      // check the vault is unlocked
      expect(await vault.state()).to.equal(1, 'vault state should == 1 (unlocked)')
    })

    /*
      1. create a mock token, add it to supported tokens, advance the time
      2. transfer 50% of target amount of the token to the vault
      3. transfer 50% of target amount of native token to the vault 
      4. check total balance is equivalent to 100%
      5. check that the state change event was fired
      6. check that the state actually changed
    */
    it("should set state to Unlocked & emit StateChanged event with 50/50% native & staked tokens", async function () {
      // Increase block time to after the unlockTime
      await helpers.time.increase(60 * 60 * 24 * 100)

      // Deploy a mock ERC20 token for testing
      const MockToken = await ethers.getContractFactory("MockToken")
      const token1 = await MockToken.deploy("Mock Token 1", "MOCK1")
      await token1.waitForDeployment()

      // add the token as a staked token in the treasury contract
      expect(await treasury.addNativeStakedToken(token1.target)).to.not.be.reverted

      // Transfer some tokens to the vault contract
      const tokenAmount = ethers.parseUnits("0.5", 18)
      const tx1 = await token1.transfer(vault.target, tokenAmount)
      tx1.wait()

      //send some ETH
      const amountToSend = ethers.parseEther("0.5")
      const tx = await user1.sendTransaction({
        to: vault.target,
        value: amountToSend,
      })

      const totalBalance = await vault.getTotalBalance()
      expect(totalBalance).to.equal(ethers.parseEther("1"))

      const stateChangedEvent = await vault.queryFilter('StateChanged', tx.blockHash)
      expect(stateChangedEvent.length).to.equal(1)
      expect(stateChangedEvent[0].args.newState).to.equal(1)

      // check the state is Unlocked
      expect(await vault.state()).to.equal(1)
    })

    /*
      1. create a mock token, add it to supported tokens, advance the time
      2. transfer some token to the vault
      4. check total balance is captures it
      5. remove token from supported tokens
      6. check that the balance reduced accordingly
    */
    it("should stop including token in balance after 'removeNativeStakedToken'", async function () {
      // Deploy a mock ERC20 token for testing
      const MockToken = await ethers.getContractFactory("MockToken")
      const token1 = await MockToken.deploy("Mock Token 1", "MOCK1")
      await token1.waitForDeployment()

      // add the token as a supported token in the treasury contract
      expect(await treasury.addNativeStakedToken(token1.target)).to.not.be.reverted

      // Transfer some tokens to the vault contract
      const tokenAmount = ethers.parseUnits("55", 18)
      const tx1 = await token1.transfer(vault.target, tokenAmount)
      tx1.wait()

      expect(await token1.balanceOf(vault.target)).to.equal(tokenAmount)

      // expect vault to account for the token balance
      expect(await vault.getTotalBalance()).to.equal(tokenAmount)

      // remove the token from supported tokens
      expect(await treasury.removeNativeStakedToken(token1.target)).to.not.be.reverted 

      // now the vault balance should be 0
      expect(await vault.getTotalBalance()).to.equal(0)
    })
  })

  describe("Payout", function () {

    let factory, treasury, vault, vault100
    let INITIAL_DEFAULT_ADMIN_AND_SIGNER
    let user1, user2, user3
    let feeRecipient

    before(async function () {
      [INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1, user2, user3, feeRecipient] = await ethers.getSigners()
    })

    beforeEach(async function () {
      const deployedContracts = await deploy(feeRecipient.address, 'SepoliaETH', 'https://zebra.xyz/')
      factory = deployedContracts.factory
      treasury = deployedContracts.treasury
      vault = await makeVault(factory, INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1)
      vault100 = await makeVault_100edition_target100_noUnlockTime(factory, INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1)
    })

    it("should revert if vault is Locked", async function () {
      // verify that the vault is in the Locked state
      expect(await vault.state()).to.equal(0)

      // Try to transfer tokens out of the vault contract before unlock
      await expect(factory.connect(user1).payout(0))
        .to.be.revertedWith("Must be Unlocked")
    })

    it("should update the vault state to Open when last payout", async function () {

      // Increase block time to after the unlockTime
      await helpers.time.increase(60 * 60 * 24 * 100) // 100 days

      //send enough ETH
      const amountToSend = ethers.parseEther("1")
      const tx = await user1.sendTransaction({
        to: vault.target,
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
      expect(await vault.state()).to.equal(1, 'vault should be Unlocked')

      // Call the payout function for user 2
      payoutTx = await factory
        .connect(user2)
        .payout(0)
      await payoutTx.wait()

      // there should be the StateChanged event submitted
      const stateChangedEvent = await vault.queryFilter('StateChanged', payoutTx.blockHash)
      expect(stateChangedEvent.length).to.equal(1)
      expect(stateChangedEvent[0].args.newState).to.equal(2, 'Event arg newState should equal 2')

      // state should now be 2 (Open)
      expect(await vault.state()).to.equal(2, 'vault should be open')
    })

    /*
      1. call payout on unlocked vault
      2. check that withdraw and fee events are fired with correct arguments
      3. check that recipient and fee recipient receive correct amounts
    */
    it("should payout native tokens, with expected events and arguments", async function () {

      // Increase block time to after the unlockTime
      await helpers.time.increase(60 * 60 * 24 * 100) // 100 days

      // check the state is locked
      expect(await vault.state()).to.equal(0, 'vault should be locked')

      //send enough ETH
      const amountToSend = ethers.parseEther("1")

      // Send the ETH to the vault contract
      let receiveTx = await user2.sendTransaction({
        to: vault.target,
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

      events = await vault.queryFilter("Withdrawal", payoutTx.blockHash)
      expect(events.length).to.equal(1, 'there should be 1 Withdrawal event')

      const withdrawalFeeBps = await factory.withdrawalFeeBps()
      const withdrawalFee = amountToSend.mul(withdrawalFeeBps).div(10000)
      const withdrawNetAmount = amountToSend.sub(withdrawalFee)

      const event = events[0]
      expect(event.args.who).to.equal(user1.address, 'Withdrawal should have correct recipient address')
      expect(event.args.amount).to.equal(withdrawNetAmount, 'Withdrawal should be for correct amount')
      expect(event.args.balance).to.equal(4, 'Withdrawal should show correct amount of tokens redeemed')

      const feeEvents = await vault.queryFilter("WithdrawalFeePaid", payoutTx.blockHash)
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
      1. send tokens to vault
      2. send native tokens to vault
      3. execute payout
      4. verifty correct amounts to recipient
      5. verify events have corect params
    */
    it("should withdraw correct amounts of native & staked tokens to sole owner", async function () {

      // Deploy mock ERC20 tokens for testing
      const MockToken = await ethers.getContractFactory("MockToken")
      const token1 = await MockToken.deploy("Mock Token 1", "MOCK1")
      await token1.waitForDeployment()
      const token2 = await MockToken.deploy("Mock Token 2", "MOCK2")
      await token2.waitForDeployment()

      // Transfer enough tokens to reach 66% target amount
      const tokenAmount = ethers.parseUnits("33", 18)
      await token1.transfer(vault100.target, tokenAmount)
      await token2.transfer(vault100.target, tokenAmount)

      // send the remaining required ETH:
      const ethToSend = ethers.parseUnits("34", 18)
      await user2.sendTransaction({
        to: vault100.target,
        value: ethToSend,
      })

      // Approve our mock tokens:
      await treasury.addNativeStakedToken(token1.target)
      await treasury.addNativeStakedToken(token2.target)

      // setStateUnlocked should be unlocked
      expect(await vault100.state()).to.equal(0, 'vault state should == 0 (locked)')

      await vault100.setStateUnlocked()

      expect(await vault100.state()).to.equal(1, 'vault state should == 1 (unlocked)')

      //get holders balance before payout
      const initialOwnerETHBalance = await ethers.provider.getBalance(user1.address)
      const initialOwnerToken1Balance = await token1.balanceOf(user1.address)
      const initialOwnerToken2Balance = await token2.balanceOf(user1.address)

      // should payout all vaults
      const tx = await factory.connect(user1).payout(1)
      vaultETHBalance = await ethers.provider.getBalance(vault100.target)
      vaultToken1Balance = await token1.balanceOf(vault100.target)
      vaultToken2Balance = await token2.balanceOf(vault100.target)
      expect(vaultETHBalance).to.equal(0)
      expect(vaultToken1Balance).to.equal(0)
      expect(vaultToken2Balance).to.equal(0)

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

    it("should withdraw correct amounts of supported token to sole owner", async function () {

      // Deploy mock ERC20 tokens for testing
      const MockToken = await ethers.getContractFactory("MockToken")
      const token1 = await MockToken.deploy("Mock Token 1", "MOCK1")
      await token1.waitForDeployment()
      const token2 = await MockToken.deploy("Mock Token 2", "MOCK2")
      await token2.waitForDeployment()
      const token3 = await MockToken.deploy("Mock Token 3", "MOCK2")
      await token3.waitForDeployment()

      // make new vault using token1 as base currency
      vault = await makeLockedVault(factory, INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1, token1.target)

      // Transfer enough tokens to reach 66% target amount
      const tokenAmount = ethers.parseUnits("33", 18)
      await token1.transfer(vault.target, tokenAmount)
      await token2.transfer(vault.target, tokenAmount)

      // Transfer enough token 3 to unlock if it was counted
      await token3.transfer(vault.target, ethers.parseUnits("67", 18))

      // send the remaining required ETH:
      const ethToSend = ethers.parseUnits("67", 18)
      await user2.sendTransaction({
        to: vault.target,
        value: ethToSend,
      })

      // Approve our mock tokens:
      await treasury.addSupportedToken(token1.target) // our base currency
      await treasury.addSupportedToken(token2.target) // another random supported token
      await treasury.addNativeStakedToken(token3.target) // a staked token

      // state should be Locked
      expect(await vault.state()).to.equal(0, 'vault state should == 0 (locked)')

      // should fail even with other tokens 
      await expect(vault.setStateUnlocked()).to.be.revertedWith('Target not met')

      // state should still be Locked
      expect(await vault.state()).to.equal(0, 'vault state should == 0 (locked)')

      // Transfer enough token 1 to unlock
      await token1.transfer(vault.target, ethers.parseUnits("67", 18))

      // base currency balance should be 100
      expect(await token1.balanceOf(vault.target)).to.equal(ethers.parseUnits("100", 18))

      await expect(vault.setStateUnlocked()).to.not.be.reverted

      expect(await vault.state()).to.equal(1, 'vault state should == 1 (unlocked)')

      //get holders balance before payout
      const initialOwnerETHBalance = await ethers.provider.getBalance(user1.address)
      const initialOwnerToken1Balance = await token1.balanceOf(user1.address)

      // vault token1 balance before payout
      const vaultToken1Balance_beforePayout = await token1.balanceOf(vault.target)

      // get the tokenId so we can call payout on it
      const attributes = await vault.attributes()

      // should payout all vaults
      const tx = await factory.connect(user1).payout(attributes.tokenId)
      const vaultETHBalance = await ethers.provider.getBalance(vault.target)
      const vaultToken1Balance = await token1.balanceOf(vault.target)
      const vaultToken2Balance = await token2.balanceOf(vault.target)
      const vaultToken3Balance = await token3.balanceOf(vault.target)
      expect(vaultETHBalance).to.equal(ethToSend)
      expect(vaultToken1Balance).to.equal(0)
      expect(vaultToken2Balance).to.equal(tokenAmount)
      expect(vaultToken3Balance).to.equal(ethers.parseUnits("67", 18))

      // get gas used
      const txReceipt = await ethers.provider.getTransactionReceipt(tx.hash)
      const gasCost = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice)

      // holder should receive all supported token balance, minus ETH break fee and gas:
      const user1ETHBalanceAfterPayout = await ethers.provider.getBalance(user1.address)
      const tokenPayoutFee = vaultToken1Balance_beforePayout.mul(400).div(10000) // 400 basis points
      expect(user1ETHBalanceAfterPayout).to.equal(initialOwnerETHBalance.sub(gasCost))

      // holder should receive all token1 balance:
      const ownerToken1BalanceAfterPayout = await token1.balanceOf(user1.address)
      const ownerToken2BalanceAfterPayout = await token2.balanceOf(user1.address)
      const ownerToken3BalanceAfterPayout = await token3.balanceOf(user1.address)

      // fee recipient balance of base currency
      const feeRecipientBaseTokenBalance = await token1.balanceOf(feeRecipient.address)

      expect(ownerToken1BalanceAfterPayout).to.equal(initialOwnerToken1Balance.add(
        vaultToken1Balance_beforePayout).sub(tokenPayoutFee))
      expect(ownerToken2BalanceAfterPayout).to.equal(0)
      expect(ownerToken3BalanceAfterPayout).to.equal(0)

      // check the feeRecipient has received the expected fees
      expect(feeRecipientBaseTokenBalance).to.equal(tokenPayoutFee)
    })

    it("should send correct fee amounts when withdrawing mix of native & staked tokens for sole owner", async function () {
      // Deploy mock ERC20 tokens for testing
      const MockToken = await ethers.getContractFactory("MockToken")
      const token1 = await MockToken.deploy("Mock Token 1", "MOCK1")
      await token1.waitForDeployment()
      const token2 = await MockToken.deploy("Mock Token 2", "MOCK2")
      await token2.waitForDeployment()

      // Transfer enough tokens to reach the target amount
      const tokenAmount = ethers.parseUnits("33", 18)
      await token1.transfer(vault100.target, tokenAmount)
      await token2.transfer(vault100.target, tokenAmount)

      // Send the remaining required ETH
      const ethToSend = ethers.parseUnits("34", 18)
      await user2.sendTransaction({
        to: vault100.target,
        value: ethToSend,
      })

      // Approve our mock tokens
      await treasury.addNativeStakedToken(token1.target)
      await treasury.addNativeStakedToken(token2.target)

      // unlock the vault
      await vault100.setStateUnlocked()

      // Get initial owner balances
      const initialOwnerETHBalance = await ethers.provider.getBalance(user1.address)
      const initialOwnerToken1Balance = await token1.balanceOf(user1.address)
      const initialOwnerToken2Balance = await token2.balanceOf(user1.address)

      // Get initial fee recipient balances
      const initialFeeRecipientToken1Balance = await token1.balanceOf(feeRecipient.address)
      const initialFeeRecipientToken2Balance = await token2.balanceOf(feeRecipient.address)

      // Perform payout
      const tx = await factory.connect(user1).payout(1)

      // Get vault balances after payout
      const vaultETHBalance = await ethers.provider.getBalance(vault100.target)
      const vaultToken1Balance = await token1.balanceOf(vault100.target)
      const vaultToken2Balance = await token2.balanceOf(vault100.target)
      expect(vaultETHBalance).to.equal(0)
      expect(vaultToken1Balance).to.equal(0)
      expect(vaultToken2Balance).to.equal(0)

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

    it("should withdraw correct proportion of native & staked tokens to 20% owner", async function () {

      // distribute 20% of tokens to new owner
      await factory.connect(user1).safeTransferFrom(user1.address, user3.address, 1, 20, '0x')
      expect(await factory.balanceOf(user3.address, 1)).to.equal(20)
      expect(await factory.balanceOf(user1.address, 1)).to.equal(80)
      // Deploy mock ERC20 tokens for testing
      const MockToken = await ethers.getContractFactory("MockToken")
      const token1 = await MockToken.connect(user2).deploy("Mock Token 1", "MOCK1")
      await token1.waitForDeployment()
      const token2 = await MockToken.connect(user2).deploy("Mock Token 2", "MOCK2")
      await token2.waitForDeployment()

      // Transfer enough tokens to reach the target amount
      const tokenAmount = ethers.parseUnits("33", 18)
      await token1.connect(user2).transfer(vault100.target, tokenAmount)
      await token2.connect(user2).transfer(vault100.target, tokenAmount)

      // send the remaining required ETH:
      const ethToSend = ethers.parseUnits("34", 18)
      await user2.sendTransaction({
        to: vault100.target,
        value: ethToSend,
      })

      // Check vault balance is as expected
      const vaultETHBalance_beforePayout = await ethers.provider.getBalance(vault100.target)
      const vaultToken1Balance_beforePayout = await token1.balanceOf(vault100.target)
      const vaultToken2Balance_beforePayout = await token2.balanceOf(vault100.target)
      expect(vaultETHBalance_beforePayout).to.equal(ethers.parseUnits("34", 18))
      expect(vaultToken1Balance_beforePayout).to.equal(ethers.parseUnits("33", 18))
      expect(vaultToken2Balance_beforePayout).to.equal(ethers.parseUnits("33", 18))

      // Approve our mock tokens:
      await treasury.addNativeStakedToken(token1.target)
      await treasury.addNativeStakedToken(token2.target)

      // setStateUnlocked should be unlocked
      expect(await vault100.state()).to.equal(0, 'vault state should == 0 (locked)')

      await vault100.setStateUnlocked()

      expect(await vault100.state()).to.equal(1, 'vault state should == 1 (unlocked)')

      // get holders balance before payout
      const nftHolderETHBalance_beforePayout = await ethers.provider.getBalance(user3.address)
      const nftHolderToken1Balance_beforePayout = await token1.balanceOf(user3.address)
      const nftHolderToken2Balance_beforePayout = await token2.balanceOf(user3.address)

      //console.log('nftHolderETHBalance_beforePayout', nftHolderETHBalance_beforePayout)
      //console.log('nftHolderToken1Balance_beforePayout', nftHolderToken1Balance_beforePayout)
      //console.log('nftHolderToken2Balance_beforePayout', nftHolderToken2Balance_beforePayout)

      // Payout to a 20% holder
      const tx = await factory.connect(user3).payout(1)

      // set expected value of 20% of vault balances:
      const oneFifthOfVaultETHBalance = ethers.BigNumber.from(ethToSend.mul(2).div(10))
      const oneFifthOfVaultToken1Balance = ethers.BigNumber.from(tokenAmount.mul(2).div(10))
      const oneFifthOfVaultToken2Balance = ethers.BigNumber.from(tokenAmount.mul(2).div(10))

      // Vault should be left with 80% of ETH & Supported tokens
      const vaultETHBalance_afterPayout = await ethers.provider.getBalance(vault100.target)
      const vaultToken1Balance_afterPayout = await token1.balanceOf(vault100.target)
      const vaultToken2Balance_afterPayout = await token2.balanceOf(vault100.target)
      expect(vaultETHBalance_afterPayout).to.equal(vaultETHBalance_beforePayout.sub(oneFifthOfVaultETHBalance))
      expect(vaultToken1Balance_afterPayout).to.equal(vaultToken1Balance_beforePayout.sub(oneFifthOfVaultToken1Balance))
      expect(vaultToken2Balance_afterPayout).to.equal(vaultToken2Balance_beforePayout.sub(oneFifthOfVaultToken2Balance))

      // get gas used
      const txReceipt = await ethers.provider.getTransactionReceipt(tx.hash)
      const gasCost = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice)

      // holder should receive 20% of the vault's ETH, minus break fee and gas:
      const nftHolderETHBalance_afterPayout = await ethers.provider.getBalance(user3.address)
      const payoutFee = oneFifthOfVaultETHBalance.mul(400).div(10000) // 400 basis points
      const tokenPayoutFee = oneFifthOfVaultToken1Balance.mul(400).div(10000) // 400 basis points

      // expected balance change == (vaultETHbalance_before * 0.2) - payout fee - gas cost

      const expectedBalanceChange = oneFifthOfVaultETHBalance.sub(payoutFee).sub(gasCost)

      expect(nftHolderETHBalance_afterPayout).to.equal(nftHolderETHBalance_beforePayout.add(expectedBalanceChange))

      // holder should receive 20% of vault's token1 and token2 balances:
      const nftHolderToken1Balance_afterPayout = await token1.balanceOf(user3.address)
      const nftHolderToken2Balance_afterPayout = await token2.balanceOf(user3.address)
      //console.log('ownerToken1BalanceAfterPayout', ownerToken1BalanceAfterPayout)
      //console.log('ownerToken2BalanceAfterPayout', ownerToken2BalanceAfterPayout)
      expect(nftHolderToken1Balance_afterPayout).to.equal(nftHolderToken1Balance_beforePayout.add(oneFifthOfVaultToken1Balance).sub(tokenPayoutFee))
      expect(nftHolderToken2Balance_afterPayout).to.equal(nftHolderToken2Balance_beforePayout.add(oneFifthOfVaultToken2Balance).sub(tokenPayoutFee))
    })

    it("should send correct fee amounts when withdrawing mix of native & supported tokens for 20% owner", async function () {

      // distribute 20% of tokens to new owner
      await factory.connect(user1).safeTransferFrom(user1.address, user3.address, 1, 20, '0x')
      expect(await factory.balanceOf(user3.address, 1)).to.equal(20)

      // Deploy mock ERC20 tokens for testing
      const MockToken = await ethers.getContractFactory("MockToken")
      const token1 = await MockToken.connect(user2).deploy("Mock Token 1", "MOCK1")
      await token1.waitForDeployment()
      const token2 = await MockToken.connect(user2).deploy("Mock Token 2", "MOCK2")
      await token2.waitForDeployment()

      // Transfer enough tokens to reach the target amount
      const tokenAmount = ethers.parseUnits("33", 18)
      await token1.connect(user2).transfer(vault100.target, tokenAmount)
      await token2.connect(user2).transfer(vault100.target, tokenAmount)

      // send the remaining required ETH:
      const ethToSend = ethers.parseUnits("34", 18)
      await user2.sendTransaction({
        to: vault100.target,
        value: ethToSend,
      })

      // Check vault balance is as expected
      const vaultETHBalance_beforePayout = await ethers.provider.getBalance(vault100.target)
      const vaultToken1Balance_beforePayout = await token1.balanceOf(vault100.target)
      const vaultToken2Balance_beforePayout = await token2.balanceOf(vault100.target)
      expect(vaultETHBalance_beforePayout).to.equal(ethToSend)
      expect(vaultToken1Balance_beforePayout).to.equal(tokenAmount)
      expect(vaultToken2Balance_beforePayout).to.equal(tokenAmount)

      // Approve our mock tokens:
      await treasury.addNativeStakedToken(token1.target)
      await treasury.addNativeStakedToken(token2.target)

      // unlock the vault
      await vault100.setStateUnlocked()

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

      // set expected value of 20% of vault balances:
      const oneFifthOfVaultETHBalance = ethers.BigNumber.from(ethToSend.mul(2).div(10))
      const oneFifthOfVaultToken1Balance = ethers.BigNumber.from(tokenAmount.mul(2).div(10))
      const oneFifthOfVaultToken2Balance = ethers.BigNumber.from(tokenAmount.mul(2).div(10))

      // Vault should be left with 80% of ETH & Supported tokens
      const vaultETHBalance_afterPayout = await ethers.provider.getBalance(vault100.target)
      const vaultToken1Balance_afterPayout = await token1.balanceOf(vault100.target)
      const vaultToken2Balance_afterPayout = await token2.balanceOf(vault100.target)
      expect(vaultETHBalance_afterPayout).to.equal(vaultETHBalance_beforePayout.sub(oneFifthOfVaultETHBalance))
      expect(vaultToken1Balance_afterPayout).to.equal(vaultToken1Balance_beforePayout.sub(oneFifthOfVaultToken1Balance))
      expect(vaultToken2Balance_afterPayout).to.equal(vaultToken2Balance_beforePayout.sub(oneFifthOfVaultToken2Balance))

      // get gas used
      const txReceipt = await ethers.provider.getTransactionReceipt(tx.hash)
      const gasCost = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice)

      // holder should receive 20% of the vault's ETH, minus break fee and gas:
      const nftHolderETHBalance_afterPayout = await ethers.provider.getBalance(user3.address)
      const payoutFee = oneFifthOfVaultETHBalance.mul(400).div(10000) // 400 basis points
      const tokenPayoutFee = oneFifthOfVaultToken1Balance.mul(400).div(10000) // 400 basis points

      // expected balance change == (vaultETHbalance_before * 0.2) - payout fee - gas cost
      const expectedBalanceChange = oneFifthOfVaultETHBalance.sub(payoutFee).sub(gasCost)

      expect(nftHolderETHBalance_afterPayout).to.equal(nftHolderETHBalance_beforePayout.add(expectedBalanceChange))

      // holder should receive 20% of vault's token1 and token2 balances:
      const nftHolderToken1Balance_afterPayout = await token1.balanceOf(user3.address)
      const nftHolderToken2Balance_afterPayout = await token2.balanceOf(user3.address)
      expect(nftHolderToken1Balance_afterPayout).to.equal(nftHolderToken1Balance_beforePayout.add(oneFifthOfVaultToken1Balance).sub(tokenPayoutFee))
      expect(nftHolderToken2Balance_afterPayout).to.equal(nftHolderToken2Balance_beforePayout.add(oneFifthOfVaultToken2Balance).sub(tokenPayoutFee))

      // Get fee recipient balances after payout
      const feeRecipientETHBalanceAfterPayout = await ethers.provider.getBalance(feeRecipient.address)
      const feeRecipientToken1BalanceAfterPayout = await token1.balanceOf(feeRecipient.address)
      const feeRecipientToken2BalanceAfterPayout = await token2.balanceOf(feeRecipient.address)

      // Verify expected balances and fee amounts
      expect(feeRecipientETHBalanceAfterPayout).to.equal(initialFeeRecipientETHBalance.add(payoutFee))
      expect(feeRecipientToken1BalanceAfterPayout).to.equal(initialFeeRecipientToken1Balance.add(tokenPayoutFee))
      expect(feeRecipientToken2BalanceAfterPayout).to.equal(initialFeeRecipientToken2Balance.add(tokenPayoutFee))
    })

    it("should payout token holder % of balance proportional to token holder's share of native token", async function () {
      
      const fullAmountToSend = ethers.parseEther("100")

      // send all the ETH
      await user2.sendTransaction({
        to: vault100.target,
        value: fullAmountToSend,
      })

      // Check the vault contract balance is correct
      let vaultBalance = await ethers.provider.getBalance(vault100.target)
      expect(vaultBalance).to.equal(ethers.parseEther("100"))

      // distribute the token
      await factory.connect(user1).safeTransferFrom(user1.address, user3.address, 1, 25, "0x")
      expect(await factory.balanceOf(user1.address, 1)).to.equal(75)
      expect(await factory.balanceOf(user3.address, 1)).to.equal(25)

      // HOLDER 1
      const holder1BalanceBeforePayout = await ethers.provider.getBalance(user1.address)

      // should payout 75% of the vaults to holder 1, leaving 25% of tokens with holder 2
      let tx = await factory.connect(user1).payout(1)
      expect(await factory.totalSupplyOf(1)).to.equal(25)

      // get gas used
      let txReceipt = await ethers.provider.getTransactionReceipt(tx.hash)
      let gasCost = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice)

      //holder should receive 75% of vaults minus break fee and gas:
      const holder1BalanceAfterPayout = await ethers.provider.getBalance(user1.address)
      let payoutFee = ethers.parseEther("75").mul(400).div(10000) // 400 basis points
      let expectedBalanceChange = ethers.parseEther("75").sub(payoutFee).sub(gasCost)

      expect(holder1BalanceAfterPayout).to.equal(holder1BalanceBeforePayout.add(expectedBalanceChange))

      // HOLDER 2:
      const holder2BalanceBeforePayout = await ethers.provider.getBalance(user3.address)

      // should payout remaining 25% of the vaults to holder 2, leaving 0 tokens
      tx = await factory.connect(user3).payout(1)
      expect(await factory.totalSupplyOf(1)).to.equal(0)

      // get gas used
      txReceipt = await ethers.provider.getTransactionReceipt(tx.hash)
      gasCost = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice)
      
      //console.log('gasCost:', gasCost)

      //holder should receive all vaults minus break fee and gas:
      const holder2BalanceAfterPayout = await ethers.provider.getBalance(user3.address)
      payoutFee = ethers.parseEther("25").mul(400).div(10000) // 400 basis points
      expectedBalanceChange = ethers.parseEther("25").sub(payoutFee).sub(gasCost)

      expect(holder2BalanceAfterPayout).to.equal(holder2BalanceBeforePayout.add(expectedBalanceChange))
    })

    it("should payout token holder % of balance proportional to token holder's share of staked token", async function () {
      
      // get the tokenId so we can call payout on it
      const attributes = await vault100.attributes()

      // Deploy mock ERC20 tokens for testing
      const MockToken = await ethers.getContractFactory("MockToken")
      const token1 = await MockToken.connect(user2).deploy("Mock Token 1", "MOCK1")
      await token1.waitForDeployment()
      const token2 = await MockToken.connect(user2).deploy("Mock Token 2", "MOCK2")
      await token2.waitForDeployment()

      // Approve our mock tokens
      await treasury.addNativeStakedToken(token1.target)
      await treasury.addNativeStakedToken(token2.target)

      const tokenAmount = ethers.parseUnits("100", 18)

      // send all the ETH
      await user2.sendTransaction({
        to: vault100.target,
        value: tokenAmount,
      })

      // Transfer some staked tokens to the vault
      await token1.connect(user2).transfer(vault100.target, tokenAmount)
      await token2.connect(user2).transfer(vault100.target, tokenAmount)

      // Check the vault contract balance is correct
      let vaultBalance = await ethers.provider.getBalance(vault100.target)
      expect(vaultBalance).to.equal(tokenAmount)
      const vaultToken1Balance = await token1.balanceOf(vault100.target)
      const vaultToken2Balance = await token2.balanceOf(vault100.target)
      expect(vaultToken1Balance).to.equal(tokenAmount)
      expect(vaultToken2Balance).to.equal(tokenAmount)

      // distribute the vault token
      await factory.connect(user1).safeTransferFrom(user1.address, user3.address, 1, 25, "0x")
      expect(await factory.balanceOf(user1.address, attributes.tokenId)).to.equal(75)
      expect(await factory.balanceOf(user3.address, attributes.tokenId)).to.equal(25)

      // HOLDER 1
      const holder1_ETHBalance_beforePayout = await ethers.provider.getBalance(user1.address)
      const holder1_token1Balance_beforePayout = await token1.balanceOf(user1.address)
      const holder1_token2Balance_beforePayout = await token2.balanceOf(user1.address)

      // should payout 75% of the staked tokens to holder 1, leaving 25% of tokens with holder 2
      let tx = await factory.connect(user1).payout(attributes.tokenId)
      expect(await factory.totalSupplyOf(attributes.tokenId)).to.equal(25)

      // get gas used
      let txReceipt = await ethers.provider.getTransactionReceipt(tx.hash)
      let gasCost = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice)

      //holder should receive 75% of native ETH, plus native staked tokens in vault, minus break fee and ETH gas:
      const holder1ETHBalanceAfterPayout = await ethers.provider.getBalance(user1.address)
      const holder1_token1Balance_afterPayout = await token1.balanceOf(user1.address)
      const holder1_token2Balance_afterPayout = await token2.balanceOf(user1.address)
      let payoutFee = ethers.parseEther("75").mul(400).div(10000) // 400 basis points
      let expectedTokenBalanceChange = ethers.parseEther("75").sub(payoutFee)

      expect(holder1ETHBalanceAfterPayout).to.equal(holder1_ETHBalance_beforePayout.add(
        ethers.parseEther("75")).sub(gasCost).sub(payoutFee))
      expect(holder1_token1Balance_afterPayout).to.equal(holder1_token1Balance_beforePayout.add(expectedTokenBalanceChange))
      expect(holder1_token2Balance_afterPayout).to.equal(holder1_token2Balance_beforePayout.add(expectedTokenBalanceChange))

      // HOLDER 2:
      const holder2_ETHBalance_beforePayout = await ethers.provider.getBalance(user3.address)
      const holder2_token1Balance_beforePayout = await token1.balanceOf(user3.address)
      const holder2_token2Balance_beforePayout = await token2.balanceOf(user3.address)

      // should payout remaining 25% of the vaults to holder 2, leaving 0 tokens
      tx = await factory.connect(user3).payout(attributes.tokenId)
      expect(await factory.totalSupplyOf(attributes.tokenId)).to.equal(0)

      // get gas used
      txReceipt = await ethers.provider.getTransactionReceipt(tx.hash)
      gasCost = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice)
      
      //holder is the last, so should receive all vault's native & staked tokens minus break fee and gas:
      const holder2ETHBalanceAfterPayout = await ethers.provider.getBalance(user3.address)
      const holder2_token1Balance_afterPayout = await token1.balanceOf(user3.address)
      const holder2_token2Balance_afterPayout = await token2.balanceOf(user3.address)
      payoutFee = ethers.parseEther("25").mul(400).div(10000) // 400 basis points
      expectedTokenBalanceChange = ethers.parseEther("25").sub(payoutFee)

      expect(holder2ETHBalanceAfterPayout).to.equal(holder2_ETHBalance_beforePayout.add(
        ethers.parseEther("25")).sub(gasCost).sub(payoutFee))
      expect(holder2_token1Balance_afterPayout).to.equal(holder2_token1Balance_beforePayout.add(expectedTokenBalanceChange))
      expect(holder2_token2Balance_afterPayout).to.equal(holder2_token2Balance_beforePayout.add(expectedTokenBalanceChange))
    })

    it("should payout token holder % of balance proportional to token holder's share of base token", async function () {

      // Deploy mock ERC20 tokens for testing
      const MockToken = await ethers.getContractFactory("MockToken")
      const baseToken = await MockToken.connect(user2).deploy("Mock Token 1", "MOCK1")
      await baseToken.waitForDeployment()

      // make new vault using token1 as base currency
      vault = await makeLockedVault(factory, INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1, baseToken.target)

      // get the tokenId so we can call payout on it
      const attributes = await vault.attributes()

      // Approve our base token ?
      await treasury.addSupportedToken(baseToken.target)

      const tokenAmount = ethers.parseUnits("100", 18)

      // Transfer base token to the vault
      await baseToken.connect(user2).transfer(vault.target, tokenAmount)

      // unlock the vault
      let tx = await vault.setStateUnlocked()
      expect(await vault.state()).to.equal(1)

      // Check the vault contract balance is correct
      const vault_baseTokenBalance = await baseToken.balanceOf(vault.target)
      expect(vault_baseTokenBalance).to.equal(tokenAmount)

      // distribute the vault token
      await factory.connect(user1).safeTransferFrom(user1.address, user3.address, attributes.tokenId, 25, "0x")
      expect(await factory.balanceOf(user1.address, attributes.tokenId)).to.equal(75)
      expect(await factory.balanceOf(user3.address, attributes.tokenId)).to.equal(25)

      // HOLDER 1
      const holder1_ETHBalance_beforePayout = await ethers.provider.getBalance(user1.address)
      const holder1_baseTokenBalance_beforePayout = await baseToken.balanceOf(user1.address)

      // should payout 75% of the vault token to holder 1, leaving 25% with holder 2
      tx = await factory.connect(user1).payout(attributes.tokenId)
      expect(await factory.totalSupplyOf(attributes.tokenId)).to.equal(25)

      // get gas used
      let txReceipt = await ethers.provider.getTransactionReceipt(tx.hash)
      let gasCost = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice)

      //holder should have received 75% of the base tokens in vault, minus break fee and ETH gas:
      const holder1ETHBalanceAfterPayout = await ethers.provider.getBalance(user1.address)
      const holder1_baseTokenBalance_afterPayout = await baseToken.balanceOf(user1.address)
      let payoutFee = ethers.parseEther("75").mul(400).div(10000) // 400 basis points
      let expectedTokenBalanceChange = ethers.parseEther("75").sub(payoutFee)

      expect(holder1ETHBalanceAfterPayout).to.equal(holder1_ETHBalance_beforePayout.sub(gasCost))
      expect(holder1_baseTokenBalance_afterPayout).to.equal(holder1_baseTokenBalance_beforePayout.add(expectedTokenBalanceChange))

      // HOLDER 2:
      const holder2_ETHBalance_beforePayout = await ethers.provider.getBalance(user3.address)
      const holder2_baseTokenBalance_beforePayout = await baseToken.balanceOf(user3.address)

      // should payout remaining 25% of the vault tokens to holder 2, leaving 0 tokens
      tx = await factory.connect(user3).payout(attributes.tokenId)
      expect(await factory.totalSupplyOf(attributes.tokenId)).to.equal(0)

      // get gas used
      txReceipt = await ethers.provider.getTransactionReceipt(tx.hash)
      gasCost = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice)
      
      //holder is the last, so should receive all vault's base token balance minus break fee and gas:
      const holder2ETHBalanceAfterPayout = await ethers.provider.getBalance(user3.address)
      const holder2_baseTokenBalance_afterPayout = await baseToken.balanceOf(user3.address)
      payoutFee = ethers.parseEther("25").mul(400).div(10000) // 400 basis points
      expectedTokenBalanceChange = ethers.parseEther("25").sub(payoutFee)

      expect(holder2ETHBalanceAfterPayout).to.equal(holder2_ETHBalance_beforePayout.sub(gasCost))
      expect(holder2_baseTokenBalance_afterPayout).to.equal(holder2_baseTokenBalance_beforePayout.add(expectedTokenBalanceChange))
    })
  })

  describe("Send to Treasury", function () {
    let factory, treasury
    let lockedVault, unlockedVault, openVault
    let user1, user2, feeRecipient
    let token1, token2, token3

    before(async function () {
      [user1, user2, feeRecipient] = await ethers.getSigners()
    })

    beforeEach(async function () {
      const deployedContracts = await deploy(feeRecipient.address, 'SepoliaETH', 'https://zebra.xyz/')
      factory = deployedContracts.factory
      treasury = deployedContracts.treasury
      lockedVault = await makeLockedVault(factory, user1, user1)
      unlockedVault = await makeUnlockedVault(factory, user1, user1)
      openVault = await makeOpenVault(factory, user1, user1)
      
      const treasurerRole = treasury.TREASURER_ROLE()
      await treasury.grantRole(treasurerRole, user1.address)

      // Deploy mock ERC20 tokens for testing
      const MockToken = await ethers.getContractFactory("MockToken")
      token1 = await MockToken.deploy("Mock Token 1", "MOCK1")
      await token1.waitForDeployment()
      token2 = await MockToken.deploy("Mock Token 2", "MOCK2")
      await token2.waitForDeployment()
      token3 = await MockToken.deploy("Mock Token 3", "MOCK3")
      await token3.waitForDeployment()

      // Approve our mock tokens:
      await treasury.addNativeStakedToken(token1.target)
      await treasury.addSupportedToken(token2.target)
      await treasury.addSupportedToken(token3.target)
    })

    it("should send open vault assets to the treasury", async function () {

      // Transfer tokens
      let tokenAmount = ethers.parseUnits("100", 18)
      await token1.transfer(lockedVault.target, tokenAmount)
      await token2.transfer(unlockedVault.target, tokenAmount)
      await token3.transfer(openVault.target, tokenAmount)

      // send some ETH to the open vault:
      await user2.sendTransaction({
        to: openVault.target,
        value: tokenAmount,
      })

      // verify that the locked vault is in the Locked state
      expect(await lockedVault.state()).to.equal(0)
      // verify that the unlocked vault is in the Unlocked state
      expect(await unlockedVault.state()).to.equal(1)
      // verify that the open vault is in the Open state
      expect(await openVault.state()).to.equal(2)
      expect(await treasury.isOpenVault(openVault.target)).to.be.true

      // Get the initial treasury balances of native and supported tokens
      const initial_treasury_EthBalance = await ethers.provider.getBalance(treasury.target)
      const initial_treasury_Token1Balance = await token1.balanceOf(treasury.target)
      const initial_treasury_Token2Balance = await token2.balanceOf(treasury.target)
      const initial_treasury_Token3Balance = await token3.balanceOf(treasury.target)

      // call collect on the treasury which should pull balance from the Open Vault only
      tx = await treasury.connect(user1).collect()
      const txReceipt = await tx.wait()

      // Get the updated balances after collecting from the Open Vault
      const updated_treasury_EthBalance = await ethers.provider.getBalance(treasury.target)
      const updated_treasury_Token1Balance = await token1.balanceOf(treasury.target)
      const updated_treasury_Token2Balance = await token2.balanceOf(treasury.target)
      const updated_treasury_Token3Balance = await token3.balanceOf(treasury.target)

      // Verify that balances have changed as expected
      expect(updated_treasury_EthBalance).to.equal(initial_treasury_EthBalance.add(tokenAmount),
       'ETH balance from open vault should now be in treasury')
      expect(updated_treasury_Token1Balance).to.equal(initial_treasury_Token1Balance,
       'token 1 is in locked vault - treasury balance should be zero')
      expect(updated_treasury_Token2Balance).to.equal(initial_treasury_Token2Balance,
       'token 2 is in unlocked vault - treasury balance should be zero')
      expect(updated_treasury_Token3Balance).to.equal(initial_treasury_Token3Balance.add(tokenAmount),
       'token 3 was in open vault - now in treasury balance')

      // Retrieve events emitted by the openVault contract
      const sendNativeTokenEvent = (await openVault.queryFilter("SendNativeTokenToTreasury"))[0]
      const sendSupportedTokenEvents = (await openVault.queryFilter("SendToken"))

      // Verify the SendNativeTokenToTreasury event
      expect(sendNativeTokenEvent).to.exist
      expect(sendNativeTokenEvent.args.treasuryAddress).to.equal(treasury.target, 'Native token event: treasury address should be correct')
      expect(sendNativeTokenEvent.args.amount).to.equal(tokenAmount, 'Native token event: native token amount should be correct')

      // Verify the SendSupportedTokenToTreasury event
      expect(sendSupportedTokenEvents[0]).to.exist

      expect(sendSupportedTokenEvents[0].args.tokenAddress).to.equal(token3.target, 'token3: address should be correct')
      expect(sendSupportedTokenEvents[0].args.recipientAddress).to.equal(treasury.target, 'token3: recipientAddress should be correct')
      expect(sendSupportedTokenEvents[0].args.amount).to.equal(tokenAmount, 'amount should be correct')
    })
  })
})