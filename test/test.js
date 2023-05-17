// We import Chai to use its asserting functions here.
const { expect, assert } = require("chai");
const { ethers, upgrades, network } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");

const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000'

async function getTypedData(
  cryptoPiggies,
  to,
  quantity,
  validityStartTimestamp,
  validityEndTimestamp,
  name,
  description,
  externalUrl,
  metadata,
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
        { name: "externalUrl", type: "string" },
        { name: "metadata", type: "string" },
        { name: "unlockTime", type: "uint256" },
        { name: "targetBalance", type: "uint256" }
      ],
    },
    domain: {
      name: 'SignatureMintERC1155',
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: cryptoPiggies.address,
    },
    primaryType: 'MintRequest',
    message: {
      to: to,
      quantity: quantity,
      validityStartTimestamp: validityStartTimestamp,
      validityEndTimestamp: validityEndTimestamp,
      name: name,
      description: description,
      externalUrl: externalUrl,
      metadata: metadata,
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

// `describe` is a Mocha function that allows you to organize your tests. It's
// not actually needed, but having your tests organized makes debugging them
// easier. All Mocha functions are available in the global scope.

// `describe` receives the name of a section of your test suite, and a callback.
// The callback must define the tests of that section. This callback can't be
// an async function.
describe("Testing CryptoPiggies", function () {
  // Mocha has four functions that let you hook into the the test runner's
  // lifecyle. These are: `before`, `beforeEach`, `after`, `afterEach`.

  // They're very useful to setup the environment for tests, and to clean it
  // up after they run.

  // A common pattern is to declare some variables, and assign them in the
  // `before` and `beforeEach` callbacks.

  let utils, piggyBankImplementation, cryptoPiggies;

  let owner, newOwner, nonOwner
  let minter, newMinter, nonMinter
  let nftOwner, nonNftOwner
  let feeRecipient, newFeeRecipient

  async function makePiggy(
    to = nftOwner.address,
    quantity = 4,
    name = "4 Little Pigs",
    description = "description",
    externalUrl = "externalUrl",
    metadata = "metadata",
    unlockTimeDays = 99,
    targetBalanceETH = "1",
    feeToSend = "0.004"
  ) {
  
    // Generate a signature for the mint request
    const timestamp = await getCurrentBlockTime();
    const endTime = Math.floor(timestamp + 60); // 1 minute later
    const unlockTime = Math.floor(timestamp + 60 * 60 * 24 * unlockTimeDays);
    const targetBalance = ethers.utils.parseUnits(targetBalanceETH, "ether").toString();
    const makePiggyFee = ethers.utils.parseUnits(feeToSend, "ether");

    const typedData = await getTypedData(
      cryptoPiggies,
      to,
      quantity,
      timestamp,
      endTime,
      name,
      description,
      externalUrl,
      metadata,
      unlockTime,
      targetBalance
    )

    // Sign the typed data
    const signature = await minter._signTypedData(
      typedData.domain,
      typedData.types,
      typedData.message
    );

    const minterRole = cryptoPiggies.MINTER_ROLE()
    // grant MINTER role to signer (if not already granted)
    if (!(await cryptoPiggies.hasRole(minterRole, minter.address))) {
        await cryptoPiggies.grantRole(minterRole, minter.address);
    }
    const tx = await cryptoPiggies.connect(nftOwner).mintWithSignature(typedData.message, signature, { value: makePiggyFee });
    const txReceipt = await tx.wait();

    // const mintedEvent = txReceipt.events.find(event => event.event === 'TokensMintedWithSignature');
    const piggyCreatedEvent = txReceipt.events.find(event => event.event === 'ProxyDeployed');

    const PiggyBank = await ethers.getContractFactory("PiggyBank");
    const piggyBank = PiggyBank.attach(piggyCreatedEvent.args.deployedProxy);

    /*const attributes = await piggyBank.attributes();
    console.log(attributes)*/

    return piggyCreatedEvent.args.deployedProxy;

  }

  // `beforeEach` will run before each test, re-deploying the contract every
  // time. It receives a callback, which can be async.
  beforeEach(async function () {
    
    [owner, newOwner, minter, newMinter, nonOwner, nonMinter, nftOwner, nonNftOwner, feeRecipient, newFeeRecipient] = await ethers.getSigners();

    const PiggyBankImplementation = await ethers.getContractFactory("PiggyBank");
    const Utils = await ethers.getContractFactory("CP_Utils_v1");
    
    utils = await Utils.deploy();

    const Factory = await ethers.getContractFactory("CryptoPiggies", {
      libraries: {
        CP_Utils_v1: utils.address,
      }}
    );

    const _name = 'CryptoPiggies_HH_TEST'
    const _symbol = 'CPG'
    const _royaltyRecipient = owner.address
    const _royaltyBps = '400'
    const _feeRecipient = feeRecipient.address;

    // deploy
    cryptoPiggies = await Factory.deploy(_name, _symbol, _royaltyRecipient, _royaltyBps, _feeRecipient);
    
    // init the implementation
    await cryptoPiggies.deployed();

    piggyBankImplementation = await PiggyBankImplementation.deploy(cryptoPiggies.address);
    await piggyBankImplementation.deployed();

    //set the implementation in the contract
    await cryptoPiggies.setPiggyBankImplementation(piggyBankImplementation.address);


    //console.log('factory address:', cryptoPiggies.address)
    //console.log('piggyBank address:', piggyBankImplementation.address)

    // Wait for this transaction to be mined
    

    // set permission

  });

  // You can nest describe calls to create subsections.
  describe("Deployment", function () {
    // `it` is another Mocha function. This is the one you use to define your
    // tests. It receives the test name, and a callback function.

    // If the callback function is async, Mocha will `await` it.
    it("Should set the right factory owner", async function () {

      // Expect receives a value, and wraps it in an Assertion object. These
      // objects have a lot of utility methods to assert values.

      // This test expects the owner variable stored in the contract to be equal
      // to our Signer's owner.
      expect(await cryptoPiggies.owner()).to.equal(owner.address);
    });

    it("Should set the correct fee recipient", async function () {
      const actualFeeRecipient = await cryptoPiggies.feeRecipient();
      expect(actualFeeRecipient).to.equal(feeRecipient.address);
    });

  });

  describe("Permissions", function () {

    beforeEach(async function () {
      //await cryptoPiggies.connect(owner).grantRole(DEFAULT_ADMIN_ROLE, owner.address);
    });

    it("should allow factory contract owner to grant an address the MINTER Role", async function () {
      await cryptoPiggies.connect(owner).grantRole(await cryptoPiggies.MINTER_ROLE(), minter.address);
      const isMinter = await cryptoPiggies.hasRole(await cryptoPiggies.MINTER_ROLE(), minter.address);
      assert(isMinter);
    });

    it("should fail if non factory contract owner tries to grant an address the MINTER Role", async function () {
      await expect(cryptoPiggies.connect(nonOwner).grantRole(await cryptoPiggies.MINTER_ROLE(), minter.address)).to.be.revertedWith(
      /Permissions: account .* is missing role .*/);
    });

    it("should fail if non factory contract owner tries to grant an address the MINTER_ROLE", async function () {
      const theTrueOwner = await cryptoPiggies.owner();
      assert.notEqual(nonOwner.address, theTrueOwner, "nonOwner should not be the contract owner");

      // You can also check if nonOwner doesn't have the MINTER_ROLE
      const minterRole = await cryptoPiggies.MINTER_ROLE();
      const hasMinterRole = await cryptoPiggies.hasRole(minterRole, nonOwner.address);
      assert.isFalse(hasMinterRole, "nonOwner should not have the MINTER_ROLE");

      await expect(cryptoPiggies.connect(nonOwner).grantRole(minterRole, minter.address)).to.be.revertedWith(
        /Permissions: account .* is missing role .*/
      );
    });

    it("should allow factory contract owner to revoke MINTER Role for a given address", async function () {
      await cryptoPiggies.grantRole(await cryptoPiggies.MINTER_ROLE(), minter.address);
      await cryptoPiggies.revokeRole(await cryptoPiggies.MINTER_ROLE(), minter.address);
      const isMinter = await cryptoPiggies.hasRole(await cryptoPiggies.MINTER_ROLE(), minter.address);
      assert(!isMinter);
    });

    it("should fail if non factory contract owner tries to revoke the MINTER Role for a given address", async function () {
      await cryptoPiggies.grantRole(await cryptoPiggies.MINTER_ROLE(), minter.address);
      await expect(
        cryptoPiggies.connect(newOwner).revokeRole(await cryptoPiggies.MINTER_ROLE(), minter.address)
      ).to.be.revertedWith(/Permissions: account .* is missing role .*/);
    });

    it("should allow factory contract owner to appoint a new owner", async function () {
      const theTrueFirstOwner = await cryptoPiggies.owner();
      assert.notEqual(newOwner.address, theTrueFirstOwner, "newOwner should not already be the contract owner");

      await cryptoPiggies.setOwner(newOwner.address);
      const theTrueNewOwner = await cryptoPiggies.owner();
      assert.equal(theTrueNewOwner, newOwner.address);
    });

    it("should fail if non factory contract owner tries to appoint a new owner", async function () {
      const theTrueFirstOwner = await cryptoPiggies.owner();
      assert.notEqual(nonOwner.address, theTrueFirstOwner, "nonOwner should not be the contract owner");
     await expect(
        cryptoPiggies.connect(nonOwner).setOwner(newOwner.address),
      ).to.be.revertedWith("Not authorized");
    });

    it("should fail if a non-admin tries to set a new fee recipient", async function() {
       // Attempt to set a new fee recipient from a non-admin account
      await expect(
        cryptoPiggies.connect(nonOwner).setFeeRecipient(newFeeRecipient.address)
      ).to.be.revertedWith("Not authorized");
    });

  });

  describe("Minting", function () {

    it('should sign typed data correctly', async () => {
      // Define the typed data to be signed

      const timestamp = await ethers.provider.getBlockNumber().then(blockNumber =>
        // getBlock returns a block object and it has a timestamp property.
        ethers.provider.getBlock(blockNumber).then(block => block.timestamp));

      const endTime = Math.floor(timestamp + 60 * 60 * 24);
      const unlockTime = Math.floor(timestamp + 60 * 60 * 24 * 99);

      const targetBalance = ethers.utils.parseUnits("1", "ether").toString();

      const typedData = await getTypedData(
        cryptoPiggies,
        nftOwner.address,
        22,
        timestamp,
        endTime,
        'Harry',
        'description',
        'externalUrl',
        'metadata',
        unlockTime,
        targetBalance
      )

      // Sign the typed data
      const signature = await minter._signTypedData(
        typedData.domain,
        typedData.types,
        typedData.message
      );

      // Recover the signer's address from the signature
      const recoveredAddress = ethers.utils.verifyTypedData(
        typedData.domain,
        typedData.types,
        typedData.message,
        signature
      );

      // Check if the recovered address matches the signer's address
      expect(recoveredAddress).to.equal(minter.address);
    });

    it("should allow a user to mint a new token with a signature", async () => {

      // Generate a signature for the mint request
      const timestamp = await getCurrentBlockTime();

      const endTime = Math.floor(timestamp + 60 * 60 * 24);
      const unlockTime = Math.floor(timestamp + 60 * 60 * 24 * 99);
      const targetBalance = ethers.utils.parseUnits("1", "ether").toString();

      const makePiggyFee = ethers.utils.parseUnits("0.004", "ether");

      const typedData = await getTypedData(
        cryptoPiggies,
        nftOwner.address,
        4,
        timestamp,
        endTime,
        '4 Little Pigs',
        'description',
        'externalUrl',
        'metadata',
        unlockTime,
        targetBalance
      )

      // Sign the typed data
      const signature = await minter._signTypedData(
        typedData.domain,
        typedData.types,
        typedData.message
      );

      // grant MINTER role to signer
      await cryptoPiggies.grantRole(await cryptoPiggies.MINTER_ROLE(), minter.address);

      const tx = await cryptoPiggies.connect(nftOwner).mintWithSignature(typedData.message, signature, { value: makePiggyFee });

      // Verify that the token was minted and assigned to the correct recipient
      const balance = await cryptoPiggies.balanceOf(nftOwner.address, 0);
      expect(balance).to.equal(4);
    });

    it("should not allow the same signature to be used twice", async function() {

      // grant MINTER role to signer
      await cryptoPiggies.grantRole(await cryptoPiggies.MINTER_ROLE(), minter.address);

      const timestamp = await ethers.provider.getBlockNumber().then(blockNumber =>
        // getBlock returns a block object and it has a timestamp property.
        ethers.provider.getBlock(blockNumber).then(block => block.timestamp));

      const endTime = Math.floor(timestamp + 60 * 60 * 24);
      const unlockTime = Math.floor(timestamp + 60 * 60 * 24 * 99);

      const targetBalance = ethers.utils.parseUnits("1", "ether").toString();
      const makePiggyFee = ethers.utils.parseUnits("0.004", "ether");

      const typedData = await getTypedData(
        cryptoPiggies,
        nftOwner.address,
        22,
        timestamp,
        endTime,
        'Harry',
        'description',
        'externalUrl',
        'metadata',
        unlockTime,
        targetBalance
      )

      // Sign the typed data
      const signature = await minter._signTypedData(
        typedData.domain,
        typedData.types,
        typedData.message
      );

      const tx1 = await cryptoPiggies.connect(nftOwner).mintWithSignature(typedData.message, signature, { value: makePiggyFee });

      // Verify that the token was minted and assigned to the correct recipient
      const balance = await cryptoPiggies.balanceOf(nftOwner.address, 0);
      expect(balance).to.equal(22);

      // Try to mint again with the same request:
      await expect(cryptoPiggies.connect(nftOwner).mintWithSignature(
        typedData.message, signature, { value: makePiggyFee })).to.be.revertedWith("Signature has already been used");

    });

    it("should not allow a signature to be used before the start time", async function() {

      // Generate a signature for the mint request
      const timestamp = await getCurrentBlockTime();
      const startTime = Math.floor(timestamp + 60 * 60 * 24); // +1 day
      const endTime = Math.floor(timestamp + 60 * 60 * 24 * 2); // + 2 days
      const unlockTime = Math.floor(timestamp + 60 * 60 * 24 * 99);
      const targetBalance = ethers.utils.parseUnits("1", "ether").toString();

      const makePiggyFee = ethers.utils.parseUnits("0.004", "ether");

      const typedData = await getTypedData(
        cryptoPiggies,
        nftOwner.address,
        4,
        startTime,
        endTime,
        '4 Little Pigs',
        'description',
        'externalUrl',
        'metadata',
        unlockTime,
        targetBalance
      )

      // Sign the typed data
      const signature = await minter._signTypedData(
        typedData.domain,
        typedData.types,
        typedData.message
      );

      // grant MINTER role to signer
      await cryptoPiggies.grantRole(await cryptoPiggies.MINTER_ROLE(), minter.address);

      await expect(cryptoPiggies.connect(nftOwner).mintWithSignature(typedData.message, signature, { value: makePiggyFee })).to.be.revertedWith("Request expired");

    });

    it("should not allow a signature to be used after the expiry time", async function() {

      // Generate a signature for the mint request
      const timestamp = await getCurrentBlockTime();
      const endTime = Math.floor(timestamp + 60 * 60 * 24); // +1 day
      const unlockTime = Math.floor(timestamp + 60 * 60 * 24 * 2); // +2 days
      const targetBalance = ethers.utils.parseUnits("1", "ether").toString();

      const makePiggyFee = ethers.utils.parseUnits("0.004", "ether");

      const typedData = await getTypedData(
        cryptoPiggies,
        nftOwner.address,
        4,
        timestamp,
        endTime,
        '4 Little Pigs',
        'description',
        'externalUrl',
        'metadata',
        unlockTime,
        targetBalance
      )

      // Sign the typed data
      const signature = await minter._signTypedData(
        typedData.domain,
        typedData.types,
        typedData.message
      );

      // grant MINTER role to signer
      await cryptoPiggies.grantRole(await cryptoPiggies.MINTER_ROLE(), minter.address);

      // Increase block time to past the endTime
      await helpers.time.increase(60 * 60 * 24 * 3); // 3 days

      await expect(cryptoPiggies.connect(nftOwner).mintWithSignature(typedData.message, signature, { value: makePiggyFee })).to.be.revertedWith("Request expired");
    }); 

    it("should fail if a user sets unlock date in the past AND targetbalance <= 0", async function () {
      // grant MINTER role to signer
      await cryptoPiggies.grantRole(await cryptoPiggies.MINTER_ROLE(), minter.address);

      const timestamp = await ethers.provider.getBlockNumber().then(blockNumber =>
        // getBlock returns a block object and it has a timestamp property.
        ethers.provider.getBlock(blockNumber).then(block => block.timestamp));

      const endTime = Math.floor(timestamp + 60 * 60 * 24);

      const unlockTime = Math.floor(Date.now() / 1000) - 60; // 60 seconds in the past
      const targetBalance = 0;

      const makePiggyFee = ethers.utils.parseUnits("0.004", "ether");

      const typedData = await getTypedData(
        cryptoPiggies,
        nftOwner.address,
        22,
        timestamp,
        endTime,
        'Harry',
        'description',
        'externalUrl',
        'metadata',
        unlockTime,
        targetBalance
      )

      // Sign the typed data
      const signature = await minter._signTypedData(
        typedData.domain,
        typedData.types,
        typedData.message
      );

      await expect(cryptoPiggies.connect(nftOwner).mintWithSignature(
        typedData.message, signature, { value: makePiggyFee })).to.be.revertedWith("Unlock time should be in the future, or target balance greater than 0");

    });

    it("should fail if a the signer does not have MINTER role", async function () {
      // Generate a signature for the mint request
      const timestamp = await ethers.provider.getBlockNumber().then(blockNumber =>
        // getBlock returns a block object and it has a timestamp property.
        ethers.provider.getBlock(blockNumber).then(block => block.timestamp));

      const endTime = Math.floor(timestamp + 60 * 60 * 24);
      const unlockTime = Math.floor(timestamp + 60 * 60 * 24 * 99);
      const targetBalance = ethers.utils.parseUnits("1", "ether").toString();

      const makePiggyFee = ethers.utils.parseUnits("0.004", "ether");

      const typedData = await getTypedData(
        cryptoPiggies,
        nftOwner.address,
        4,
        timestamp,
        endTime,
        '4 Little Pigs',
        'description',
        'externalUrl',
        'metadata',
        unlockTime,
        targetBalance
      )

      // Sign the typed data
      const signature = await nonMinter._signTypedData(
        typedData.domain,
        typedData.types,
        typedData.message
      );

      await expect(cryptoPiggies.connect(nftOwner).mintWithSignature(typedData.message, signature, { value: makePiggyFee })).to.be.revertedWith("Invalid request");
      
    });

    it("should fail if a the quantity is <= 0", async function () {
      // Generate a signature for the mint request
      const timestamp = await ethers.provider.getBlockNumber().then(blockNumber =>
        // getBlock returns a block object and it has a timestamp property.
        ethers.provider.getBlock(blockNumber).then(block => block.timestamp));

      const endTime = Math.floor(timestamp + 60 * 60 * 24);
      const unlockTime = Math.floor(timestamp + 60 * 60 * 24 * 99);
      const targetBalance = ethers.utils.parseUnits("1", "ether").toString();

      const makePiggyFee = ethers.utils.parseUnits("0.004", "ether");

      const typedData = await getTypedData(
        cryptoPiggies,
        nftOwner.address,
        0,
        timestamp,
        endTime,
        '4 Little Pigs',
        'description',
        'externalUrl',
        'metadata',
        unlockTime,
        targetBalance
      )

      // Sign the typed data
      const signature = await minter._signTypedData(
        typedData.domain,
        typedData.types,
        typedData.message
      );

      // grant MINTER role to signer
      await cryptoPiggies.grantRole(await cryptoPiggies.MINTER_ROLE(), minter.address);
      await expect(cryptoPiggies.connect(nftOwner).mintWithSignature(
        typedData.message, signature, { value: makePiggyFee })).to.be.revertedWith("Minting zero tokens.");

    });
  });

  describe("Burning", function () {

    let piggyBankAddress;

    beforeEach(async function () {
      piggyBankAddress = makePiggy(nftOwner.address,100,"Test Burning","100 Piggies",'','',0,'1','0.004');
      //send 1 ETH
      await nftOwner.sendTransaction({ to: piggyBankAddress, value: ethers.utils.parseEther("1") });      
    });
  
    /*
    // we decided not to include a public burn function
    it("should allow a holder to burn some or all of their tokens", async function () {
      // Assume nftOwner already holds some tokens
      const initialBalance = await cryptoPiggies.balanceOf(nftOwner.address, 0);
      const burnAmount = initialBalance.div(2); // Burn half of their tokens

      await cryptoPiggies.connect(nftOwner).burn(0, burnAmount);

      const newBalance = await cryptoPiggies.balanceOf(nftOwner.address, 0);
      expect(newBalance).to.equal(initialBalance.sub(burnAmount));
    });

    it("should not allow a non-holder to burn tokens", async function () {});

    it("should not allow a the contract owner to burn tokens", async function () {});
    */

    it("should burn all of a holder's tokens when they execute the payout function", async function () {
      
      const piggyBank = await ethers.getContractAt("PiggyBank", piggyBankAddress);

      await cryptoPiggies.connect(nftOwner).payout(0);

      const newBalance = await cryptoPiggies.balanceOf(nftOwner.address, 0);
      expect(newBalance).to.equal(0);
    });

  });

  describe("Payout", function() {

    it("should payout token holder if the unlock time has passed", async function () {

      /*// first make a piggy
      const piggyAddress = makePiggy(
        nftOwner.address,
        4,
        "4 Little Pigs",
        "description",
        "externalUrl",
        ',{"trait_type":"Description","value":"fantastic"}',
        7,
        "4.44"
      );*/

      const piggyAddress = makePiggy(
        nftOwner.address,
        4,
        "4 Little Pigs",
        "description",
        "externalUrl",
        '',
        7,
        "4.44"
      );



      //send enough ETH
      const amountToSend = ethers.utils.parseEther("4.44");

      // Send the ETH to the piggy contract
      await nonOwner.sendTransaction({
        to: piggyAddress,
        value: amountToSend,
      });

      // Check the piggy contract balance is correct
      let piggyBalance = await ethers.provider.getBalance(piggyAddress);
      expect(piggyBalance).to.equal(amountToSend);

      // Increase block time to after the unlockTime
      await helpers.time.increase(60 * 60 * 24 * 7); // 7 days

      console.log(await cryptoPiggies.uri(0));

      //get holders balance before payout
      const initialNftOwnerBalance = await ethers.provider.getBalance(nftOwner.address);

      // should payout all funds
      const tx = await cryptoPiggies.connect(nftOwner).payout(0);
      piggyBalance = await ethers.provider.getBalance(piggyAddress);
      expect(piggyBalance).to.equal(0);

      // get gas used
      const txReceipt = await ethers.provider.getTransactionReceipt(tx.hash);
      const gasCost = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice)
      
      //console.log('gasCost:', gasCost)

      const clonedPiggyBank = await ethers.getContractAt("PiggyBank", piggyAddress);
      const breakPiggyFeeBps = await clonedPiggyBank.breakPiggyFeeBps();
      const attr = await clonedPiggyBank.attributes();
      //console.log(attr);
      //console.log("breakPiggyFeeBps:", breakPiggyFeeBps.toString());

      const PB = await ethers.getContractFactory('PiggyBank');
      const piggyBank = await PB.attach(piggyAddress);
      const breakPiggyFee = await piggyBank.breakPiggyFeeBps();

      //console.log('breakPiggyFeeBPS:', breakPiggyFee)

      //holder should receive all funds minus break fee and gas:
      const nftOwnerBalanceAfterPayout = await ethers.provider.getBalance(nftOwner.address);
      const payoutFee = amountToSend.mul(400).div(10000) // 400 basis points

      const expectedBalanceChange = amountToSend.sub(payoutFee).sub(gasCost);

      expect(nftOwnerBalanceAfterPayout).to.equal(initialNftOwnerBalance.add(expectedBalanceChange));

    });

    it("should payout token holder if the target balance is reached", async function () {

      // first make a piggy
      const piggyAddress = makePiggy(
        nftOwner.address,
        4,
        "4 Little Pigs",
        "description",
        "externalUrl",
        "metadata",
        0,
        "4.44"
      );
      
      const halfAmountToSend = ethers.utils.parseEther("2.22");
      const fullAmountToSend = ethers.utils.parseEther("4.44");

      //send some ETH
      await nonOwner.sendTransaction({
        to: piggyAddress,
        value: halfAmountToSend,
      });

      // should not allow payout
      await expect(cryptoPiggies.connect(nftOwner).payout(0)).to.be.revertedWith("Piggy is still hungry!");

      // send some more ETH
      await nonOwner.sendTransaction({
        to: piggyAddress,
        value: halfAmountToSend,
      });

      // Check the piggy contract balance is correct
      let piggyBalance = await ethers.provider.getBalance(piggyAddress);
      expect(piggyBalance).to.equal(ethers.utils.parseEther("4.44"));

      //get holders balance before payout
      const initialNftOwnerBalance = await ethers.provider.getBalance(nftOwner.address);

      // should payout all funds
      const tx = await cryptoPiggies.connect(nftOwner).payout(0);
      piggyBalance = await ethers.provider.getBalance(piggyAddress);
      expect(piggyBalance).to.equal(0);

      // get gas used
      const txReceipt = await ethers.provider.getTransactionReceipt(tx.hash);
      const gasCost = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice)
      
      //console.log('gasCost:', gasCost)

      //holder should receive all funds minus break fee and gas:
      const nftOwnerBalanceAfterPayout = await ethers.provider.getBalance(nftOwner.address);
      const payoutFee = fullAmountToSend.mul(400).div(10000) // 400 basis points

      const expectedBalanceChange = fullAmountToSend.sub(payoutFee).sub(gasCost);

      expect(nftOwnerBalanceAfterPayout).to.equal(initialNftOwnerBalance.add(expectedBalanceChange));
    });

    it("should payout token holder % of balance proportional to token holder's share of token", async function () {

      // first make a piggy
      const piggyAddress = makePiggy(
        nftOwner.address,
        100,
        "100 Little Pigs",
        "description",
        "externalUrl",
        "metadata",
        0,
        "100"
      );
      
      const fullAmountToSend = ethers.utils.parseEther("100");

      // send all the ETH
      await nonOwner.sendTransaction({
        to: piggyAddress,
        value: fullAmountToSend,
      });

      // Check the piggy contract balance is correct
      let piggyBalance = await ethers.provider.getBalance(piggyAddress);
      expect(piggyBalance).to.equal(ethers.utils.parseEther("100"));

      // distribute the token
      await cryptoPiggies.connect(nftOwner).safeTransferFrom(nftOwner.address, newOwner.address, 0, 25, "0x")
      expect(await cryptoPiggies.balanceOf(nftOwner.address, 0)).to.equal(75);
      expect(await cryptoPiggies.balanceOf(newOwner.address, 0)).to.equal(25);

      // HOLDER 1
      const holder1BalanceBeforePayout = await ethers.provider.getBalance(nftOwner.address);

      // should payout 75% of the funds to holder 1, leaving 25% of tokens with holder 2
      let tx = await cryptoPiggies.connect(nftOwner).payout(0);
      expect(await cryptoPiggies.totalSupply(0)).to.equal(25)

      // get gas used
      let txReceipt = await ethers.provider.getTransactionReceipt(tx.hash);
      let gasCost = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice)

      //holder should receive 75% of funds minus break fee and gas:
      const holder1BalanceAfterPayout = await ethers.provider.getBalance(nftOwner.address);
      let payoutFee = ethers.utils.parseEther("75").mul(400).div(10000) // 400 basis points
      let expectedBalanceChange = ethers.utils.parseEther("75").sub(payoutFee).sub(gasCost);

      expect(holder1BalanceAfterPayout).to.equal(holder1BalanceBeforePayout.add(expectedBalanceChange));

      // HOLDER 2:
      const holder2BalanceBeforePayout = await ethers.provider.getBalance(newOwner.address);

      // should payout remaining 25% of the funds to holder 2, leaving 0 tokens
      tx = await cryptoPiggies.connect(newOwner).payout(0);
      expect(await cryptoPiggies.totalSupply(0)).to.equal(0)

      // get gas used
      txReceipt = await ethers.provider.getTransactionReceipt(tx.hash);
      gasCost = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice)
      
      //console.log('gasCost:', gasCost)

      //holder should receive all funds minus break fee and gas:
      const holder2BalanceAfterPayout = await ethers.provider.getBalance(newOwner.address);
      payoutFee = ethers.utils.parseEther("25").mul(400).div(10000) // 400 basis points
      expectedBalanceChange = ethers.utils.parseEther("25").sub(payoutFee).sub(gasCost);

      expect(holder2BalanceAfterPayout).to.equal(holder2BalanceBeforePayout.add(expectedBalanceChange));
    });

    it("should fail if token holder attempts payout before unlockTime", async function () {

      // first make a piggy
      const piggyAddress = makePiggy(
        nftOwner.address,
        4,
        "4 Little Pigs",
        "description",
        "externalUrl",
        "metadata",
        7,
        "4.44"
      );

      //send enough ETH
      const amountToSend = ethers.utils.parseEther("11");

      // Send the ETH to the piggy contract
      await nonOwner.sendTransaction({
        to: piggyAddress,
        value: amountToSend,
      });

      // Check the piggy contract balance is correct
      let piggyBalance = await ethers.provider.getBalance(piggyAddress);
      expect(piggyBalance).to.equal(amountToSend);

      // should not allow payout
      await expect(cryptoPiggies.connect(nftOwner).payout(0)).to.be.revertedWith("You can't withdraw yet");
    });

    it("should fail if token holder attempts payout before target balance is reached", async function () {

      // first make a piggy
      const piggyAddress = makePiggy(
        nftOwner.address,
        4,
        "4 Little Pigs",
        "description",
        "externalUrl",
        "metadata",
        0,
        "10"
      );
      
      const amountToSend = ethers.utils.parseEther("9.999");

      //send some ETH
      await nonOwner.sendTransaction({
        to: piggyAddress,
        value: amountToSend,
      });

      // should not allow payout
      await expect(cryptoPiggies.connect(nftOwner).payout(0)).to.be.revertedWith("Piggy is still hungry!");

    });

    it("should fail if non token holder attempts payout", async function () {
      // first make a piggy
      const piggyAddress = makePiggy(
        nftOwner.address,
        4,
        "4 Little Pigs",
        "description",
        "externalUrl",
        "metadata",
        0,
        "10"
      );
      
      const amountToSend = ethers.utils.parseEther("10");

      //send some ETH
      await nonOwner.sendTransaction({
        to: piggyAddress,
        value: amountToSend,
      });

      // should not allow payout
      await expect(cryptoPiggies.connect(nonNftOwner).payout(0)).to.be.revertedWith("Not authorised!");
    });

    it("should fail if piggy has no money", async function () {

      // first make a piggy
      const piggyAddress = await makePiggy(
        nftOwner.address,
        4,
        "4 Little Pigs",
        "description",
        "externalUrl",
        "metadata",
        1,
        "0",
        "0.004"
      );

      // Increase block time to after the unlockTime
      await helpers.time.increase(60 * 60 * 24 * 7); // 7 days

      // should not allow payout
      await expect(cryptoPiggies.connect(nftOwner).payout(0)).to.be.revertedWith("Piggy is still hungry!");

    });
  });

  describe("Fees", function() {

     it("should set a new fee recipient", async function() {

      // Set a new fee recipient
      await cryptoPiggies.connect(owner).setFeeRecipient(newFeeRecipient.address);

      // Check if the new fee recipient has been set correctly
      const actualFeeRecipient = await cryptoPiggies.feeRecipient();
      expect(actualFeeRecipient).to.equal(newFeeRecipient.address);
     });

     it("should pay the MakePiggyFee to the fee recipient each time a piggy is created", async function () {
       
      const timestamp = await ethers.provider.getBlockNumber().then(blockNumber =>
        // getBlock returns a block object and it has a timestamp property.
        ethers.provider.getBlock(blockNumber).then(block => block.timestamp));

      const endTime = Math.floor(timestamp + 60 * 60 * 24);
      const unlockTime = Math.floor(timestamp + 60 * 60 * 24 * 99);
      const metadata = ',{"display_type":"boost_number","trait_type":"Test value","value":40},{"display_type":"boost_percentage","trait_type":"Test percentage","value": 10}';
      const targetBalance = ethers.utils.parseUnits("1", "ether").toString();
      const makePiggyFee = ethers.utils.parseUnits("0.004", "ether");

      const typedData = await getTypedData(
        cryptoPiggies,
        nftOwner.address,
        11,
        timestamp,
        endTime,
        "Sam the Pig",
        "An accurate description",
        "https://awebsite.org",
        metadata,
        unlockTime,
        targetBalance
      );

      // grant MINTER role to signer
      await cryptoPiggies.grantRole(await cryptoPiggies.MINTER_ROLE(), minter.address);

      // Sign the typed data
      const signature = await minter._signTypedData(
        typedData.domain,
        typedData.types,
        typedData.message
      );

       // Recover the signer's address from the signature
      const recoveredAddress = ethers.utils.verifyTypedData(
        typedData.domain,
        typedData.types,
        typedData.message,
        signature
      );

      const initialBalance = await ethers.provider.getBalance(feeRecipient.address);

      const tx = await cryptoPiggies.connect(nftOwner).mintWithSignature(typedData.message, signature, { value: makePiggyFee });
      
      /*const nft1 = await cryptoPiggies.uri(0);
      console.log(nft1)*/

      /*// get gas used
      const txReceipt = await ethers.provider.getTransactionReceipt(tx.hash);
      const gasCost = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice)
      const expectedBalanceChange = makePiggyFee.sub(gasCost);
      console.log('gasCost:', gasCost)
      console.log(txReceipt)
      console.log('expectedBalanceChange:', expectedBalanceChange)*/

      const newBalance = await ethers.provider.getBalance(feeRecipient.address);

      expect(newBalance.sub(initialBalance)).to.equal(makePiggyFee);

     });

     it("should pay the BreakPiggyFee to the fee recipient with each payout", async function () {
      const initialFeeRecipientBalance = await ethers.provider.getBalance(feeRecipient.address);

      // first make a piggy
      const piggyAddy = makePiggy(
        nftOwner.address,
        4,
        "4 Little Pigs",
        "description",
        "externalUrl",
        "metadata",
        0,
        "1"
      );

      // Define the amount of ETH you want to send (in wei)
      const amountToSend = ethers.utils.parseEther("1"); // 1 ETH

      // send some ETH to the piggy
      await nonOwner.sendTransaction({
        to: piggyAddy,
        value: amountToSend,
      });

      await cryptoPiggies.connect(nftOwner).payout(0);
      const newBalance = await cryptoPiggies.balanceOf(nftOwner.address, 0);
      expect(newBalance).to.equal(0);

      // Calculate the expected BreakPiggyFee paid to the fee recipient
      const breakPiggyFeeBPS = 400;
      let expectedFee = amountToSend.mul(breakPiggyFeeBPS).div(10000); // 4% of 1 ETH
      // don't forget the makePiggyFee
      expectedFee = expectedFee.add(ethers.utils.parseEther("0.004"));

      // Check the fee recipient's balance after the payout
      const finalFeeRecipientBalance = await ethers.provider.getBalance(feeRecipient.address);
      expect(finalFeeRecipientBalance.sub(initialFeeRecipientBalance)).to.equal(expectedFee);
     });

     it("should change the MakePiggyFee", async function () {

      const newMakePiggyFee = ethers.utils.parseEther("0.02");

      await cryptoPiggies.setMakePiggyFee(newMakePiggyFee);
      const updatedMakePiggyFee = await cryptoPiggies.makePiggyFee();

      expect(updatedMakePiggyFee).to.equal(newMakePiggyFee);
     });

     it("should change the BreakPiggyFee", async function () {
      // Use the helper function to create a new piggy contract
      /* const piggyAddress = await makePiggy();
      const PB = await ethers.getContractFactory('PiggyBank');
      const piggyBank = await PB.attach(piggyAddress);*/

      const newBreakPiggyFee = 200;

      await cryptoPiggies.setBreakPiggyBps(newBreakPiggyFee);
      const updatedBreakPiggyFee = await cryptoPiggies.breakPiggyFeeBps();

      expect(updatedBreakPiggyFee).to.equal(newBreakPiggyFee);
     });

     it("should fail when trying to mint a piggy sending less than the MakePiggyFee", async function () {
      await expect(makePiggy(nftOwner.address,44,"44 Little Pigs","description","externalUrl","metadata",0,"1","0.003")).to.be.revertedWith("Must send the correct fee");
     });

     it("should fail when trying to set the BreakPiggyFee higher than the max allowed", async function () {
      const newBreakPiggyFee = 901;

      await expect(cryptoPiggies.setBreakPiggyBps(newBreakPiggyFee)).to.be.revertedWith("Don't be greedy!");
     });   

  });

  describe("Transactions", function () {

    it("should be able to send ETH to the piggy contract", async function () {
      // Use the helper function to create a new piggy contract
      const piggyAddress = await makePiggy();

      // Define the amount of ETH you want to send (in wei)
      const amountToSend = ethers.utils.parseEther("1.2345");

      // Send the ETH to the piggy contract
      await nonOwner.sendTransaction({
        to: piggyAddress,
        value: amountToSend,
      });

      // Check the piggy contract balance
      const piggyBalance = await ethers.provider.getBalance(piggyAddress);
      expect(piggyBalance).to.equal(amountToSend);
    });

    it("should fail when sending non-native tokens to a piggyBank", async function () {
      // Use the helper function to create a new piggy contract
      const piggyAddress1 = await makePiggy();
      const piggyAddress2 = await makePiggy();

      await expect(cryptoPiggies.connect(nftOwner).safeTransferFrom(nftOwner.address, piggyAddress2, 0, 2, "0x")).to.be.revertedWith("!ERC1155RECEIVER");
    });

    it("should fail when sending non-native tokens to the factory contract", async function () {
      const piggyAddress = await makePiggy();
      await expect(cryptoPiggies.connect(nftOwner).safeTransferFrom(nftOwner.address, piggyAddress, 0, 2, "0x")).to.be.revertedWith("!ERC1155RECEIVER");
    });

    it("should transfer a quantity of tokens from one holder to another", async function () {
      const piggyAddress = await makePiggy();
      await cryptoPiggies.connect(nftOwner).safeTransferFrom(nftOwner.address, newOwner.address, 0, 2, "0x")
      expect(await cryptoPiggies.balanceOf(newOwner.address, 0)).to.equal(2);
    });

    it("should not allow anyone to send ETH to the cryptoPiggies contract", async function () {
      try {
        await owner.sendTransaction({
          to: cryptoPiggies.address,
          value: ethers.utils.parseEther("1.2345"),
        });

        assert.fail("Expected the transaction to revert");
      } catch (error) {
        const revertReason = getRevertReason(error);
        assert.equal(
          revertReason,
          "Do not send ETH directly to this contract"
        );
      }

    });
  });
});