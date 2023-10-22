const { expect, assert } = require("chai")
const { ethers, upgrades, network } = require("hardhat")
const helpers = require("@nomicfoundation/hardhat-network-helpers")

async function deploy(feeRecipient) {

  const Factory = await ethers.getContractFactory("Factory")
  const FundImplementation = await ethers.getContractFactory("Fund")
  const Generator = await ethers.getContractFactory("Generator_v1")
  const Treasury = await ethers.getContractFactory("Treasury")
  
  // deploy the generator contract
  const generator = await Generator.deploy()
  await generator.deployed()

  // deploy the factory
  const factory = await Factory.deploy(feeRecipient)
  // wait for it to finish deploying
  await factory.deployed()

  // deploy the treasury
  const treasury = await Treasury.deploy(factory.address)
  await treasury.deployed()

  // deploy the fund implementation that will be cloned for each new fund
  const fundImplementation = await FundImplementation.deploy(factory.address, treasury.address)
  await fundImplementation.deployed()

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
  quantity,
  validityStartTimestamp,
  validityEndTimestamp,
  name,
  description,
  unlockTime,
  targetBalance
) {
  return {
    types: {
      MintRequest: [
        { name: "to", type: "address" },
        { name: "quantity", type: "uint256" },
        { name: "validityStartTimestamp", type: "uint128" },
        { name: "validityEndTimestamp", type: "uint128" },
        { name: "name", type: "string" },
        { name: "description", type: "string" },
        { name: "unlockTime", type: "uint256" },
        { name: "targetBalance", type: "uint256" }
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
      quantity: quantity,
      validityStartTimestamp: validityStartTimestamp,
      validityEndTimestamp: validityEndTimestamp,
      name: name,
      description: description,
      unlockTime: unlockTime,
      targetBalance: targetBalance
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

async function generateMintRequest(factory_address, signer, to_address) {
  // Generate a signature for the mint request
  const timestamp = await ethers.provider.getBlockNumber().then(blockNumber =>
    // getBlock returns a block object and it has a timestamp property.
    ethers.provider.getBlock(blockNumber).then(block => block.timestamp))

  const endTime = Math.floor(timestamp + 60 * 60 * 24)
  const unlockTime = Math.floor(timestamp + 60 * 60 * 24 * 99)
  const targetBalance = ethers.utils.parseUnits("1", "ether").toString()

  const typedData = await getTypedData(
    factory_address,
    to_address,
    4,
    timestamp,
    endTime,
    'A test fund',
    'description',
    unlockTime,
    targetBalance
  )

  // Sign the typed data
  const signature = await signer._signTypedData(
    typedData.domain,
    typedData.types,
    typedData.message
  )

  return { signature, typedData }
}

async function makeFund(factory, signer, to) {
  const mintRequest = generateMintRequest(factory.address, signer, to)
  
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

  return fundCreatedEvent
}

// Export the functions
module.exports = {
  deploy,
  getTypedData,
  getRevertReason,
  getCurrentBlockTime,
  deployMockToken,
  generateMintRequest,
  makeFund
}