// We import Chai to use its asserting functions here.
const { expect, assert } = require("chai")
const { ethers, upgrades, network } = require("hardhat")
const helpers = require("@nomicfoundation/hardhat-network-helpers")
const { deploy, deployVaultImplementation, deployGenerator, deployTreasury, getTypedData, getRevertReason, getCurrentBlockTime, deployMockToken, generateMintRequest, makeVault, makeVault_100edition_target100_noUnlockTime } = require("./test_helpers")
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000'

describe(" -- Testing Factory Contract -- ", function () {
  describe("Minting & Vault Creation", function () {

    let factory
    let INITIAL_DEFAULT_ADMIN_AND_SIGNER, NEW_SIGNER
    let FAKE_FUND_IMPL, FAKE_GENERATOR, FAKE_TREASURY
    let user1, user2
    let feeRecipient, newFeeRecipient

    before(async function () {
      [INITIAL_DEFAULT_ADMIN_AND_SIGNER, NEW_SIGNER, FAKE_FUND_IMPL, FAKE_GENERATOR, FAKE_TREASURY, user1, user2, feeRecipient, newFeeRecipient] = await ethers.getSigners()
    })

    beforeEach(async function () {
      const deployedContracts = await deploy(feeRecipient.address, 'SepoliaETH', 'https://zebra.xyz/')
      factory = deployedContracts.factory
    })

    /*
      1. calls factory mintWithSignature()
      2. checks that user received the minted tokens
      3. checks that TokensMintedWithSignature' event was fired with correct args
      4. checks that VaultDeployed event was fired with correct args
    */
    it("should successfully mint new tokens and initalise vaults", async function () {
      const makeVaultFee = ethers.parseUnits("0.004", "ether")
      const mr = await generateMintRequest(factory.target, INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1.address)
      const initialBalanceUser1 = await factory.balanceOf(user1.address, 0)

      const tx = await factory.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).mintWithSignature(mr.typedData.message, mr.signature, { value: makeVaultFee })

      // Verify that the token was minted and assigned to the correct recipient
      const finalBalanceUser1 = await factory.balanceOf(user1.address, 0)
      expect(finalBalanceUser1).to.equal(initialBalanceUser1+BigInt(4))

      // Verify events in the Factory contract
      const tokensMintedEvent = await factory.queryFilter('TokensMintedWithSignature', -1)
      expect(tokensMintedEvent.length).to.equal(1)
      expect(tokensMintedEvent[0].args.signer).to.equal(INITIAL_DEFAULT_ADMIN_AND_SIGNER.address)
      expect(tokensMintedEvent[0].args.mintedTo).to.equal(user1.address)
      expect(tokensMintedEvent[0].args.tokenIdMinted).to.equal(0)

      const vaultDeployedEvent = await factory.queryFilter('VaultDeployed', -1)
      expect(vaultDeployedEvent.length).to.equal(1)
      expect(vaultDeployedEvent[0].args.msgSender).to.equal(INITIAL_DEFAULT_ADMIN_AND_SIGNER.address)

      // Retrieve the vault address from the VaultDeployed event
      const vaultAddress = vaultDeployedEvent[0].args.vault
    })

    it("should not allow a signature to be used before the start time", async function() {
      // Generate a signature for the mint request
      const timestamp = await ethers.provider.getBlockNumber().then(blockNumber =>
      // getBlock returns a block object and it has a timestamp property.
      ethers.provider.getBlock(blockNumber).then(block => block.timestamp))
      const startTime = Math.floor(timestamp + 60 * 60 * 24 * 2) // + 2 days - should FAIL
      const endTime = Math.floor(timestamp + 60 * 60 * 24 * 7) // + 7 days
      const unlockTime = Math.floor(timestamp + 60 * 60 * 24 * 99)
      const targetBalance = ethers.parseUnits("1", "ether").toString()

      const typedData = await getTypedData(
        factory.target,
        ZERO_ADDRESS,
        user1.address,
        startTime,
        endTime,
        4,
        unlockTime,
        targetBalance,
        'A test vault',
        'invalid start time'    
      )

      const mr = await generateMintRequest(
        factory.target,
        INITIAL_DEFAULT_ADMIN_AND_SIGNER,
        user1.address,
        typedData
      )

      const makeVaultFee = ethers.parseUnits("0.004", "ether")

      await expect(factory.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).mintWithSignature(
        mr.typedData.message,
        mr.signature,
        { value: makeVaultFee })
      ).to.be.revertedWith("Request expired")
    })

    it("should not allow a signature to be used after the expiry time", async function() {
      const timestamp = await ethers.provider.getBlockNumber().then(blockNumber =>
      // getBlock returns a block object and it has a timestamp property.
      ethers.provider.getBlock(blockNumber).then(block => block.timestamp))
      const startTime = Math.floor(timestamp - 60 * 60 * 24 * 7) // a week ago
      const endTime = Math.floor(timestamp - 60 * 60 * 24 * 3) // 3 days ago
      const unlockTime = Math.floor(timestamp + 60 * 60 * 24 * 99)
      const targetBalance = ethers.parseUnits("1", "ether").toString()

      const typedData = await getTypedData(
        factory.target,
        user1.address,
        ZERO_ADDRESS,
        startTime,
        endTime,
        4,
        unlockTime,
        targetBalance,
        'A test vault',
        'invalid end time'    
      )

      const mr = await generateMintRequest(
        factory.target,
        INITIAL_DEFAULT_ADMIN_AND_SIGNER,
        user1.address,
        typedData
      )

      const makeVaultFee = ethers.parseUnits("0.004", "ether")

      await expect(factory.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).mintWithSignature(
        mr.typedData.message,
        mr.signature,
        { value: makeVaultFee })
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
        factory.target,
        user1.address,
        ZERO_ADDRESS,
        startTime,
        endTime,
        4,
        unlockTime,
        targetBalance,
        'A test vault',
        'invalid unlock time with targetBalance zero'    
      )

      const mr = await generateMintRequest(
        factory.target,
        INITIAL_DEFAULT_ADMIN_AND_SIGNER,
        user1.address,
        typedData
      )

      const makeVaultFee = ethers.parseUnits("0.004", "ether")
      await expect(factory.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).mintWithSignature(
        mr.typedData.message,
        mr.signature,
        { value: makeVaultFee })
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
      const targetBalance = ethers.parseUnits("1", "ether").toString()

      const typedData = await getTypedData(
        factory.target,
        user1.address,
        ZERO_ADDRESS,
        startTime,
        endTime,
        0,
        unlockTime,
        targetBalance,
        'A test vault',
        'invalid start time'    
      )

      const mr = await generateMintRequest(
        factory.target,
        INITIAL_DEFAULT_ADMIN_AND_SIGNER,
        user1.address,
        typedData
      )

      const makeVaultFee = ethers.parseUnits("0.004", "ether")
      await expect(factory.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).mintWithSignature(
        mr.typedData.message,
        mr.signature,
        { value: makeVaultFee })
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
      const deployedContracts = await deploy(feeRecipient.address, 'SepoliaETH', 'https://zebra.xyz/')
      factory = deployedContracts.factory
      treasury = deployedContracts.treasury
    })

    it("should set the make vault fee and emit the MakeVaultFeeUpdated event", async function () {
      const newMakeVaultFee = ethers.parseUnits("0.005", "ether")
      const receipt = await factory.connect(owner).setMakeVaultFee(newMakeVaultFee)

      const events = await factory.queryFilter("MakeVaultFeeUpdated", -1)
      expect(events.length).to.equal(1)

      const event = events[0]
      expect(event.args.fee).to.equal(newMakeVaultFee)
    })

    it("should set the break vault fee basis points and emit the BreakVaultBpsUpdated event", async function () {
      const newBreakVaultBps = 500 // 5% represented in basis points
      const receipt = await factory.connect(owner).setBreakVaultBps(newBreakVaultBps)

      const events = await factory.queryFilter("BreakVaultBpsUpdated", -1)
      expect(events.length).to.equal(1)

      const event = events[0]
      expect(event.args.bps).to.equal(newBreakVaultBps)
    })

    it("should set the fee recipient and emit the FeeRecipientUpdated event", async function () {
      const newFeeRecipient = await ethers.Wallet.createRandom().address
      const receipt = await factory.connect(owner).setFeeRecipient(newFeeRecipient)

      const events = await factory.queryFilter("FeeRecipientUpdated", -1)
      expect(events.length).to.equal(1)

      const event = events[0]
      expect(event.args.recipient).to.equal(newFeeRecipient)
    })

    it("should set the Vault implementation address and emit the VaultImplementationUpdated event", async function () {
      const newVaultImplementation = await deployVaultImplementation(factory.target, treasury.target)
      const receipt = await factory.connect(owner).setVaultImplementation(newVaultImplementation.target)

      const events = await factory.queryFilter("VaultImplementationUpdated", -1)
      expect(events.length).to.equal(1)

      const event = events[0]
      expect(event.args.implementation).to.equal(newVaultImplementation.target)
    })

    it("should set the Generator address and emit the GeneratorUpdated event", async function () {
      const newGenerator = await deployGenerator('Generator', 'SepoliaETH', 'https://zebra.xyz/', factory.target)
      const receipt = await factory.connect(owner).setGenerator(newGenerator.target)

      const events = await factory.queryFilter("GeneratorUpdated", -1)
      expect(events.length).to.equal(1)

      const event = events[0]
      expect(event.args.generator).to.equal(newGenerator.target)
    })

    it("should set the Treasury address and emit the TreasuryUpdated event", async function () {
      const newTreasury = await deployTreasury(factory.target)
      const receipt = await factory.connect(owner).setTreasury(newTreasury.target)

      const events = await factory.queryFilter("TreasuryUpdated", -1)
      expect(events.length).to.equal(1)

      const event = events[0]
      expect(event.args.treasury).to.equal(newTreasury.target)
    })
  })

  describe("Payout & Burn", function () {

    let factory, vault
    let INITIAL_DEFAULT_ADMIN_AND_SIGNER
    let user1, user2
    let feeRecipient

    before(async function () {
      [INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1, user2, feeRecipient] = await ethers.getSigners()
    })

    beforeEach(async function () {
      const deployedContracts = await deploy(feeRecipient.address, 'SepoliaETH', 'https://zebra.xyz/')
      factory = deployedContracts.factory
      treasury = deployedContracts.treasury
      vault = await makeVault(factory, INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1)
    })

    /*
      1. check that user has a balance
      2. send enough vaults to unlock
      3. execute payout
      4. check that tokens have been burned
      5. check that payout event was fired
    */
    it("Payout should succeed when token exists and user has balance, tokens should then be burned", async function () {

      // Verify that the token was minted and assigned to the correct recipient
      const intialBalanceUser1 = await factory.balanceOf(user1.address, 0)
      expect(intialBalanceUser1).to.equal(4)

      //send enough ETH
      const amountToSend = ethers.parseEther("1")
      let receiveTx = await user2.sendTransaction({
        to: vault.target,
        value: amountToSend,
      })

      // Increase block time to after the unlockTime
      await helpers.time.increase(60 * 60 * 24 * 100) // 100 days

      // Call setTargetReached()
      const targetReachedTx = await vault.setStateUnlocked()

      // Call the payout function
      const payoutTx = await factory.connect(user1).payout(0)
      await payoutTx.wait()

      // get the StateChanged event from the transaction
      events = await factory.queryFilter("Payout", -1)

      expect(events[0].args.vaultAddress).to.equal(vault.target)
      expect(events[0].args.tokenId).to.equal(0)

      // Verify that the tokens were burned
      const balanceUser1 = await factory.balanceOf(user1.address, 0)
      expect(balanceUser1).to.equal(0)
    })

    /*
      1. issue vault with 1 share, check it is marked open on first payout
      2. issue vault with 4 shares, divide between 2 users
      3. ensure vault is moved to open on last payout
    */
    it("Should call treasury.addOpenVault if it is the last payout", async function () {
      // Generate a signature for the mint request
      const timestamp = await ethers.provider.getBlockNumber().then(blockNumber =>
      // getBlock returns a block object and it has a timestamp property.
      ethers.provider.getBlock(blockNumber).then(block => block.timestamp))
      const startTime = Math.floor(timestamp - 60 * 60 * 24 * 2) // - 2 days
      const endTime = Math.floor(timestamp + 60 * 60 * 24 * 7) // + 7 days
      const unlockTime = Math.floor(timestamp - 60 * 60 * 24 * 99)
      const targetBalance = ethers.parseUnits("1", "ether").toString()

      const typedData = await getTypedData(
        factory.target,
        user2.address,
        ZERO_ADDRESS,
        startTime,
        endTime,
        1,
        unlockTime,
        targetBalance,
        'A test vault',
        '1 edition'    
      )

      const mr = await generateMintRequest(
        factory.target,
        INITIAL_DEFAULT_ADMIN_AND_SIGNER,
        user2.address,
        typedData
      )

      const makeVaultFee = ethers.parseUnits("0.004", "ether")

      const tx = await factory.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).mintWithSignature(
        mr.typedData.message,
        mr.signature,
        { value: makeVaultFee }
      )
      const txReceipt = await tx.wait()
      const vaultCreatedEvent = await factory.queryFilter(factory.filters.VaultDeployed(), txReceipt.blockNumber)
      const Vault = await ethers.getContractFactory("Vault")
      const vault1 = Vault.attach(vaultCreatedEvent[0].args[0])

      // get the tokenId so we can call payout on it
      const tokenId_vault = await vault.attributes().then(a => a.tokenId)
      const tokenId_vault1 = await vault1.attributes().then(a => a.tokenId)

      // Verify that the initial vault's tokens were minted and assigned to the correct recipient
      const balanceUser1 = await factory.balanceOf(user1.address, 0)
      expect(balanceUser1).to.equal(4)

      // Verify that the single token vault was minted and assigned to the correct recipient
      const balanceUser2 = await factory.balanceOf(user2.address, 1)
      expect(balanceUser2).to.equal(1)

      // Increase block time to after the unlockTime
      await helpers.time.increase(60 * 60 * 24 * 100) // 100 days

      //send eth to both tokens to unlock them
      //send enough ETH
      const amountToSend = ethers.parseEther("1")
      let receiveTx1 = await user2.sendTransaction({
        to: vault.target,
        value: amountToSend,
      })
      let receiveTx2 = await user2.sendTransaction({
        to: vault1.target,
        value: amountToSend,
      })

      // transfer 2 tokens from user1 to user2
      await factory.connect(user1).safeTransferFrom(user1.address, user2.address, 0, 2, "0x")
      expect(await factory.balanceOf(user1.address, 0)).to.equal(2)
      expect(await factory.balanceOf(user2.address, 0)).to.equal(2)

      // call payout on 1st vault and make sure that AddedOpenVault event NOT emitted
      tx1 = await factory.connect(user1).payout(tokenId_vault)
      const payout1Event = await treasury.queryFilter('AddedOpenVault', -1)
      expect(payout1Event).to.be.empty

      // call payout on 2nd vault and make sure that AddedOpenVault event was emitted
      tx2 = await factory.connect(user2).payout(tokenId_vault1)
      const payout2Event = await treasury.queryFilter('AddedOpenVault', -1)
      expect(payout2Event.length).to.be.gt(0)

      // call payout on 1st vault with user2, and make sure that AddedOpenVault event was emitted
      tx3 = await factory.connect(user2).payout(tokenId_vault)
      const payout3Event = await treasury.queryFilter('AddedOpenVault', -1)
      expect(payout3Event.length).to.be.gt(0)
    })

    /*
      1. execute payout on a non-existant tokenId
      2. check that function reverted with token not found
    */
    it("Payout should fail when token doesn't exist", async function () {
      // Call the payout function
      await expect(factory.connect(user1).payout(1)).to.be.revertedWith("Token not found")
    })

    /*
      1. execute payout with a non-holder
      2. check that function reverted with not authorised
    */
    it("Payout should fail when user has no balance", async function () {
      // Call the payout function
      await expect(factory.connect(user2).payout(0)).to.be.revertedWith("Not authorised!")
    })
  })

  describe("Metadata", function () {

    let factory, vault
    let INITIAL_DEFAULT_ADMIN_AND_SIGNER
    let user1, user2
    let feeRecipient

    before(async function () {
      [INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1, user2, feeRecipient] = await ethers.getSigners()
    })

    beforeEach(async function () {
      const deployedContracts = await deploy(feeRecipient.address, 'SepoliaETH', 'https://zebra.xyz/')
      factory = deployedContracts.factory
      vault = await makeVault(factory, INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1)
    })

    /*
      1. Call uri() with a valid tokenId
    */
    it("URI should not revert when called with valid tokenId", async function () {
      let metadata = await factory.uri(0)
      expect(metadata).to.exist
    })

    /*
      1. Call uri() with invalid tokenId
    */
    it("URI should revert when called with invalid tokenId", async function () {
      await expect(factory.uri(1)).to.be.revertedWith("Token not found")
    })

    /*
      1. Call uri() and verify that the percentage is 0
      2. Move blocktime to 33 days into 99 day unlocktime, ensure percentage still == 0
      3. send 0.2 ETH and ensure that percentage returned == 20
      4. send 0.2 ETH and ensure that percentage equals 33 (days)
      5. advance time another 33 days and ensure % == 40 (eth)
      4. send 0.6 ETH and ensure that percentage returned == 66 (days)
      5. advance time 44 days and ensure % == 100
    */
    it("URI should return metadata with correct percentage", async function () {

      async function getPercentage() {
        const metadata = await factory.uri(0)
        // Decode the base64 metadata
        //console.log(metadata)
        const decodedMetadata = JSON.parse(atob(metadata.split(',')[1]))
        return decodedMetadata.attributes.find(attr => attr.trait_type === "Percent Complete").value
      }

      // 1. Verify that the percentage is 0
      expect(await getPercentage()).to.equal(0, "Initial percentage should be 0")

      // 2. Move block time fwd 33 days; percent shoul still be 0 because it's the lowest progress
      await helpers.time.increase(60 * 60 * 24 * 33) // 33 days
      expect(await getPercentage()).to.equal(0, "Percentage should still be 0")

      // 3. Send 0.2 ETH and ensure that the percentage returned is 20
      await user1.sendTransaction({ to: vault.target, value: ethers.parseEther("0.2") })
      expect(await getPercentage()).to.equal(20, "Percentage should be 20 after sending 0.2 ETH")

      // 4. Send 0.2 ETH and ensure that the percentage returned is 33 (days is now lowest progress)
      await user1.sendTransaction({ to: vault.target, value: ethers.parseEther("0.2") })
      expect(await getPercentage()).to.equal(33, "Percentage should be 33 based on time to unlock")

      // 5. Move block time fwd another 33 days; percent should be 40 because ETH progress is lowest
      await helpers.time.increase(60 * 60 * 24 * 33) // 33 days
      expect(await getPercentage()).to.equal(40, "Percentage should be 40 based on ETH balance/target")

      // 6. Send 0.6 ETH and ensure that the percentage returned is 66 (days is now lowest progress)
      await user1.sendTransaction({ to: vault.target, value: ethers.parseEther("0.6") })
      expect(await getPercentage()).to.equal(66, "Percentage should be 66 based on time to unlock")

      // 5. Move block time fwd another 44 days; percent should now be 100 because ETH and time == 100
      await helpers.time.increase(60 * 60 * 24 * 44) // 33 days
      expect(await getPercentage()).to.equal(100, "Percentage should be 100")
    }) 
  })

  describe("Transactions", function () {
    let owner, feeRecipient
    let factory, treasury

    before(async function () {
      [owner, feeRecipient] = await ethers.getSigners()
    })

    beforeEach(async function () {
      const deployedContracts = await deploy(feeRecipient.address, 'SepoliaETH', 'https://zebra.xyz/')
      factory = deployedContracts.factory
      treasury = deployedContracts.treasury
    })

    it("should fail when sending native tokens to the factory", async function () {
      // Define the amount of ETH you want to send (in wei)
      const amountToSend = ethers.parseEther("1.2345")

      await expect(owner.sendTransaction({
        to: factory,
        value: amountToSend,
      })).to.be.reverted
    })

    it("should fail when sending non-native tokens to the factory contract", async function () {
      const vaultAddress = await makeVault(factory, owner, owner)
      await expect(factory.connect(owner).safeTransferFrom(owner.address, vaultAddress, 0, 2, "0x")).to.be.reverted
    })

    it("should transfer a quantity of NTFs from one holder to another", async function () {
      const vaultAddress = await makeVault(factory, owner, owner)
      await factory.connect(owner).safeTransferFrom(owner.address, feeRecipient.address, 0, 2, "0x")
      expect(await factory.balanceOf(feeRecipient.address, 0)).to.equal(2)
    })
  })

  describe("Querying", function() {

    let factory
    let INITIAL_DEFAULT_ADMIN_AND_SIGNER
    let user1, user2
    let feeRecipient

    before(async function () {
      [INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1, user2, feeRecipient] = await ethers.getSigners()
    })

    beforeEach(async function () {
      const deployedContracts = await deploy(feeRecipient.address, 'SepoliaETH', 'https://zebra.xyz/')
      factory = deployedContracts.factory
      treasury = deployedContracts.treasury
    })


    it("should generate the metadata on uri query", async function() {

      const expectedName = 'A test vault'
      const expectedDescription = 'description'

      // Generate a sample token and its attributes
      const vault = await makeVault(factory, INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1)

      // Retrieve the token's metadata URI
      const metadataURI = await factory.uri(0)

      // Decode the base64-encoded JSON data
      const decodedData = atob(metadataURI.split(",")[1])

      // Parse the decoded JSON data
      const metadata = JSON.parse(decodedData)

      // Assert that the metadata has the correct values
      expect(metadata.name).to.equal(expectedName)
      expect(metadata.description).to.equal(expectedDescription)
      expect(metadata.attributes.length).to.equal(6)
      expect(metadata.attributes[0].display_type).to.equal("date")
      expect(metadata.attributes[0].trait_type).to.equal("Maturity Date")
      expect(metadata.attributes[1].trait_type).to.equal("Vault Asset")
      expect(metadata.attributes[1].value).to.equal("SepoliaETH")
      expect(metadata.attributes[2].trait_type).to.equal("Target Balance")
      expect(metadata.attributes[2].value).to.equal("1.000")
      expect(metadata.attributes[3].trait_type).to.equal("Current Balance")
      expect(metadata.attributes[3].value).to.equal("0")
      expect(metadata.attributes[4].trait_type).to.equal("Receive Address")
      expect(metadata.attributes[4].value).to.equal(vault.target.toLowerCase())
    })

    it("should return correct metadata for unlocked vault", async function() {
      const expectedName = 'A 100-edition test vault'
      const expectedDescription = 'no unlock time'

      // Generate a sample token and its attributes
      const vault = await makeVault_100edition_target100_noUnlockTime(
        factory,
        INITIAL_DEFAULT_ADMIN_AND_SIGNER,
        user1
      )

      //send enough ETH
      const amountToSend = ethers.parseEther("10")

      // Send the ETH to the vault contract
      await user2.sendTransaction({
        to: vault.target,
        value: amountToSend,
      })

      // Retrieve the token's metadata URI
      const metadataURI = await factory.uri(0)

      // Decode the base64-encoded JSON data
      const decodedData = atob(metadataURI.split(",")[1])

      // Parse the decoded JSON data
      const metadata = JSON.parse(decodedData)

      //console.log(metadata)

      // Assert that the metadata has the correct values
      expect(metadata.name).to.equal(expectedName)
      expect(metadata.description).to.equal(expectedDescription)
      expect(metadata.attributes.length).to.equal(6)
      expect(metadata.attributes[0].display_type).to.equal("date")
      expect(metadata.attributes[0].trait_type).to.equal("Maturity Date")
      expect(metadata.attributes[1].trait_type).to.equal("Vault Asset")
      expect(metadata.attributes[1].value).to.equal("SepoliaETH")
      expect(metadata.attributes[2].trait_type).to.equal("Target Balance")
      expect(metadata.attributes[2].value).to.equal("100.0")
      expect(metadata.attributes[3].trait_type).to.equal("Current Balance")
      expect(metadata.attributes[3].value).to.equal("10.00")
      expect(metadata.attributes[4].trait_type).to.equal("Receive Address")
      expect(metadata.attributes[4].value).to.equal(vault.target.toLowerCase())
      expect(metadata.attributes[5].display_type).to.equal("boost_percentage")
      expect(metadata.attributes[5].trait_type).to.equal("Percent Complete")
      expect(metadata.attributes[5].value).to.equal(10)
    })
  })
})