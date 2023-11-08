// We import Chai to use its asserting functions here.
const { expect, assert } = require("chai")
const { ethers, upgrades, network } = require("hardhat")
const helpers = require("@nomicfoundation/hardhat-network-helpers")
const { deploy, deployFundImplementation, deployGenerator, deployTreasury, getTypedData, getRevertReason, getCurrentBlockTime, deployMockToken, generateMintRequest, makeFund, makeFund_100edition_target100_noUnlockTime } = require("./test_helpers")

const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000'

describe(" -- Testing Factory Contract -- ", function () {
  describe("Minting & Fund Creation", function () {

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

  describe("Payout & Burn", function () {

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
      treasury = deployedContracts.treasury
      fund = await makeFund(factory, INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1)
    })

    /*
      1. check that user has a balance
      2. send enough funds to unlock
      3. execute payout
      4. check that tokens have been burned
      5. check that payout event was fired
    */
    it("Payout should succeed when token exists and user has balance, tokens should then be burned", async function () {

      // Verify that the token was minted and assigned to the correct recipient
      const intialBalanceUser1 = await factory.balanceOf(user1.address, 0)
      expect(intialBalanceUser1).to.equal(4)

      //send enough ETH
      const amountToSend = ethers.utils.parseEther("1")
      let receiveTx = await user2.sendTransaction({
        to: fund.address,
        value: amountToSend,
      })

      // Increase block time to after the unlockTime
      await helpers.time.increase(60 * 60 * 24 * 100) // 100 days

      // Call setTargetReached()
      const targetReachedTx = await fund.setStateUnlocked()

      // Call the payout function
      const payoutTx = await factory.connect(user1).payout(0)
      await payoutTx.wait()

      // get the StateChanged event from the transaction
      events = await factory.queryFilter("Payout", payoutTx.blockHash)

      expect(events[0].args.fundAddress).to.equal(fund.address)
      expect(events[0].args.tokenId).to.equal(0)

      // Verify that the tokens were burned
      const balanceUser1 = await factory.balanceOf(user1.address, 0)
      expect(balanceUser1).to.equal(0)
    })

    /*
      1. issue fund with 1 share, check it is marked open on first payout
      2. issue fund with 4 shares, divide between 2 users
      3. ensure fund is moved to open on last payout
    */
    it("Should call treasury.addOpenFund if it is the last payout", async function () {
      // Generate a signature for the mint request
      const timestamp = await ethers.provider.getBlockNumber().then(blockNumber =>
      // getBlock returns a block object and it has a timestamp property.
      ethers.provider.getBlock(blockNumber).then(block => block.timestamp))
      const startTime = Math.floor(timestamp - 60 * 60 * 24 * 2) // - 2 days
      const endTime = Math.floor(timestamp + 60 * 60 * 24 * 7) // + 7 days
      const unlockTime = Math.floor(timestamp - 60 * 60 * 24 * 99)
      const targetBalance = ethers.utils.parseUnits("1", "ether").toString()

      const typedData = await getTypedData(
        factory.address,
        user2.address,
        startTime,
        endTime,
        1,
        unlockTime,
        targetBalance,
        'A test fund',
        '1 edition'    
      )

      const mr = await generateMintRequest(
        factory.address,
        INITIAL_DEFAULT_ADMIN_AND_SIGNER,
        user2.address,
        typedData
      )

      const makeFundFee = ethers.utils.parseUnits("0.004", "ether")

      const tx = await factory.connect(INITIAL_DEFAULT_ADMIN_AND_SIGNER).mintWithSignature(
        mr.typedData.message,
        mr.signature,
        { value: makeFundFee }
      )
      const txReceipt = await tx.wait()
      const fundCreatedEvent = txReceipt.events.find(event => event.event === 'FundDeployed')
      const Fund = await ethers.getContractFactory("Fund")
      const fund1 = Fund.attach(fundCreatedEvent.args.fund)

      // Verify that the initial fund's tokens were minted and assigned to the correct recipient
      const balanceUser1 = await factory.balanceOf(user1.address, 0)
      expect(balanceUser1).to.equal(4)

      // Verify that the single token fund was minted and assigned to the correct recipient
      const balanceUser2 = await factory.balanceOf(user2.address, 1)
      expect(balanceUser2).to.equal(1)

      // Increase block time to after the unlockTime
      await helpers.time.increase(60 * 60 * 24 * 100) // 100 days

      //send eth to both tokens to unlock them
      //send enough ETH
      const amountToSend = ethers.utils.parseEther("1")
      let receiveTx1 = await user2.sendTransaction({
        to: fund.address,
        value: amountToSend,
      })
      let receiveTx2 = await user2.sendTransaction({
        to: fund1.address,
        value: amountToSend,
      })

      // transfer 2 tokens from user1 to user2
      await factory.connect(user1).safeTransferFrom(user1.address, user2.address, 0, 2, "0x")
      expect(await factory.balanceOf(user1.address, 0)).to.equal(2)
      expect(await factory.balanceOf(user2.address, 0)).to.equal(2)

      // call payout on 1st fund and make sure that AddedOpenFund event NOT emitted
      tx1 = await factory.connect(user1).payout(0)
      const payout1Event = await treasury.queryFilter('AddedOpenFund', tx1.blockHash)
      expect(payout1Event).to.be.empty

      // call payout on 2nd fund and make sure that AddedOpenFund event was emitted
      tx2 = await factory.connect(user2).payout(1)
      const payout2Event = await treasury.queryFilter('AddedOpenFund', tx2.blockHash)
      expect(payout2Event.length).to.be.gt(0)

      // call payout on 1st fund with user2, and make sure that AddedOpenFund event was emitted
      tx3 = await factory.connect(user2).payout(0)
      const payout3Event = await treasury.queryFilter('AddedOpenFund', tx3.blockHash)
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
      1. Call uri() with a valid tokenId
    */
    it("URI should not revert when called with valid tokenId", async function () {
      await expect(factory.uri(0)).to.not.be.reverted
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
        const decodedMetadata = JSON.parse(atob(metadata.split(',')[1]))
        return decodedMetadata.attributes.find(attr => attr.trait_type === "Percent Complete").value
      }

      // 1. Verify that the percentage is 0
      expect(await getPercentage()).to.equal(0, "Initial percentage should be 0")

      // 2. Move block time fwd 33 days; percent shoul still be 0 because it's the lowest progress
      await helpers.time.increase(60 * 60 * 24 * 33) // 33 days
      expect(await getPercentage()).to.equal(0, "Percentage should still be 0")

      // 3. Send 0.2 ETH and ensure that the percentage returned is 20
      await user1.sendTransaction({ to: fund.address, value: ethers.utils.parseEther("0.2") })
      expect(await getPercentage()).to.equal(20, "Percentage should be 20 after sending 0.2 ETH")

      // 4. Send 0.2 ETH and ensure that the percentage returned is 33 (days is now lowest progress)
      await user1.sendTransaction({ to: fund.address, value: ethers.utils.parseEther("0.2") })
      expect(await getPercentage()).to.equal(33, "Percentage should be 33 based on time to unlock")

      // 5. Move block time fwd another 33 days; percent should be 40 because ETH progress is lowest
      await helpers.time.increase(60 * 60 * 24 * 33) // 33 days
      expect(await getPercentage()).to.equal(40, "Percentage should be 40 based on ETH balance/target")

      // 6. Send 0.6 ETH and ensure that the percentage returned is 66 (days is now lowest progress)
      await user1.sendTransaction({ to: fund.address, value: ethers.utils.parseEther("0.6") })
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
      const deployedContracts = await deploy(feeRecipient.address, 'https://zebra.xyz/')
      factory = deployedContracts.factory
      treasury = deployedContracts.treasury
    })

    it("should fail when sending native tokens to the factory", async function () {
      // Define the amount of ETH you want to send (in wei)
      const amountToSend = ethers.utils.parseEther("1.2345")

      await expect(owner.sendTransaction({
        to: factory,
        value: amountToSend,
      })).to.be.reverted
    })

    it("should fail when sending non-native tokens to the factory contract", async function () {
      const fundAddress = await makeFund(factory, owner, owner)
      await expect(factory.connect(owner).safeTransferFrom(owner.address, fundAddress, 0, 2, "0x")).to.be.reverted
    })

    it("should transfer a quantity of NTFs from one holder to another", async function () {
      const fundAddress = await makeFund(factory, owner, owner)
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
      const deployedContracts = await deploy(feeRecipient.address, 'https://zebra.xyz/')
      factory = deployedContracts.factory
      treasury = deployedContracts.treasury
    })


    it("should generate the metadata on uri query", async function() {

      const expectedName = 'A test fund'
      const expectedDescription = 'description'

      // Generate a sample token and its attributes
      const fund = await makeFund(factory, INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1)

      // Retrieve the token's metadata URI
      const metadataURI = await factory.uri(0)

      // Decode the base64-encoded JSON data
      const decodedData = atob(metadataURI.split(",")[1])

      // Parse the decoded JSON data
      const metadata = JSON.parse(decodedData)

      // Assert that the metadata has the correct values
      expect(metadata.name).to.equal(expectedName)
      expect(metadata.description).to.equal(expectedDescription)
      expect(metadata.attributes.length).to.equal(5)
      expect(metadata.attributes[0].display_type).to.equal("date")
      expect(metadata.attributes[0].trait_type).to.equal("Maturity Date")
      expect(metadata.attributes[1].trait_type).to.equal("Target Balance")
      expect(metadata.attributes[1].value).to.equal("1.00000 ETH")
      expect(metadata.attributes[2].trait_type).to.equal("Current Balance")
      expect(metadata.attributes[2].value).to.equal("0 ETH")
      expect(metadata.attributes[3].trait_type).to.equal("Receive Address")
      expect(metadata.attributes[3].value).to.equal(fund.address.toLowerCase())
    })

    it("should return correct metadata for unlocked fund", async function() {
      const expectedName = 'A 100-edition test fund'
      const expectedDescription = 'no unlock time'

      // Generate a sample token and its attributes
      const fund = await makeFund_100edition_target100_noUnlockTime(
        factory,
        INITIAL_DEFAULT_ADMIN_AND_SIGNER,
        user1
      )

      //send enough ETH
      const amountToSend = ethers.utils.parseEther("10")

      // Send the ETH to the fund contract
      await user2.sendTransaction({
        to: fund.address,
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
      expect(metadata.attributes.length).to.equal(5)
      expect(metadata.attributes[0].display_type).to.equal("date")
      expect(metadata.attributes[0].trait_type).to.equal("Maturity Date")
      expect(metadata.attributes[1].trait_type).to.equal("Target Balance")
      expect(metadata.attributes[1].value).to.equal("100.00000 ETH")
      expect(metadata.attributes[2].trait_type).to.equal("Current Balance")
      expect(metadata.attributes[2].value).to.equal("10.00000 ETH")
      expect(metadata.attributes[3].trait_type).to.equal("Receive Address")
      expect(metadata.attributes[3].value).to.equal(fund.address.toLowerCase())
      expect(metadata.attributes[4].display_type).to.equal("boost_percentage")
      expect(metadata.attributes[4].trait_type).to.equal("Percent Complete")
      expect(metadata.attributes[4].value).to.equal(10)
    })
  })
})