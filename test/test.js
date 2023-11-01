// We import Chai to use its asserting functions here.
const { expect, assert } = require("chai")
const { ethers, upgrades, network } = require("hardhat")
const helpers = require("@nomicfoundation/hardhat-network-helpers")
const { getTypedData, getRevertReason, getCurrentBlockTime, deployMockToken, deployMockFund } = require("test_helpers")

const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000'

describe("Testing cryptofunds", function () {

  let utils, generator, fundImplementation, cryptofunds

  let owner, newOwner, nonOwner
  let minter, newMinter, nonMinter
  let nftOwner, nonNftOwner
  let feeRecipient, newFeeRecipient

  beforeEach(async function () {
    
    [owner, newOwner, minter, newMinter, nonOwner, nonMinter, nftOwner, nonNftOwner, feeRecipient, newFeeRecipient] = await ethers.getSigners()

    const FundImplementation = await ethers.getContractFactory("Fund")
    const Generator = await ethers.getContractFactory("Generator_v1")
    const Treasury = await ethers.getContractFactory("Treasury")
    
    generator = await Generator.deploy()

    treasury = await Treasury.deploy()

    const Factory = await ethers.getContractFactory("cryptofunds")

    const _name = 'cryptofunds_HH_TEST'
    const _symbol = 'CPG'
    const _feeRecipient = feeRecipient.address
    const _royaltyBps = '400'

    // deploy
    cryptofunds = await Factory.deploy(_name, _symbol, _feeRecipient, _royaltyBps)
    
    // init the implementation
    await cryptofunds.deployed()

    fundImplementation = await FundImplementation.deploy(cryptofunds.address)
    await fundImplementation.deployed()

    //set the implementation in the contract
    await cryptofunds.setFundImplementation(fundImplementation.address)

    //set the generator in the contract
    await cryptofunds.setGenerator(generator.address)

    //set the generator in the contract
    await cryptofunds.setTreasury(treasury.address)

    //console.log('factory address:', cryptofunds.address)
    //console.log('fund address:', fundImplementation.address)
  })

  describe("Burning", function () {

    let fundAddress

    beforeEach(async function () {
      fundAddress = makeFund(nftOwner.address,100,"Test Burning","100 Funds",0,'1','0.004')
      //send 1 ETH
      await nftOwner.sendTransaction({ to: fundAddress, value: ethers.utils.parseEther("1") })      
    })
  
    /*
    // we decided not to include a public burn function
    it("should allow a holder to burn some or all of their tokens", async function () {
      // Assume nftOwner already holds some tokens
      const initialBalance = await cryptofunds.balanceOf(nftOwner.address, 0)
      const burnAmount = initialBalance.div(2) // Burn half of their tokens

      await cryptofunds.connect(nftOwner).burn(0, burnAmount)

      const newBalance = await cryptofunds.balanceOf(nftOwner.address, 0)
      expect(newBalance).to.equal(initialBalance.sub(burnAmount))
    })

    it("should not allow a non-holder to burn tokens", async function () {})

    it("should not allow a the contract owner to burn tokens", async function () {})
    */

    it("should burn all of a holder's tokens when they execute the payout function", async function () {
      
      const fund = await ethers.getContractAt("Fund", fundAddress)

      await cryptofunds.connect(nftOwner).payout(0)

      const newBalance = await cryptofunds.balanceOf(nftOwner.address, 0)
      expect(newBalance).to.equal(0)
    })
  })

  describe("Payout", function() {

    it("should payout token holder if the unlock time has passed", async function () {

      /*// first make a fund
      const fundAddress = makeFund(
        nftOwner.address,
        4,
        "4 Little Pigs",
        "description",
        7,
        "4.44"
      )*/

      const fundAddress = makeFund(
        nftOwner.address,
        4,
        "4 Little Pigs",
        "description",
        7,
        "4.44"
      )

      //send enough ETH
      const amountToSend = ethers.utils.parseEther("4.44")

      // Send the ETH to the fund contract
      await nonOwner.sendTransaction({
        to: fundAddress,
        value: amountToSend,
      })

      // Check the fund contract balance is correct
      let fundBalance = await ethers.provider.getBalance(fundAddress)
      expect(fundBalance).to.equal(amountToSend)

      // Increase block time to after the unlockTime
      await helpers.time.increase(60 * 60 * 24 * 7) // 7 days

      //console.log(await cryptofunds.uri(0))

      //get holders balance before payout
      const initialNftOwnerBalance = await ethers.provider.getBalance(nftOwner.address)

      // should payout all funds
      const tx = await cryptofunds.connect(nftOwner).payout(0)
      fundBalance = await ethers.provider.getBalance(fundAddress)
      expect(fundBalance).to.equal(0)

      // get gas used
      const txReceipt = await ethers.provider.getTransactionReceipt(tx.hash)
      const gasCost = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice)
      
      //console.log('gasCost:', gasCost)

      const clonedFund = await ethers.getContractAt("Fund", fundAddress)
      const breakFundFeeBps = await clonedFund.breakFundFeeBps()
      const attr = await clonedFund.attributes()
      //console.log(attr)
      //console.log("breakFundFeeBps:", breakFundFeeBps.toString())

      const PB = await ethers.getContractFactory('Fund')
      const fund = await PB.attach(fundAddress)
      const breakFundFee = await fund.breakFundFeeBps()

      //console.log('breakFundFeeBPS:', breakFundFee)

      //holder should receive all funds minus break fee and gas:
      const nftOwnerBalanceAfterPayout = await ethers.provider.getBalance(nftOwner.address)
      const payoutFee = amountToSend.mul(400).div(10000) // 400 basis points

      const expectedBalanceChange = amountToSend.sub(payoutFee).sub(gasCost)

      expect(nftOwnerBalanceAfterPayout).to.equal(initialNftOwnerBalance.add(expectedBalanceChange))
    })

    it("should payout token holder if the target balance is reached", async function () {

      // first make a fund
      const fundAddress = makeFund(
        nftOwner.address,
        4,
        "4 Little Pigs",
        "description",
        0,
        "4.44"
      )
      
      const halfAmountToSend = ethers.utils.parseEther("2.22")
      const fullAmountToSend = ethers.utils.parseEther("4.44")

      //send some ETH
      await nonOwner.sendTransaction({
        to: fundAddress,
        value: halfAmountToSend,
      })

      // should not allow payout
      await expect(cryptofunds.connect(nftOwner).payout(0)).to.be.revertedWith("Fund is still hungry!")

      // send some more ETH
      await nonOwner.sendTransaction({
        to: fundAddress,
        value: halfAmountToSend,
      })

      // Check the fund contract balance is correct
      let fundBalance = await ethers.provider.getBalance(fundAddress)
      expect(fundBalance).to.equal(ethers.utils.parseEther("4.44"))

      //get holders balance before payout
      const initialNftOwnerBalance = await ethers.provider.getBalance(nftOwner.address)

      // should payout all funds
      const tx = await cryptofunds.connect(nftOwner).payout(0)
      fundBalance = await ethers.provider.getBalance(fundAddress)
      expect(fundBalance).to.equal(0)

      // get gas used
      const txReceipt = await ethers.provider.getTransactionReceipt(tx.hash)
      const gasCost = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice)
      
      //console.log('gasCost:', gasCost)

      //holder should receive all funds minus break fee and gas:
      const nftOwnerBalanceAfterPayout = await ethers.provider.getBalance(nftOwner.address)
      const payoutFee = fullAmountToSend.mul(400).div(10000) // 400 basis points

      const expectedBalanceChange = fullAmountToSend.sub(payoutFee).sub(gasCost)

      expect(nftOwnerBalanceAfterPayout).to.equal(initialNftOwnerBalance.add(expectedBalanceChange))
    })

    it("should payout token holder % of balance proportional to token holder's share of token", async function () {

      // first make a fund
      const fundAddress = makeFund(
        nftOwner.address,
        100,
        "100 Little Pigs",
        "description",
        0,
        "100"
      )
      
      const fullAmountToSend = ethers.utils.parseEther("100")

      // send all the ETH
      await nonOwner.sendTransaction({
        to: fundAddress,
        value: fullAmountToSend,
      })

      // Check the fund contract balance is correct
      let fundBalance = await ethers.provider.getBalance(fundAddress)
      expect(fundBalance).to.equal(ethers.utils.parseEther("100"))

      // distribute the token
      await cryptofunds.connect(nftOwner).safeTransferFrom(nftOwner.address, newOwner.address, 0, 25, "0x")
      expect(await cryptofunds.balanceOf(nftOwner.address, 0)).to.equal(75)
      expect(await cryptofunds.balanceOf(newOwner.address, 0)).to.equal(25)

      // HOLDER 1
      const holder1BalanceBeforePayout = await ethers.provider.getBalance(nftOwner.address)

      // should payout 75% of the funds to holder 1, leaving 25% of tokens with holder 2
      let tx = await cryptofunds.connect(nftOwner).payout(0)
      expect(await cryptofunds.totalSupply(0)).to.equal(25)

      // get gas used
      let txReceipt = await ethers.provider.getTransactionReceipt(tx.hash)
      let gasCost = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice)

      //holder should receive 75% of funds minus break fee and gas:
      const holder1BalanceAfterPayout = await ethers.provider.getBalance(nftOwner.address)
      let payoutFee = ethers.utils.parseEther("75").mul(400).div(10000) // 400 basis points
      let expectedBalanceChange = ethers.utils.parseEther("75").sub(payoutFee).sub(gasCost)

      expect(holder1BalanceAfterPayout).to.equal(holder1BalanceBeforePayout.add(expectedBalanceChange))

      // HOLDER 2:
      const holder2BalanceBeforePayout = await ethers.provider.getBalance(newOwner.address)

      // should payout remaining 25% of the funds to holder 2, leaving 0 tokens
      tx = await cryptofunds.connect(newOwner).payout(0)
      expect(await cryptofunds.totalSupply(0)).to.equal(0)

      // get gas used
      txReceipt = await ethers.provider.getTransactionReceipt(tx.hash)
      gasCost = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice)
      
      //console.log('gasCost:', gasCost)

      //holder should receive all funds minus break fee and gas:
      const holder2BalanceAfterPayout = await ethers.provider.getBalance(newOwner.address)
      payoutFee = ethers.utils.parseEther("25").mul(400).div(10000) // 400 basis points
      expectedBalanceChange = ethers.utils.parseEther("25").sub(payoutFee).sub(gasCost)

      expect(holder2BalanceAfterPayout).to.equal(holder2BalanceBeforePayout.add(expectedBalanceChange))
    })

    it("should fail if token holder attempts payout before unlockTime", async function () {

      // first make a fund
      const fundAddress = makeFund(
        nftOwner.address,
        4,
        "4 Little Pigs",
        "description",
        7,
        "4.44"
      )

      //send enough ETH
      const amountToSend = ethers.utils.parseEther("11")

      // Send the ETH to the fund contract
      await nonOwner.sendTransaction({
        to: fundAddress,
        value: amountToSend,
      })

      // Check the fund contract balance is correct
      let fundBalance = await ethers.provider.getBalance(fundAddress)
      expect(fundBalance).to.equal(amountToSend)

      // should not allow payout
      await expect(cryptofunds.connect(nftOwner).payout(0)).to.be.revertedWith("You can't withdraw yet")
    })

    it("should fail if token holder attempts payout before target balance is reached", async function () {

      // first make a fund
      const fundAddress = makeFund(
        nftOwner.address,
        4,
        "4 Little Pigs",
        "description",
        0,
        "10"
      )
      
      const amountToSend = ethers.utils.parseEther("9.999")

      //send some ETH
      await nonOwner.sendTransaction({
        to: fundAddress,
        value: amountToSend,
      })

      // should not allow payout
      await expect(cryptofunds.connect(nftOwner).payout(0)).to.be.revertedWith("Fund is still hungry!")
    })

    it("should fail if non token holder attempts payout", async function () {
      // first make a fund
      const fundAddress = makeFund(
        nftOwner.address,
        4,
        "4 Little Pigs",
        "description",
        0,
        "10"
      )
      
      const amountToSend = ethers.utils.parseEther("10")

      //send some ETH
      await nonOwner.sendTransaction({
        to: fundAddress,
        value: amountToSend,
      })

      // should not allow payout
      await expect(cryptofunds.connect(nonNftOwner).payout(0)).to.be.revertedWith("Not authorised!")
    })

    it("should fail if fund has no money", async function () {

      // first make a fund
      const fundAddress = await makeFund(
        nftOwner.address,
        4,
        "4 Little Pigs",
        "description",
        1,
        "0",
        "0.004"
      )

      // Increase block time to after the unlockTime
      await helpers.time.increase(60 * 60 * 24 * 7) // 7 days

      // should not allow payout
      await expect(cryptofunds.connect(nftOwner).payout(0)).to.be.revertedWith("Fund is still hungry!")
    })

    it("should set the state to unlocked on 1 to n-1 payouts", async function () {
      return false
    })

    it("should set the state to open on last payout", async function () {

      return false
    })
  })

  describe("Fees", function() {

     it("should set a new fee recipient", async function() {

      // Set a new fee recipient
      await cryptofunds.connect(owner).setFeeRecipient(newFeeRecipient.address)

      // Check if the new fee recipient has been set correctly
      const actualFeeRecipient = await cryptofunds.feeRecipient()
      expect(actualFeeRecipient).to.equal(newFeeRecipient.address)
     })

     it("should pay the MakeFundFee to the fee recipient each time a fund is created", async function () {
       
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
        11,
        timestamp,
        endTime,
        "Sam the Pig",
        "An accurate description",
        unlockTime,
        targetBalance
      )

      // grant MINTER role to signer
      await cryptofunds.grantRole(await cryptofunds.SIGNER_ROLE(), minter.address)

      // Sign the typed data
      const signature = await minter._signTypedData(
        typedData.domain,
        typedData.types,
        typedData.message
      )

       // Recover the signer's address from the signature
      const recoveredAddress = ethers.utils.verifyTypedData(
        typedData.domain,
        typedData.types,
        typedData.message,
        signature
      )

      const initialBalance = await ethers.provider.getBalance(feeRecipient.address)

      const tx = await cryptofunds.connect(nftOwner).mintWithSignature(typedData.message, signature, { value: makeFundFee })
      
      /*const nft1 = await cryptofunds.uri(0)
      console.log(nft1)*/

      /*// get gas used
      const txReceipt = await ethers.provider.getTransactionReceipt(tx.hash)
      const gasCost = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice)
      const expectedBalanceChange = makeFundFee.sub(gasCost)
      console.log('gasCost:', gasCost)
      console.log(txReceipt)
      console.log('expectedBalanceChange:', expectedBalanceChange)*/

      const newBalance = await ethers.provider.getBalance(feeRecipient.address)

      expect(newBalance.sub(initialBalance)).to.equal(makeFundFee)

     })

     it("should pay the BreakFundFee to the fee recipient with each payout", async function () {
      const initialFeeRecipientBalance = await ethers.provider.getBalance(feeRecipient.address)

      // first make a fund
      const fundAddy = makeFund(
        nftOwner.address,
        4,
        "4 Little Pigs",
        "description",
        0,
        "1"
      )

      // Define the amount of ETH you want to send (in wei)
      const amountToSend = ethers.utils.parseEther("1") // 1 ETH

      // send some ETH to the fund
      await nonOwner.sendTransaction({
        to: fundAddy,
        value: amountToSend,
      })

      await cryptofunds.connect(nftOwner).payout(0)
      const newBalance = await cryptofunds.balanceOf(nftOwner.address, 0)
      expect(newBalance).to.equal(0)

      // Calculate the expected BreakFundFee paid to the fee recipient
      const breakFundFeeBPS = 400
      let expectedFee = amountToSend.mul(breakFundFeeBPS).div(10000) // 4% of 1 ETH
      // don't forget the makeFundFee
      expectedFee = expectedFee.add(ethers.utils.parseEther("0.004"))

      // Check the fee recipient's balance after the payout
      const finalFeeRecipientBalance = await ethers.provider.getBalance(feeRecipient.address)
      expect(finalFeeRecipientBalance.sub(initialFeeRecipientBalance)).to.equal(expectedFee)
     })

     it("should change the MakeFundFee", async function () {

      const newMakeFundFee = ethers.utils.parseEther("0.02")

      await cryptofunds.setMakeFundFee(newMakeFundFee)
      const updatedMakeFundFee = await cryptofunds.makeFundFee()

      expect(updatedMakeFundFee).to.equal(newMakeFundFee)
     })

     it("should change the BreakFundFee", async function () {
      // Use the helper function to create a new fund contract
      /* const fundAddress = await makeFund()
      const PB = await ethers.getContractFactory('Fund')
      const fund = await PB.attach(fundAddress)*/

      const newBreakFundFee = 200

      await cryptofunds.setBreakFundBps(newBreakFundFee)
      const updatedBreakFundFee = await cryptofunds.breakFundFeeBps()

      expect(updatedBreakFundFee).to.equal(newBreakFundFee)
     })

     it("should fail when trying to mint a fund sending less than the MakeFundFee", async function () {
      await expect(makeFund(nftOwner.address,44,"44 Little Pigs","description",0,"1","0.003")).to.be.revertedWith("Must send the correct fee")
     })

     it("should fail when trying to set the BreakFundFee higher than the max allowed", async function () {
      const newBreakFundFee = 901

      await expect(cryptofunds.setBreakFundBps(newBreakFundFee)).to.be.revertedWith("Don't be greedy!")
     })   
  })

  describe("Querying", function() {
    it("should generate the metadata on uri query", async function() {

      const expectedName = '4 Little Pigs'
      const expectedDescription = 'description'
      const expectedUnlockTime = 1698495367

      // Generate a sample token and its attributes
      const fundAddress = await makeFund()

      // Retrieve the token's metadata URI
      const metadataURI = await cryptofunds.uri(0)

      // Decode the base64-encoded JSON data
      const decodedData = atob(metadataURI.split(",")[1])

      // Parse the decoded JSON data
      const metadata = JSON.parse(decodedData)

      console.log(metadata)

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
      expect(metadata.attributes[3].value).to.equal(fundAddress.toLowerCase())
    })

    it("should return correct metadata for fund with 50% time up", async function() {
      const expectedName = '4 Little Pigs'
      const expectedDescription = 'The description'
      const expectedUnlockTime = 1698495367

      // Generate a sample token and its attributes with 50% of unlock time passed
      const fundAddress = await makeFund(
        nftOwner.address,
        4,
        '4 Little Pigs',
        'The description',
        100, // unlock days
        '0',
        '0.004'
      )

      // Simulate waiting for 50 days
      const fiftyDaysInSeconds = 60 * 60 * 24 * 50
      await network.provider.send("evm_increaseTime", [fiftyDaysInSeconds])
      await network.provider.send("evm_mine")

      // Retrieve the token's metadata URI
      const metadataURI = await cryptofunds.uri(0)

      // Decode the base64-encoded JSON data
      const decodedData = atob(metadataURI.split(",")[1])

      // Parse the decoded JSON data
      const metadata = JSON.parse(decodedData)

      console.log(metadata)

      // Assert that the metadata has the correct values
      expect(metadata.name).to.equal(expectedName)
      expect(metadata.description).to.equal(expectedDescription)
      expect(metadata.attributes.length).to.equal(5)
      expect(metadata.attributes[0].display_type).to.equal("date")
      expect(metadata.attributes[0].trait_type).to.equal("Maturity Date")
      expect(metadata.attributes[1].trait_type).to.equal("Target Balance")
      expect(metadata.attributes[1].value).to.equal("0 ETH")
      expect(metadata.attributes[2].trait_type).to.equal("Current Balance")
      expect(metadata.attributes[2].value).to.equal("0 ETH")
      expect(metadata.attributes[3].trait_type).to.equal("Receive Address")
      expect(metadata.attributes[3].value).to.equal(fundAddress.toLowerCase())
      expect(metadata.attributes[4].display_type).to.equal("boost_percentage")
      expect(metadata.attributes[4].trait_type).to.equal("Percent Complete")
      expect(metadata.attributes[4].value).to.equal(50)
    })

    it("should return correct metadata for fund with 50 balance", async function() {
      const expectedName = '4 Little Pigs'
      const expectedDescription = 'The description'
      const expectedUnlockTime = 0

      // Generate a sample token and its attributes
      const fundAddress = await makeFund(
        nftOwner.address,
        4,
        '4 Little Pigs',
        'The description',
        0, // unlock days
        '10', // target balance
        '0.004'
      )

      //send enough ETH
      const amountToSend = ethers.utils.parseEther("5")

      // Send the ETH to the fund contract
      await nonOwner.sendTransaction({
        to: fundAddress,
        value: amountToSend,
      })

      // Retrieve the token's metadata URI
      const metadataURI = await cryptofunds.uri(0)

      // Decode the base64-encoded JSON data
      const decodedData = atob(metadataURI.split(",")[1])

      // Parse the decoded JSON data
      const metadata = JSON.parse(decodedData)

      console.log(metadata)

      // Assert that the metadata has the correct values
      expect(metadata.name).to.equal(expectedName)
      expect(metadata.description).to.equal(expectedDescription)
      expect(metadata.attributes.length).to.equal(5)
      expect(metadata.attributes[0].display_type).to.equal("date")
      expect(metadata.attributes[0].trait_type).to.equal("Maturity Date")
      expect(metadata.attributes[1].trait_type).to.equal("Target Balance")
      expect(metadata.attributes[1].value).to.equal("10.00000 ETH")
      expect(metadata.attributes[2].trait_type).to.equal("Current Balance")
      expect(metadata.attributes[2].value).to.equal("5.00000 ETH")
      expect(metadata.attributes[3].trait_type).to.equal("Receive Address")
      expect(metadata.attributes[3].value).to.equal(fundAddress.toLowerCase())
      expect(metadata.attributes[4].display_type).to.equal("boost_percentage")
      expect(metadata.attributes[4].trait_type).to.equal("Percent Complete")
      expect(metadata.attributes[4].value).to.equal(50)
    })

    it("should return correct metadata for unlocked fund", async function() {
      const expectedName = '4 Little Pigs'
      const expectedDescription = 'The description'
      const expectedUnlockTime = 0

      // Generate a sample token and its attributes
      const fundAddress = await makeFund(
        nftOwner.address,
        4,
        '4 Little Pigs',
        'The description',
        0, // unlock days
        '10', // target balance
        '0.004'
      )

      //send enough ETH
      const amountToSend = ethers.utils.parseEther("10")

      // Send the ETH to the fund contract
      await nonOwner.sendTransaction({
        to: fundAddress,
        value: amountToSend,
      })

      // Retrieve the token's metadata URI
      const metadataURI = await cryptofunds.uri(0)

      // Decode the base64-encoded JSON data
      const decodedData = atob(metadataURI.split(",")[1])

      // Parse the decoded JSON data
      const metadata = JSON.parse(decodedData)

      console.log(metadata)

      // Assert that the metadata has the correct values
      expect(metadata.name).to.equal(expectedName)
      expect(metadata.description).to.equal(expectedDescription)
      expect(metadata.attributes.length).to.equal(5)
      expect(metadata.attributes[0].display_type).to.equal("date")
      expect(metadata.attributes[0].trait_type).to.equal("Maturity Date")
      expect(metadata.attributes[1].trait_type).to.equal("Target Balance")
      expect(metadata.attributes[1].value).to.equal("10.00000 ETH")
      expect(metadata.attributes[2].trait_type).to.equal("Current Balance")
      expect(metadata.attributes[2].value).to.equal("10.00000 ETH")
      expect(metadata.attributes[3].trait_type).to.equal("Receive Address")
      expect(metadata.attributes[3].value).to.equal(fundAddress.toLowerCase())
      expect(metadata.attributes[4].display_type).to.equal("boost_percentage")
      expect(metadata.attributes[4].trait_type).to.equal("Percent Complete")
      expect(metadata.attributes[4].value).to.equal(100)
    })
  })

  describe("Events", function() {
    it("should emit SendETHToTreasury event with treasury and amount params when calling sendToTreasury()", async function() {
      expect(true).to.equal(false)
    })

    it("should emit SendSupportedTokenToTreasury w treasury, address, and amount params when calling sendToTreasury()", async function() {
      expect(true).to.equal(false)
    })

    it("should emit TreasuryUpdated when changing the treasury contract", async function() {
      expect(true).to.equal(false)
    })
  }

  describe("Transactions", function () {

    it("should be able to send ETH to the fund contract", async function () {
      // Use the helper function to create a new fund contract
      const fundAddress = await makeFund()

      // Define the amount of ETH you want to send (in wei)
      const amountToSend = ethers.utils.parseEther("1.2345")

      // Send the ETH to the fund contract
      await nonOwner.sendTransaction({
        to: fundAddress,
        value: amountToSend,
      })

      // Check the fund contract balance
      const fundBalance = await ethers.provider.getBalance(fundAddress)
      expect(fundBalance).to.equal(amountToSend)
    })

    it("should fail when sending native tokens to the factory", async function () {
      // Define the amount of ETH you want to send (in wei)
      const amountToSend = ethers.utils.parseEther("1.2345")

      await expect(nonOwner.sendTransaction({
        to: factory,
        value: amountToSend,
      })).to.be.revertedWith("!ERC1155RECEIVER")
    })

    it("should fail when sending non-native tokens to a fund", async function () {
      // Use the helper function to create a new fund contract
      const fundAddress1 = await makeFund()
      const fundAddress2 = await makeFund()

      await expect(cryptofunds.connect(nftOwner).safeTransferFrom(nftOwner.address, fundAddress2, 0, 2, "0x")).to.be.revertedWith("!ERC1155RECEIVER")
    })

    it("should fail when sending non-native tokens to the factory contract", async function () {
      const fundAddress = await makeFund()
      await expect(cryptofunds.connect(nftOwner).safeTransferFrom(nftOwner.address, fundAddress, 0, 2, "0x")).to.be.revertedWith("!ERC1155RECEIVER")
    })

    it("should transfer a quantity of fund NTFs from one holder to another", async function () {
      const fundAddress = await makeFund()
      await cryptofunds.connect(nftOwner).safeTransferFrom(nftOwner.address, newOwner.address, 0, 2, "0x")
      expect(await cryptofunds.balanceOf(newOwner.address, 0)).to.equal(2)
    })

    it("should not allow anyone to send ETH to the cryptofunds contract", async function () {
      try {
        await owner.sendTransaction({
          to: cryptofunds.address,
          value: ethers.utils.parseEther("1.2345"),
        })

        assert.fail("Expected the transaction to revert")
      } catch (error) {
        const revertReason = getRevertReason(error)
        assert.equal(
          revertReason,
          "Do not send ETH to this contract"
        )
      }
    })

    it("should revert when calling sendToTreasury if fund state is not Open", async function () {
       expect(true).to.equal(false)
    })

    it("should revert when calling sendToTreasury when caller is not the treasury", async function () {
       expect(true).to.equal(false)
    })

    it("should send full native token balance to treasury when calling sendToTreasury", async function () {
       expect(true).to.equal(false)
    })

    it("should send full supported token balances to treasury when calling sendToTreasury", async function () {
       expect(true).to.equal(false)
    })
  })
})