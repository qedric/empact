const { expect, assert } = require("chai")
const { ethers, upgrades, network } = require("hardhat")
const helpers = require("@nomicfoundation/hardhat-network-helpers")

async function deployFundImplementation(factory_address, treasury_address) {

  const FundImplementation = await ethers.getContractFactory("Fund")

  // deploy the fund implementation that will be cloned for each new fund
  const fundImplementation = await FundImplementation.deploy(factory_address, treasury_address)
  await fundImplementation.deployed()

  return fundImplementation
}

async function deployGenerator() {

  const Generator = await ethers.getContractFactory("Generator_v1")

  // deploy the generator contract
  const generator = await Generator.deploy()
  await generator.deployed()

  return generator
}

async function deployTreasury(factory_address) {

  const Treasury = await ethers.getContractFactory("Treasury")

  // deploy the treasury
  const treasury = await Treasury.deploy(factory_address)
  await treasury.deployed()

  return treasury
}

async function deploy(feeRecipient, tokenUrlPrefix) {

  const Factory = await ethers.getContractFactory("Factory")
  
  // deploy the generator contract
  const generator = await deployGenerator()

  // deploy the factory
  const factory = await Factory.deploy(feeRecipient, tokenUrlPrefix)
  await factory.deployed()

  // deploy the treasury
  const treasury = await deployTreasury(factory.address)

  // deploy the fund implementation that will be cloned for each new fund
  const fundImplementation = await deployFundImplementation(factory.address, treasury.address)

  //set the implementation in the contract
  await factory.setFundImplementation(fundImplementation.address)

  //set the generator in the contract
  await factory.setGenerator(generator.address)

  //set the generator in the contract
  await factory.setTreasury(treasury.address)

/*  console.log('factory address:', factory.address)
  console.log('fund address:', fundImplementation.address)*/

  return { factory, treasury, generator }
}

async function getTypedData(
  factory_address,
  to,
  validityStartTimestamp,
  validityEndTimestamp,
  quantity,
  unlockTime,
  targetBalance,
  name,
  description
) {
  return {
    types: {
      MintRequest: [
        { name: "to", type: "address" },
        { name: "validityStartTimestamp", type: "uint128" },
        { name: "validityEndTimestamp", type: "uint128" },
        { name: "quantity", type: "uint256" },
        { name: "unlockTime", type: "uint256" },
        { name: "targetBalance", type: "uint256" },
        { name: "name", type: "string" },
        { name: "description", type: "string" }
      ],
    },
    domain: {
      name: 'SignatureMintERC1155',
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: factory_address,
    },
    primaryType: 'MintRequest',
    message: {
      to: to,
      validityStartTimestamp: validityStartTimestamp,
      validityEndTimestamp: validityEndTimestamp,
      quantity: quantity,
      unlockTime: unlockTime,
      targetBalance: targetBalance,
      name: name,
      description: description      
    },
  };
}

function getRevertReason(error) {
  const startIndex = error.message.indexOf("reverted with reason string '") + "reverted with reason string '".length;
  const endIndex = error.message.length - 1;
  let errorMessage = error.message.slice(startIndex, endIndex);
  errorMessage = errorMessage.slice(0, errorMessage.indexOf("'"));
  return errorMessage;
}

async function getCurrentBlockTime() {
  const timestamp = await ethers.provider.getBlockNumber().then(blockNumber =>
        // getBlock returns a block object and it has a timestamp property.
        ethers.provider.getBlock(blockNumber).then(block => block.timestamp));
  return timestamp;
}

async function deployMockToken(name, symbol) {
  const MockToken = await ethers.getContractFactory("MockToken");
  const token = await MockToken.deploy(name, symbol);
  await token.deployed();
  return token;
}

async function deployMockOETHToken() {
  const MockOETHoken = await ethers.getContractFactory("MockOETHToken")
  const token = await MockOETHoken.deploy('Origin Protocol Mock Token', 'mOETH')
  await token.deployed()
  return token
}

async function generateMintRequest(factory_address, signer, to_address, typedData) {
  // Generate a signature for the mint request
  const timestamp = await ethers.provider.getBlockNumber().then(blockNumber =>
    // getBlock returns a block object and it has a timestamp property.
    ethers.provider.getBlock(blockNumber).then(block => block.timestamp))

  const endTime = Math.floor(timestamp + 60 * 60 * 24)
  const unlockTime = Math.floor(timestamp + 60 * 60 * 24 * 99)
  const targetBalance = ethers.utils.parseUnits("1", "ether").toString()

  if (!typedData) {
    typedData = await getTypedData(
      factory_address,
      to_address,
      timestamp,
      endTime,
      4,
      unlockTime,
      targetBalance,
      'A test fund',
      'description'    
    )
  }

  // Sign the typed data
  const signature = await signer._signTypedData(
    typedData.domain,
    typedData.types,
    typedData.message
  )

  return { signature, typedData }
}

async function makeFund(factory, signer, to) {
  const mintRequest = await generateMintRequest(factory.address, signer, to.address)
  
  const makeFundFee = ethers.utils.parseUnits("0.004", "ether")

  const tx = await factory.connect(to).mintWithSignature(mintRequest.typedData.message, mintRequest.signature, { value: makeFundFee })
  const txReceipt = await tx.wait()

  const fundCreatedEvent = txReceipt.events.find(event => event.event === 'FundDeployed')

  const Fund = await ethers.getContractFactory("Fund")
  const fund = Fund.attach(fundCreatedEvent.args.fund)

  // Find the FundInitialised event within the Fund contract
  const fundInitialisedEvent = await fund.queryFilter(fund.filters.FundInitialised(), txReceipt.blockHash);

  expect(fundInitialisedEvent.length).to.equal(1); // Ensure only one FundInitialised event was emitted
  expect(fundInitialisedEvent[0].args.attributes[0]).to.equal(0)
  expect(fundInitialisedEvent[0].args.attributes[4]).to.equal('A test fund')
  expect(fundInitialisedEvent[0].args.attributes[5]).to.equal('description')

  return fund
}

// Export the functions
module.exports = {
  deploy,
  deployFundImplementation,
  deployGenerator,
  deployTreasury,
  getTypedData,
  getRevertReason,
  getCurrentBlockTime,
  deployMockToken,
  deployMockOETHToken,
  generateMintRequest,
  makeFund
}