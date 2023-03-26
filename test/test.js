// We import Chai to use its asserting functions here.
const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat")


// `describe` is a Mocha function that allows you to organize your tests. It's
// not actually needed, but having your tests organized makes debugging them
// easier. All Mocha functions are available in the global scope.

// `describe` receives the name of a section of your test suite, and a callback.
// The callback must define the tests of that section. This callback can't be
// an async function.
describe("Token contract", function () {
  // Mocha has four functions that let you hook into the the test runner's
  // lifecyle. These are: `before`, `beforeEach`, `after`, `afterEach`.

  // They're very useful to setup the environment for tests, and to clean it
  // up after they run.

  // A common pattern is to declare some variables, and assign them in the
  // `before` and `beforeEach` callbacks.

  let utils, piggyBank, factory;
  let owner;
  let addr1;
  let addr2;
  let addrs;

  // `beforeEach` will run before each test, re-deploying the contract every
  // time. It receives a callback, which can be async.
  beforeEach(async function () {
    
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
    
    const Utils = await ethers.getContractFactory("Utils");
    const PiggyBank = await ethers.getContractFactory("PiggyBank");
    
    utils = await Utils.deploy();
    piggyBank = await PiggyBank.deploy();

    const Factory = await ethers.getContractFactory("CryptoPiggies", {
      libraries: {
        Utils: utils.address,
      }}
    );


    const _name = 'CryptoPiggies_HH_TEST'
    const _symbol = 'CPG'
    const _royaltyRecipient = addr1.address
    const _royaltyBps = '400'
    const _primarySaleRecipient = addr2.address;

    // deploy
    factory = await Factory.deploy(_name, _symbol, _royaltyRecipient, _royaltyBps, _primarySaleRecipient, piggyBank.address);
    
    console.log('factory address:', factory.address)
    console.log('piggyBank address:', piggyBank.address)
    console.log('addr1:', addr1.address)
    console.log('addr2:', addr2.address)
    // Wait for this transaction to be mined

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
      expect(await factory.owner()).to.equal(owner.address);
    });

    /*it(`Should pause the contract`, async function () {
      await hardhatToken.pause()
      await expect(
        hardhatToken.connect(addr1).mintSingleNFT(11, {value: ethers.utils.parseEther('0.01')})
      ).to.be.revertedWith("Pausable: paused");
    });

    it(`Should unpause the contract`, async function () {
      await hardhatToken.pause()
      await expect(
        hardhatToken.connect(addr1).mintSingleNFT(11, {value: ethers.utils.parseEther('0.01')})
      ).to.be.revertedWith("Pausable: paused");
      await hardhatToken.unpause()
      await hardhatToken.connect(addr1).mintSingleNFT(11, {value: ethers.utils.parseEther('0.01')});
      expect(await hardhatToken.ownerOf(11)).to.equal(addr1.address);
    });

    it(`Should stop the presale`, async function () {
      await hardhatToken.startPresale()
      await expect(
        hardhatToken.connect(addr1).mintSingleNFT(11, {value: ethers.utils.parseEther('0.01')})
      ).to.be.revertedWith("Only for presale-approved addresses");
      await hardhatToken.stopPresale()
      await hardhatToken.connect(addr1).mintSingleNFT(11, {value: ethers.utils.parseEther('0.01')});
      expect(await hardhatToken.ownerOf(11)).to.equal(addr1.address);
    });

    it(`Should start the presale`, async function () {
      await hardhatToken.stopPresale()
      await hardhatToken.connect(addr1).mintSingleNFT(11, {value: ethers.utils.parseEther('0.01')});
      expect(await hardhatToken.ownerOf(11)).to.equal(addr1.address);
      await hardhatToken.startPresale()
      await expect(
        hardhatToken.connect(addr1).mintSingleNFT(12, {value: ethers.utils.parseEther('0.01')})
      ).to.be.revertedWith("Only for presale-approved addresses");
    });

    it(`Should set the price of the token`, async function () {
      await hardhatToken.setPrice('20000000000000000')
      await expect(
        hardhatToken.connect(addr1).mintSingleNFT(11, {value: ethers.utils.parseEther('0.01')})
      ).to.be.revertedWith("Not enough ether to purchase NFTs.");
      await hardhatToken.connect(addr1).mintSingleNFT(11, {value: ethers.utils.parseEther('0.02')});
      expect(await hardhatToken.ownerOf(11)).to.equal(addr1.address);
    });

    it(`Should update the base URI`, async function () {
      await hardhatToken.setBaseURI('not_a_uri/')
      await hardhatToken.connect(addr1).mintSingleNFT(11, {value: ethers.utils.parseEther('0.02')});
      let new_uri = await hardhatToken.connect(addr1).tokenURI(11)
      await expect(new_uri).to.equal("not_a_uri/11");
    });*/
  });

  describe("Minting", function () {

    /*
      mintSingleNFT(id)
    */
    /*it(`Should mint a token`, async function () {

      await hardhatToken.connect(addr1).mintSingleNFT(11, {value: ethers.utils.parseEther('0.01')});
      expect(await hardhatToken.tokenOfOwnerByIndex(addr1.address, 0)).to.equal(11);    
      expect(await hardhatToken.ownerOf(11)).to.equal(addr1.address);
      await expect(
        hardhatToken.ownerOf(12)
      ).to.be.revertedWith("owner query for nonexistent token");
    });

    it(`Owner should mint NFT for free`, async function () {
      await hardhatToken.ownerMintNFT(33, {value: ethers.utils.parseEther('0.00')});
      expect(await hardhatToken.tokenOfOwnerByIndex(owner.address, 0)).to.equal(33);    
      expect(await hardhatToken.ownerOf(33)).to.equal(owner.address);
    });

    it("Should fail if sender doesn’t have enough ETH to pay", async function () {
      await expect(
        hardhatToken.connect(addr1).mintSingleNFT(12, {value: ethers.utils.parseEther('0.005')})
      ).to.be.revertedWith("Not enough ether to purchase NFTs.");
    });

    it("Should fail if NFT has already been minted", async function () {
      await hardhatToken.connect(addr1).mintSingleNFT(11, {value: ethers.utils.parseEther('0.01')});
      await expect(
        hardhatToken.connect(addr1).mintSingleNFT(11, {value: ethers.utils.parseEther('0.01')})
      ).to.be.revertedWith("This NFT has already been minted");
    });

    it("Should fail if number is greater than 366", async function () {
      await expect(
        hardhatToken.connect(addr1).mintSingleNFT(367, {value: ethers.utils.parseEther('0.01')})
      ).to.be.revertedWith("Invalid ID - must be less than max supply");
    });

    it("Should fail if number is less than 1", async function () {
      await expect(
        hardhatToken.connect(addr1).mintSingleNFT(0, {value: ethers.utils.parseEther('0.01')})
      ).to.be.revertedWith("Invalid ID - must be greater than 0");
    });

    it("Should fail if sender tries to mint reserved token", async function () {
      await hardhatToken.reserveNFTs([2,4,6,8]);
      await expect(
        hardhatToken.connect(addr1).mintSingleNFT(4, {value: ethers.utils.parseEther('0.01')})
      ).to.be.revertedWith("This NFT is reserved");
    });

    it("Should fail if sender tries to mint reserved for address token", async function () {
      await hardhatToken.reserveSingleNFT(addr1.address, [31]);
      let reserveNFT = await hardhatToken.reserved_by_addresses(31);
      expect(reserveNFT).to.equal(addr1.address);
      await expect(
        hardhatToken.connect(addr2).mintSingleNFT(31, {value: ethers.utils.parseEther('0.01')})
      ).to.be.revertedWith("This NFT is reserved");
    });

    it("Should fail if sender tries to mint during presale but isn't approved", async function () {
      await hardhatToken.startPresale()
      await expect(
        hardhatToken.connect(addr1).mintSingleNFT(15, {value: ethers.utils.parseEther('0.01')})
      ).to.be.revertedWith("Only for presale-approved addresses");
    });

    it("Should succesfully mint for approved sender during presale", async function () {
      await hardhatToken.connect(addr2).mintSingleNFT(15, {value: ethers.utils.parseEther('0.01')});
      expect(await hardhatToken.tokenOfOwnerByIndex(addr2.address, 0)).to.equal(15);    
      expect(await hardhatToken.ownerOf(15)).to.equal(addr2.address);
    });

    it(`Reserved address should mint reserved token for free`, async function () {
      await hardhatToken.reserveSingleNFT(addr1.address, [22]);
      expect(await hardhatToken.connect(addr1).mintSingleNFT(22, {value: ethers.utils.parseEther('0.00')}));
      expect(await hardhatToken.tokenOfOwnerByIndex(addr1.address, 0)).to.equal(22);    
      expect(await hardhatToken.ownerOf(22)).to.equal(addr1.address);
    });*/
  });

  describe("Transactions", function () {
    /*it(`Should withdraw contract balance to owner's address`, async function () {
      await hardhatToken.connect(addr1).mintSingleNFT(11, {value: ethers.utils.parseEther('0.01')});
      const initialOwnerBalance = await hardhatToken.balanceOf(owner.address);
      const contractBalance = await hardhatToken.balanceOf(hardhatToken.address);
      await hardhatToken.withdraw();
      const ownerBalance = await hardhatToken.balanceOf(owner.address);
      expect(ownerBalance).to.equal(initialOwnerBalance + contractBalance);
    });*/
  });
});