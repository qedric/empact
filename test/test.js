// We import Chai to use its asserting functions here.
const { expect, assert } = require("chai");
const { ethers, upgrades } = require("hardhat");

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

// `describe` is a Mocha function that allows you to organize your tests. It's
// not actually needed, but having your tests organized makes debugging them
// easier. All Mocha functions are available in the global scope.

// `describe` receives the name of a section of your test suite, and a callback.
// The callback must define the tests of that section. This callback can't be
// an async function.
describe("CryptoPiggies", function () {
  // Mocha has four functions that let you hook into the the test runner's
  // lifecyle. These are: `before`, `beforeEach`, `after`, `afterEach`.

  // They're very useful to setup the environment for tests, and to clean it
  // up after they run.

  // A common pattern is to declare some variables, and assign them in the
  // `before` and `beforeEach` callbacks.

  let utils, piggyBankImplementation, cryptoPiggies;

  let owner, newOwner, nonOwner
  let minter, newMinter, nonMinter
  let nFTOwner, nonNftOwner
  let newPrimarySaleRecipient

  // `beforeEach` will run before each test, re-deploying the contract every
  // time. It receives a callback, which can be async.
  beforeEach(async function () {
    
    [owner, newOwner, minter, newMinter, nonOwner, nonMinter, nFTOwner, nonNftOwner, newPrimarySaleRecipient] = await ethers.getSigners();

    const PiggyBankImplementation = await ethers.getContractFactory("PiggyBank");
    const Utils = await ethers.getContractFactory("Utils");
    
    utils = await Utils.deploy();
    piggyBankImplementation = await PiggyBankImplementation.deploy();

    const Factory = await ethers.getContractFactory("CryptoPiggies", {
      libraries: {
        Utils: utils.address,
      }}
    );

    const _name = 'CryptoPiggies_HH_TEST'
    const _symbol = 'CPG'
    const _royaltyRecipient = owner.address
    const _royaltyBps = '400'
    const _primarySaleRecipient = owner.address;

    // deploy
    cryptoPiggies = await Factory.deploy(_name, _symbol, _royaltyRecipient, _royaltyBps, _primarySaleRecipient, piggyBankImplementation.address);
    
    //console.log('factory address:', cryptoPiggies.address)
    //console.log('piggyBank address:', piggyBankImplementation.address)
    // Wait for this transaction to be mined
    await cryptoPiggies.deployed();

    // set permission

  });

  // You can nest describe calls to create subsections.
  describe("Deployment", function () {
    // `it` is another Mocha function. This is the one you use to define your
    // tests. It receives the test name, and a callback function.

    // If the callback function is async, Mocha will `await` it.
    it("Should set the right factory owner", async function () {
      console.log('expected owner:', owner.address)
      // Expect receives a value, and wraps it in an Assertion object. These
      // objects have a lot of utility methods to assert values.

      // This test expects the owner variable stored in the contract to be equal
      // to our Signer's owner.
      expect(await cryptoPiggies.owner()).to.equal(owner.address);
    });
  });

  describe("Permissions", function () {

    /*beforeEach(async function () {
      await cryptoPiggies.connect(owner).grantRole(DEFAULT_ADMIN_ROLE, owner.address);
    });*/

    it("should allow factory contract owner to grant an address the MINTER Role", async function () {
      await cryptoPiggies.grantRole(await cryptoPiggies.MINTER_ROLE(), minter.address);
      const isMinter = await cryptoPiggies.hasRole(await cryptoPiggies.MINTER_ROLE(), minter.address);
      assert(isMinter);
    });

    it("should fail if non factory contract owner tries to grant an address the MINTER Role", async function () {
      await expect(cryptoPiggies.connect(newOwner).grantRole(await cryptoPiggies.MINTER_ROLE(), minter.address)).to.be.revertedWith(
      /Permissions: account .* is missing role .*/);
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
      await cryptoPiggies.setOwner(newOwner.address);
      const contractOwner = await cryptoPiggies.owner();
      assert.equal(contractOwner, newOwner.address);
    });

    it("should fail if non factory contract owner to appoint a new owner", async function () {
     await expect(
        cryptoPiggies.connect(nonOwner).setOwner(newOwner.address),
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should fail if any account tries to change owner of a piggyBank", async function () {
      // first make a piggy
      
      await expect(
        cryptoPiggies.connect(newOwner).setOwner(newOwner.address),
      ).to.be.revertedWith("Ownable: caller is not the owner");
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

      const typedData = getTypedData(
        cryptoPiggies,
        nFTOwner.address,
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
      const nonce = await cryptoPiggies.getNonce(user1.address);
      const digest = await cryptoPiggies.getDigest(
        {
          name: "Piggy 1",
          description: "A cute little piggy",
          externalUrl: "",
          metadata: "",
          targetBalance: 1,
          unlockTime: Math.floor(Date.now() / 1000) + 86400,
          quantity: 1,
          to: user2.address,
        },
        nonce
      );
      const signature = await user1.signMessage(ethers.utils.arrayify(digest));

      // Mint a new token with the signature
      await cryptoPiggies.connect(user2).mintWithSignature(
        {
          name: "Piggy 1",
          description: "A cute little piggy",
          externalUrl: "",
          metadata: "",
          targetBalance: 1,
          unlockTime: Math.floor(Date.now() / 1000) + 86400,
          quantity: 1,
          to: user2.address,
        },
        signature
      );

      // Verify that the token was minted and assigned to the correct recipient
      const balance = await cryptoPiggies.balanceOf(user2.address, 1);
      expect(balance).to.equal(1);
    });

    it("should allow a user to define custom attributes in their mint request", async function () {});

    it("should fail if a user sets unlock date in the past AND targetbalance <= 0", async function () {});

    it("should fail if a the signer does not have MINTER role", async function () {});

    it("should fail if a the quantity is <= 0", async function () {});
  });

  /*describe("Payout", function() {

     it("should payout token holder when the unlock time has passed", async function () {});

     it("should payout token holder when the target balance is reached", async function () {});

     it("should payout token holder % of balance proportional to token holder's share of token", async function () {});

     it("should fail if token holder attempts payout before unlockTime", async function () {});

     it("should fail if token holder attempts payout before target balance is reached", async function () {});

     it("should fail if non token holder attempts payout", async function () {});

     it("should fail if token holder burns all their tokens and immediately attempts payout", async function () {});

     it("should fail if token holder burns all their tokens and immediately attempts payout", async function () {});

  });*/

  describe("Fees", function() {

     it("should set a new primary sale recipient", async function() {});

     it("should pay the MakePiggyFee to the primary sale recipient each time a piggy is created", async function () {
       
      const timestamp = await ethers.provider.getBlockNumber().then(blockNumber =>
        // getBlock returns a block object and it has a timestamp property.
        ethers.provider.getBlock(blockNumber).then(block => block.timestamp));

      const endTime = Math.floor(timestamp + 60 * 60 * 24);
      const unlockTime = Math.floor(timestamp + 60 * 60 * 24 * 99);
      const metadata = ',{"display_type":"boost_number","trait_type":"Test value","value":40},{"display_type":"boost_percentage","trait_type":"Test percentage","value": 10}';
      const targetBalance = ethers.utils.parseUnits("1", "ether").toString();
      const makePiggyFee = ethers.utils.parseUnits("0.004", "ether");
      console.log('makePiggyFee:', makePiggyFee)

      const typedData = await getTypedData(
        cryptoPiggies,
        nFTOwner.address,
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

      const initialBalance = await ethers.provider.getBalance(owner.address);
      console.log('initialBalance:', initialBalance)

      const tx = await cryptoPiggies.connect(nFTOwner).mintWithSignature(typedData.message, signature, { value: makePiggyFee });
      
      /*const nft1 = await cryptoPiggies.uri(0);
      console.log(nft1)*/

      /*// get gas used
      const txReceipt = await ethers.provider.getTransactionReceipt(tx.hash);
      const gasCost = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice)
      const expectedBalanceChange = makePiggyFee.sub(gasCost);
      console.log('gasCost:', gasCost)
      console.log(txReceipt)
      console.log('expectedBalanceChange:', expectedBalanceChange)*/

      const newBalance = await ethers.provider.getBalance(owner.address);
      console.log('newBalance:', newBalance)

      expect(newBalance.sub(initialBalance)).to.equal(makePiggyFee);

     });

     it("should pay the BreakPiggyFee to the piggy factory address with each payout", async function () {});

     it("should change the MakePiggyFee", async function () {});

     it("should change the BreakPiggyFee", async function () {});

     it("should fail when trying to mint a piggy sending less than the MakePiggyFee", async function () {});

     it("should fail when trying to set the BreakPiggyFee higher than the max allowed", async function () {});   

  });

  describe("Transactions", function () {

    it("should fail when sending non-native tokens to the factory contract", async function () {});

    it("should transfer a quantity of tokens from one holder to another", async function () {});

    it("should withdraw balance of the factory contract to owner's address", async function () {});
  });
});