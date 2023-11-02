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

  describe("Fees", function() {

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