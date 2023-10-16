const { expect } = require("chai");
const { ethers, upgrades, network } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");

const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000';

describe("Treasury Contract Tests", function () {
  let Treasury;
  let treasury;
  let owner, newOwner;
  let minter, newMinter, nonMinter;
  let nftOwner, nonNftOwner;
  let feeRecipient, newFeeRecipient;

  before(async function () {
    [owner, newOwner, minter, newMinter, nonMinter, nftOwner, nonNftOwner, feeRecipient, newFeeRecipient] = await ethers.getSigners();
    Treasury = await ethers.getContractFactory("Treasury");
  });

  beforeEach(async function () {
    treasury = await upgrades.deployProxy(Treasury, [owner.address, owner.address]);
    await treasury.deployed();
  });

  describe("Supported Token Transactions", function () {
    it("should add and remove supported tokens", async function () {
      const token1 = await deployMockToken("Token1", "T1");
      const token2 = await deployMockToken("Token2", "T2");

      // Add token1 as a supported token
      await treasury.addSupportedToken(token1.address);
      expect(await treasury.supportedTokens(0)).to.equal(token1.address);

      // Add token2 as a supported token
      await treasury.addSupportedToken(token2.address);
      expect(await treasury.supportedTokens(1)).to.equal(token2.address);

      // Remove token1 from supported tokens
      await treasury.removeSupportedToken(token1.address);
      expect(await treasury.supportedTokens(0)).to.equal(token2.address);

      // Remove token2 from supported tokens
      await treasury.removeSupportedToken(token2.address);
      expect(await treasury.supportedTokens(0)).to.equal(ethers.constants.AddressZero);
    });

    it("should collect funds from open funds", async function () {
      // Deploy a mock open fund contract
      const openFund = await deployMockFund(owner.address);

      // Add the open fund to the treasury
      await treasury.addLockedFund(openFund.address);

      // Collect funds from the open fund
      await treasury.collect();

      // Check if the open fund has been moved to locked funds
      expect(await treasury.isOpenFund(openFund.address)).to.be.false;
      expect(await treasury.isLockedFund(openFund.address)).to.be.true;
    });

    it("should distribute funds to locked funds", async function () {
      // Deploy two mock locked fund contracts
      const lockedFund1 = await deployMockFund(owner.address);
      const lockedFund2 = await deployMockFund(owner.address);

      // Add the locked funds to the treasury
      await treasury.addLockedFund(lockedFund1.address);
      await treasury.addLockedFund(lockedFund2.address);

      // Distribute funds to the locked funds
      await treasury.distribute(0); // Distribute native token (ETH)

      // Check if the locked funds received the expected amount of native token (ETH)
      const balance1 = await ethers.provider.getBalance(lockedFund1.address);
      const balance2 = await ethers.provider.getBalance(lockedFund2.address);
      expect(balance1).to.equal(ethers.utils.parseEther("0.5")); // Adjust with the actual amount
      expect(balance2).to.equal(ethers.utils.parseEther("0.5")); // Adjust with the actual amount
    });

    it("should prevent distribution with invalid token ID", async function () {
      await expect(treasury.distribute(1)).to.be.revertedWith("Invalid tokenId");
    });
  });

  async function deployMockToken(name, symbol) {
    const MockToken = await ethers.getContractFactory("MockToken");
    const token = await MockToken.deploy(name, symbol);
    await token.deployed();
    return token;
  }

  async function deployMockFund(owner) {
    const MockFund = await ethers.getContractFactory("MockFund");
    const fund = await MockFund.deploy(owner);
    await fund.deployed();
    return fund;
  }
});
