const { expect, assert } = require("chai")
const { ethers, upgrades, network } = require("hardhat")
const helpers = require("@nomicfoundation/hardhat-network-helpers")
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

async function deployVaultImplementation(factory_address, treasury_address) {

  const VaultImplementation = await ethers.getContractFactory("Vault")

  // deploy the vault implementation that will be cloned for each new vault
  const vaultImplementation = await VaultImplementation.deploy(factory_address, treasury_address)
  await vaultImplementation.waitForDeployment()

  return vaultImplementation
}

async function deployGenerator(contractName, chainSymbol, tokenUrlPrefix, factory_address) {

  const Generator = await ethers.getContractFactory(contractName)

  // deploy the generator contract
  const generator = await Generator.deploy(chainSymbol, tokenUrlPrefix, factory_address)
  await generator.waitForDeployment()

  return generator
}

async function deployTreasury(factory_address) {

  const Treasury = await ethers.getContractFactory("Treasury")

  // deploy the treasury
  const treasury = await Treasury.deploy(factory_address)
  await treasury.waitForDeployment()

  return treasury
}

async function deploy(feeRecipient, chainSymbol, tokenUrlPrefix) {

  const Factory = await ethers.getContractFactory("Factory")

  // deploy the factory
  const factory = await Factory.deploy(feeRecipient)
  await factory.waitForDeployment()

  // deploy the generator contract
  const generator = await deployGenerator('Generator', chainSymbol, tokenUrlPrefix, factory.target)

  // deploy the treasury
  const treasury = await deployTreasury(factory.target)

  // deploy the vault implementation that will be cloned for each new vault
  const vaultImplementation = await deployVaultImplementation(factory.target, treasury.target)

  //set the implementation in the contract
  await factory.setVaultImplementation(vaultImplementation.target)

  //set the generator in the contract
  await factory.setGenerator(generator.target)

  //set the generator in the contract
  await factory.setTreasury(treasury.target)

/*  console.log('factory address:', factory.target)
  console.log('vault address:', vaultImplementation.target)*/

  return { factory, treasury, generator }
}

async function getTypedData(
  factory_address,
  to,
  baseToken,
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
        { name: "baseToken", type: "address" },
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
      baseToken: baseToken,
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
  await token.waitForDeployment();
  return token;
}

async function deployMockOETHToken() {
  const MockOETHoken = await ethers.getContractFactory("MockOETHToken")
  const token = await MockOETHoken.deploy('Origin Protocol Mock Token', 'mOETH')
  await token.waitForDeployment()
  return token
}

async function generateMintRequest(factory_address, signer, to_address, typedData) {
  // Generate a signature for the mint request
  const timestamp = await getCurrentBlockTime()

  const endTime = Math.floor(timestamp + 60 * 60 * 24)
  const unlockTime = Math.floor(timestamp + 60 * 60 * 24 * 99)
  const targetBalance = ethers.parseUnits("1", "ether").toString()

  if (!typedData) {
    typedData = await getTypedData(
      factory_address,
      to_address,
      ZERO_ADDRESS,
      timestamp,
      endTime,
      4,
      unlockTime,
      targetBalance,
      'A test vault',
      'description'    
    )
  }

  // Sign the typed data
  const signature = await signer.signTypedData(
    typedData.domain,
    typedData.types,
    typedData.message
  )

  return { signature, typedData }
}

async function makeVault(factory, signer, to) {
  const mintRequest = await generateMintRequest(factory.target, signer, to.address)
  
  const makeVaultFee = ethers.parseUnits("0.004", "ether")

  const tx = await factory.connect(to).mintWithSignature(mintRequest.typedData.message, mintRequest.signature, { value: makeVaultFee })
  const txReceipt = await tx.wait()

  //const vaultCreatedEvent = await factory.queryFilter(factory.filters.VaultDeployed(), txReceipt.blockHash)
  const vaultCreatedEvent = await factory.queryFilter(factory.filters.VaultDeployed(), -1)
  const Vault = await ethers.getContractFactory("Vault")
  const vault = Vault.attach(vaultCreatedEvent[0].args[0])

  // Find the VaultInitialised event within the Vault contract
  const vaultInitialisedEvent = await vault.queryFilter(vault.filters.VaultInitialised(), -1);
  
  //console.log(vaultInitialisedEvent[0].args)
  
  expect(vaultInitialisedEvent.length).to.equal(1); // Ensure only one VaultInitialised event was emitted
  expect(vaultInitialisedEvent[0].args.attributes[0]).to.equal(ZERO_ADDRESS)
  expect(vaultInitialisedEvent[0].args.attributes[1]).to.equal(0)
  expect(vaultInitialisedEvent[0].args.attributes[5]).to.equal('A test vault')
  expect(vaultInitialisedEvent[0].args.attributes[6]).to.equal('description')

  return vault
}

async function make10K_decimalVault(factory, signer, to, baseToken, decimals) {

  const timestamp = await getCurrentBlockTime()
  const targetBalance = ethers.parseUnits("10000", decimals).toString()

  const typedData = await getTypedData(
    factory.target,
    to.address,
    baseToken || ZERO_ADDRESS,
    timestamp,
    Math.floor(timestamp + 60 * 60 * 24),
    100,
    timestamp,
    targetBalance,
    `A 10K ${decimals} decimal test vault`,
    'no unlock time'    
  )

  const mintRequest = await generateMintRequest(factory.target, signer, to.address, typedData)
  const makeVaultFee = ethers.parseUnits("0.004", "ether")

  const tx = await factory.connect(to).mintWithSignature(mintRequest.typedData.message, mintRequest.signature, { value: makeVaultFee })
  const txReceipt = await tx.wait()

  const vaultCreatedEvent = await factory.queryFilter(factory.filters.VaultDeployed(), -1)
  const Vault = await ethers.getContractFactory("Vault")
  const vault = Vault.attach(vaultCreatedEvent[0].args[0])

  // Find the VaultInitialised event within the Vault contract
  const vaultInitialisedEvent = await vault.queryFilter(vault.filters.VaultInitialised(), -1);
  expect(vaultInitialisedEvent.length).to.equal(1); // Ensure only one VaultInitialised event was emitted
  expect(vaultInitialisedEvent[0].args.attributes[5]).to.equal(`A 10K ${decimals} decimal test vault`)
  expect(vaultInitialisedEvent[0].args.attributes[6]).to.equal('no unlock time')

  return vault
}

async function makeVault_100edition_target100_noUnlockTime(factory, signer, to, baseToken, name) {

  const finalName = name || 'A 100-edition test vault'
  const timestamp = await getCurrentBlockTime()
  const targetBalance = ethers.parseUnits("100", 18).toString()
  const typedData = await getTypedData(
    factory.target,
    to.address,
    baseToken || ZERO_ADDRESS,
    timestamp,
    Math.floor(timestamp + 60 * 60 * 24),
    100,
    timestamp,
    targetBalance,
    finalName,
    'no unlock time'    
  )

  const mintRequest = await generateMintRequest(factory.target, signer, to.address, typedData)

  const makeVaultFee = ethers.parseUnits("0.004", "ether")

  const tx = await factory.connect(to).mintWithSignature(mintRequest.typedData.message, mintRequest.signature, { value: makeVaultFee })
  const txReceipt = await tx.wait()

  //console.log('block number:',txReceipt.blockNumber)
  //const vaultCreatedEvent = await factory.queryFilter(factory.filters.VaultDeployed(), txReceipt.blockHash)
  const vaultCreatedEvent = await factory.queryFilter(factory.filters.VaultDeployed(), txReceipt.blockNumber)

  //console.log('\nvault created: \n', vaultCreatedEvent)
  const Vault = await ethers.getContractFactory("Vault")
  const vault = Vault.attach(vaultCreatedEvent[0].args[0])

  // Find the VaultInitialised event within the Vault contract
  const vaultInitialisedEvent = await vault.queryFilter(vault.filters.VaultInitialised(), -1);
  expect(vaultInitialisedEvent.length).to.equal(1); // Ensure only one VaultInitialised event was emitted
  expect(vaultInitialisedEvent[0].args.attributes[5]).to.equal(finalName)
  expect(vaultInitialisedEvent[0].args.attributes[6]).to.equal('no unlock time')

  return vault
}

async function makeVault_100edition_notarget_99days(factory, signer, to) {

  const timestamp = await getCurrentBlockTime()
  const typedData = await getTypedData(
    factory.target,
    to.address,
    ZERO_ADDRESS,
    timestamp,
    Math.floor(timestamp + 60 * 60 * 24),
    100,
    Math.floor(timestamp + 60 * 60 * 24 * 99),
    0,
    'A 100-edition test vault',
    '99 days, no target'    
  )

  const mintRequest = await generateMintRequest(factory.target, signer, to.address, typedData)

  const makeVaultFee = ethers.parseUnits("0.004", "ether")

  const tx = await factory.connect(to).mintWithSignature(mintRequest.typedData.message, mintRequest.signature, { value: makeVaultFee })
  const txReceipt = await tx.wait()

  const vaultCreatedEvent = await factory.queryFilter(factory.filters.VaultDeployed(), -1)
  const Vault = await ethers.getContractFactory("Vault")
  const vault = Vault.attach(vaultCreatedEvent[0].args[0])

  // Find the VaultInitialised event within the Vault contract
  const vaultInitialisedEvent = await vault.queryFilter(vault.filters.VaultInitialised(), -1);
  expect(vaultInitialisedEvent.length).to.equal(1); // Ensure only one VaultInitialised event was emitted
  expect(vaultInitialisedEvent[0].args.attributes[1]).to.equal(2)
  expect(vaultInitialisedEvent[0].args.attributes[5]).to.equal('A 100-edition test vault')
  expect(vaultInitialisedEvent[0].args.attributes[6]).to.equal('99 days, no target')

  return vault
}

async function makeLockedVault(factory, signer, to, baseToken) {

  // get new vault: 
  const v = await makeVault_100edition_target100_noUnlockTime(factory, signer, to, baseToken, 'Locked Vault')

  // verify that it is locked
  expect(await v.state()).to.equal(0)

  return v
}

async function makeUnlockedVault(factory, signer, to) {

  // get new vault: 
  const v = await makeLockedVault(factory, signer, to)

  // send ETH to unlock it:
  let tokenAmount = ethers.parseUnits("100", 18)
  await signer.sendTransaction({
    to: v.target,
    value: tokenAmount,
  })

  // verify that it is unlocked
  expect(await v.state()).to.equal(1)

  return v
}

async function makeOpenVault(factory, signer, to) {

  // get new Locked vault: 
  const v = await makeUnlockedVault(factory, signer, to)

  // get the tokenId so we can call payout on it
  const tokenId = await v.attributes().then(a => a.tokenId)

  // call payout to open it
  let tx = await factory.connect(to).payout(tokenId)
  tx.wait()

  // verify that it is open
  expect(await v.state()).to.equal(2)

  return v
}

// Export the functions
module.exports = {
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
  makeLockedVault,
  makeUnlockedVault,
  makeOpenVault,
  makeVault_100edition_target100_noUnlockTime,
  makeVault_100edition_notarget_99days,
  make10K_decimalVault
}