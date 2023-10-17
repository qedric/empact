export function deployContracts(_name, _symbol, _feeRecipient, _royaltyBps) {

  const Factory = await ethers.getContractFactory("Factory")
  const FundImplementation = await ethers.getContractFactory("Fund")
  const Generator = await ethers.getContractFactory("Generator_v1")
  const Treasury = await ethers.getContractFactory("Treasury")
  
  // deploy the generator contract
  const generator = await Generator.deploy()
  await generator.deployed()

  // deploy the factory
  const cryptofunds = await Factory.deploy(_name, _symbol, _feeRecipient, _royaltyBps)
  // wait for it to finish deploying
  await cryptofunds.deployed()

  // deploy the treasury
  const treasury = await Treasury.deploy(cryptofunds.address)
  await treasury.deployed()

  // deploy the fund implementation that will be cloned for each new fund
  const fundImplementation = await FundImplementation.deploy(cryptofunds.address)
  await fundImplementation.deployed()

  //set the implementation in the contract
  await cryptofunds.setFundImplementation(fundImplementation.address)

  //set the generator in the contract
  await cryptofunds.setGenerator(generator.address)

  //set the generator in the contract
  await cryptofunds.setTreasury(treasury.address)

  //console.log('factory address:', cryptofunds.address)
  //console.log('fund address:', fundImplementation.address)

  return cryptofunds
}

export async function getTypedData(
  cryptofunds,
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
      verifyingContract: cryptofunds.address,
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

export function getRevertReason(error) {
  const startIndex = error.message.indexOf("reverted with reason string '") + "reverted with reason string '".length;
  const endIndex = error.message.length - 1;
  let errorMessage = error.message.slice(startIndex, endIndex);
  errorMessage = errorMessage.slice(0, errorMessage.indexOf("'"));
  return errorMessage;
}

export async function getCurrentBlockTime() {
  const timestamp = await ethers.provider.getBlockNumber().then(blockNumber =>
        // getBlock returns a block object and it has a timestamp property.
        ethers.provider.getBlock(blockNumber).then(block => block.timestamp));
  return timestamp;
}

async function makeFund(
    to = nftOwner.address,
    quantity = 4,
    name = "4 Little Pigs",
    description = "description",
    unlockTimeDays = 99,
    targetBalanceETH = "1",
    feeToSend = "0.004"
)
{

  // Generate a signature for the mint request
  const timestamp = await getCurrentBlockTime()
  const endTime = Math.floor(timestamp + 60) // 1 minute later
  const unlockTime = Math.floor(timestamp + 60 * 60 * 24 * unlockTimeDays)
  const targetBalance = ethers.utils.parseUnits(targetBalanceETH, "ether").toString()
  const makeFundFee = ethers.utils.parseUnits(feeToSend, "ether")

  const typedData = await getTypedData(
    cryptofunds,
    to,
    quantity,
    timestamp,
    endTime,
    name,
    description,
    unlockTime,
    targetBalance
  )

  // Sign the typed data
  const signature = await minter._signTypedData(
    typedData.domain,
    typedData.types,
    typedData.message
  )

  const minterRole = cryptofunds.MINTER_ROLE()
  // grant MINTER role to signer (if not already granted)
  if (!(await cryptofunds.hasRole(minterRole, minter.address))) {
      await cryptofunds.grantRole(minterRole, minter.address)
  }
  const tx = await cryptofunds.connect(nftOwner).mintWithSignature(typedData.message, signature, { value: makeFundFee })
  const txReceipt = await tx.wait()

  // const mintedEvent = txReceipt.events.find(event => event.event === 'TokensMintedWithSignature')
  const fundCreatedEvent = txReceipt.events.find(event => event.event === 'FundDeployed')

  const Fund = await ethers.getContractFactory("Fund")
  const fund = Fund.attach(fundCreatedEvent.args.fund)

  /*const attributes = await fund.attributes()
  console.log(attributes)*/

  return fundCreatedEvent.args.fund
}

export async function deployMockToken(name, symbol) {
  const MockToken = await ethers.getContractFactory("MockToken");
  const token = await MockToken.deploy(name, symbol);
  await token.deployed();
  return token;
}

export async function deployMockFund(owner) {
  const MockFund = await ethers.getContractFactory("MockFund");
  const fund = await MockFund.deploy(owner);
  await fund.deployed();
  return fund;
}