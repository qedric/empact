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

describe("Testing CryptoPiggies", function () {

  let utils, piggyBankImplementation, generator, cryptoPiggies;

  let owner, newOwner, nonOwner
  let minter, newMinter, nonMinter
  let nftOwner, nonNftOwner
  let feeRecipient, newFeeRecipient

  async function makePiggy(
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
    const piggyCreatedEvent = txReceipt.events.find(event => event.event === 'PiggyBankDeployed');

    const PiggyBank = await ethers.getContractFactory("PiggyBank");
    const piggyBank = PiggyBank.attach(piggyCreatedEvent.args.piggyBank);

    //const attributes = await piggyBank.attributes();
    //console.log(attributes)

    return piggyCreatedEvent.args.piggyBank;

  }

  beforeEach(async function () {
    
    [owner, newOwner, minter, newMinter, nonOwner, nonMinter, nftOwner, nonNftOwner, feeRecipient, newFeeRecipient] = await ethers.getSigners();

    const PiggyBankImplementation = await ethers.getContractFactory("PiggyBank")
    const Generator = await ethers.getContractFactory("Generator_v1")
    
    generator = await Generator.deploy()

    const Factory = await ethers.getContractFactory("CryptoPiggies")

    const _name = 'CryptoPiggies_HH_TEST'
    const _symbol = 'CPG'
    const _feeRecipient = feeRecipient.address
    const _royaltyBps = '400'
    

    // deploy
    cryptoPiggies = await Factory.deploy(_name, _symbol, _feeRecipient, _royaltyBps);
    
    // init the implementation
    await cryptoPiggies.deployed();

    piggyBankImplementation = await PiggyBankImplementation.deploy(cryptoPiggies.address);
    await piggyBankImplementation.deployed();

    //set the implementation in the contract
    await cryptoPiggies.setPiggyBankImplementation(piggyBankImplementation.address);

  });

  describe("Supported Token Transactions", function () {

    it("getTotalBalance() should return correct sum of native ETH and supported tokens", async function () {
      // Use the helper function to create a new piggy contract
      const piggyAddress = await makePiggy();

      // Deploy a mock ERC20 token for testing
      const MockToken = await ethers.getContractFactory("MockToken");
      const token = await MockToken.deploy("Mock Token", "MOCK");
      await token.deployed();

      // Transfer some tokens to the piggy contract
      const tokenAmount = ethers.utils.parseUnits("100", 18);
      await token.transfer(piggyAddress, tokenAmount);

      // Get the PiggyBank
      const PiggyBank = await ethers.getContractFactory("PiggyBank");

      // Create a Contract instance
      const piggyBank = PiggyBank.attach(piggyAddress);

      // Check the token balance before the transfer
      const initialTokenBalance = await token.balanceOf(piggyAddress);

      // Send a non-ETH token to the piggy contract
      await token.transfer(piggyAddress, tokenAmount);

      // Check the token balance after the transfer
      const finalTokenBalance = await token.balanceOf(piggyAddress);

      expect(finalTokenBalance).to.equal(initialTokenBalance.add(tokenAmount));

    });

    it("should not allow transfers out of non-ETH supported tokens before unlock", async function () {
      // Use the helper function to create a new piggy contract
      const piggyAddress = await makePiggy(
        nftOwner.address,
        4,
        "4 Little Pigs",
        "description",
        0,
        "4.44"
      );

      // Deploy a mock ERC20 token for testing
      const MockToken = await ethers.getContractFactory("MockToken");
      const token = await MockToken.deploy("Mock Token", "MOCK");
      await token.deployed();

      // Transfer some tokens from owner to the piggy contract
      const tokenAmount = ethers.utils.parseUnits("100", 18);
      await token.transfer(piggyAddress, tokenAmount);

      // Get the PiggyBank
      const PiggyBank = await ethers.getContractFactory("PiggyBank");

      // Create a Contract instance
      const piggyBank = PiggyBank.attach(piggyAddress);

      // Try to transfer tokens out of the piggy contract before unlock
      await expect(cryptoPiggies.connect(nftOwner).payout(0))
        .to.be.revertedWith("Piggy is still hungry!");

      // Check the token balance remains unchanged
      const finalTokenBalance = await token.balanceOf(piggyAddress);
      expect(finalTokenBalance).to.equal(tokenAmount);
    });

    it("setTargetReached() should set _targetReached to true when mix of ETH and non-ETH supported tokens is >= to targetBalance", async function () {
      // Use the helper function to create a new piggy contract
      const piggyAddress = await makePiggy(
        nftOwner.address,
        4,
        "4 Little Pigs",
        "description",
        0,
        "100"
      );

      // Get the PiggyBank
      const PiggyBank = await ethers.getContractFactory("PiggyBank");

      // Create a Contract instance
      const piggyBank = PiggyBank.attach(piggyAddress);

      // Deploy a mock ERC20 token for testing
      const MockToken = await ethers.getContractFactory("MockToken");
      const token = await MockToken.deploy("Mock Token", "MOCK");
      await token.deployed();

      // Transfer enough tokens to reach the target amount
      const tokenAmount = ethers.utils.parseUnits("50", 18);
      await token.transfer(piggyAddress, tokenAmount);

      // Approve our mock token:
      await cryptoPiggies.addSupportedToken(token.address);

      // Check the token balance before the transfer
      const tokenBalance = await token.balanceOf(piggyAddress);
      //console.log('mock tokenBalance: ', tokenBalance)

      // Check if the piggy is locked before reaching the target balance
      await expect(piggyBank.setTargetReached()).to.be.revertedWith("Piggy is still hungry!");

      totalBalance = await piggyBank.getTotalBalance();
      //console.log('total balance:',totalBalance)

      // send the remaining required ETH:
      await nonOwner.sendTransaction({
        to: piggyAddress,
        value: ethers.utils.parseUnits("50", 18),
      });

      const ethBalance = await ethers.provider.getBalance(piggyAddress);
      //console.log('ETH balance:', ethBalance)

      totalBalance = await piggyBank.getTotalBalance();
      //console.log('total balance:',totalBalance)

      // Check if the setTargetReached transaction did not revert
      await expect(piggyBank.setTargetReached()).not.to.be.reverted;

    });

    it("should stop including token in balance after 'removeSupportedToken'", async function () {
      // Use the helper function to create a new piggy contract
      const piggyAddress = await makePiggy(
        nftOwner.address,
        4,
        "4 Little Pigs",
        "description",
        0,
        "100"
      );

      // Get the PiggyBank
      const PiggyBank = await ethers.getContractFactory("PiggyBank");

      // Create a Contract instance
      const piggyBank = PiggyBank.attach(piggyAddress);

      // Deploy a mock ERC20 token for testing
      const MockToken = await ethers.getContractFactory("MockToken");
      const token = await MockToken.deploy("Mock Token", "MOCK");
      await token.deployed();

      // Transfer enough tokens to reach the target amount
      const tokenAmount = ethers.utils.parseUnits("50", 18);
      await token.transfer(piggyAddress, tokenAmount);

      // Check the token balance is correct
      expect(await token.balanceOf(piggyAddress)).to.equal(ethers.utils.parseEther("50"));

      // balance should still be zero because it's not yet approved:
      expect(await piggyBank.getTotalBalance()).to.equal(0);

      // Approve our mock token:
      await cryptoPiggies.addSupportedToken(token.address);

      // balance should now equal token balance:
      expect(await piggyBank.getTotalBalance()).to.equal(ethers.utils.parseEther("50"));

    });

    it("should unlock when target balance is reached with 100% non-ETH supported tokens", async function () {
        // Use the helper function to create a new piggy contract
      const piggyAddress = await makePiggy(
        nftOwner.address,
        4,
        "4 Little Pigs",
        "description",
        0,
        "100"
      );

      // Get the PiggyBank
      const PiggyBank = await ethers.getContractFactory("PiggyBank");

      // Create a Contract instance
      const piggyBank = PiggyBank.attach(piggyAddress);

      // Deploy a mock ERC20 token for testing
      const MockToken = await ethers.getContractFactory("MockToken");
      const token1 = await MockToken.deploy("Mock Token 1", "MOCK1");
      await token1.deployed();

      const token2 = await MockToken.deploy("Mock Token 2", "MOCK2");
      await token2.deployed();

      // Transfer some tokens
      const tokenAmount = ethers.utils.parseUnits("50", 18);
      await token1.transfer(piggyAddress, tokenAmount);
      await token2.transfer(piggyAddress, tokenAmount);

      // Piggy won't unlock
      await expect(piggyBank.setTargetReached()).to.be.revertedWith("Piggy is still hungry!");

      // Approve our mock tokens:
      await cryptoPiggies.addSupportedToken(token1.address);
      await cryptoPiggies.addSupportedToken(token2.address);

      // Check if the setTargetReached transaction did not revert
      await expect(piggyBank.setTargetReached()).not.to.be.reverted;

    });

    it("should, when unlocked, withdraw correct proportion of ETH & supported tokens to sole owner", async function () {
      // Use the helper function to create a new piggy contract
      const piggyAddress = await makePiggy(
        nftOwner.address,
        4,
        "4 Little Pigs",
        "description",
        0,
        "100"
      );

      // Get the PiggyBank
      const PiggyBank = await ethers.getContractFactory("PiggyBank");

      // Create a Contract instance
      const piggyBank = PiggyBank.attach(piggyAddress);

      // Deploy mock ERC20 tokens for testing
      const MockToken = await ethers.getContractFactory("MockToken");
      const token1 = await MockToken.deploy("Mock Token 1", "MOCK1");
      await token1.deployed();
      const token2 = await MockToken.deploy("Mock Token 2", "MOCK2");
      await token2.deployed();

      // Transfer enough tokens to reach the target amount
      const tokenAmount = ethers.utils.parseUnits("33", 18);
      await token1.transfer(piggyAddress, tokenAmount);
      await token2.transfer(piggyAddress, tokenAmount);

      // send the remaining required ETH:
      const ethToSend = ethers.utils.parseUnits("34", 18);
      await nonOwner.sendTransaction({
        to: piggyAddress,
        value: ethToSend,
      });

      // Approve our mock tokens:
      await cryptoPiggies.addSupportedToken(token1.address);
      await cryptoPiggies.addSupportedToken(token2.address);

      // setTargetReached should not revert
      await expect(piggyBank.setTargetReached()).not.to.be.reverted;

      //get holders balance before payout
      const initialOwnerETHBalance = await ethers.provider.getBalance(nftOwner.address)
      const initialOwnerToken1Balance = await token1.balanceOf(nftOwner.address)
      const initialOwnerToken2Balance = await token2.balanceOf(nftOwner.address)

      /*console.log('piggyETHBalance', await ethers.provider.getBalance(piggyAddress))
      console.log('piggyToken1Balance', await token1.balanceOf(piggyAddress))
      console.log('piggyToken2Balance', await token2.balanceOf(piggyAddress))
      console.log('initialOwnerToken1Balance', initialOwnerToken1Balance)
      console.log('initialOwnerToken2Balance', initialOwnerToken2Balance)

      console.log('supported Tokens:', await cryptoPiggies.getSupportedTokens());*/

      // should payout all funds
      const tx = await cryptoPiggies.connect(nftOwner).payout(0);
      piggyETHBalance = await ethers.provider.getBalance(piggyAddress);
      piggyToken1Balance = await token1.balanceOf(piggyAddress);
      piggyToken2Balance = await token2.balanceOf(piggyAddress);
      expect(piggyETHBalance).to.equal(0);
      expect(piggyToken1Balance).to.equal(0);
      expect(piggyToken2Balance).to.equal(0);

      // get gas used
      const txReceipt = await ethers.provider.getTransactionReceipt(tx.hash);
      const gasCost = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice)

      // holder should receive all ETH minus break fee and gas:
      const nftOwnerETHBalanceAfterPayout = await ethers.provider.getBalance(nftOwner.address);
      const payoutFee = ethToSend.mul(400).div(10000) // 400 basis points
      const tokenPayoutFee = tokenAmount.mul(400).div(10000) // 400 basis points
      const expectedBalanceChange = ethToSend.sub(payoutFee).sub(gasCost);
      expect(nftOwnerETHBalanceAfterPayout).to.equal(initialOwnerETHBalance.add(expectedBalanceChange));

      // holder should receive all token1 and token2 balance:
      const ownerToken1BalanceAfterPayout = await token1.balanceOf(nftOwner.address);
      const ownerToken2BalanceAfterPayout = await token2.balanceOf(nftOwner.address);
      //console.log('ownerToken1BalanceAfterPayout', ownerToken1BalanceAfterPayout)
      //console.log('ownerToken2BalanceAfterPayout', ownerToken2BalanceAfterPayout)
      expect(ownerToken1BalanceAfterPayout).to.equal(initialOwnerToken1Balance.add(tokenAmount).sub(tokenPayoutFee));
      expect(ownerToken2BalanceAfterPayout).to.equal(initialOwnerToken2Balance.add(tokenAmount).sub(tokenPayoutFee));

    });

    it("should, when unlocked, send correct fee amounts when withdrawing mix of ETH & supported tokens for sole owner", async function () {
      // Use the helper function to create a new piggy contract
      const piggyAddress = await makePiggy(
        nftOwner.address,
        4,
        "4 Little Pigs",
        "description",
        0,
        "100"
      );

      // Get the PiggyBank
      const PiggyBank = await ethers.getContractFactory("PiggyBank");

      // Create a Contract instance
      const piggyBank = PiggyBank.attach(piggyAddress);

      // Deploy mock ERC20 tokens for testing
      const MockToken = await ethers.getContractFactory("MockToken");
      const token1 = await MockToken.deploy("Mock Token 1", "MOCK1");
      await token1.deployed();
      const token2 = await MockToken.deploy("Mock Token 2", "MOCK2");
      await token2.deployed();

      // Transfer enough tokens to reach the target amount
      const tokenAmount = ethers.utils.parseUnits("33", 18);
      await token1.transfer(piggyAddress, tokenAmount);
      await token2.transfer(piggyAddress, tokenAmount);

      // Send the remaining required ETH
      const ethToSend = ethers.utils.parseUnits("34", 18);
      await nonOwner.sendTransaction({
        to: piggyAddress,
        value: ethToSend,
      });

      // Approve our mock tokens
      await cryptoPiggies.addSupportedToken(token1.address);
      await cryptoPiggies.addSupportedToken(token2.address);

      // Set target reached
      await piggyBank.setTargetReached();

      // Get initial owner balances
      const initialOwnerETHBalance = await ethers.provider.getBalance(nftOwner.address);
      const initialOwnerToken1Balance = await token1.balanceOf(nftOwner.address);
      const initialOwnerToken2Balance = await token2.balanceOf(nftOwner.address);

      // Get initial fee recipient balances
      const initialFeeRecipientToken1Balance = await token1.balanceOf(feeRecipient.address);
      const initialFeeRecipientToken2Balance = await token2.balanceOf(feeRecipient.address);

      // Perform payout
      const tx = await cryptoPiggies.connect(nftOwner).payout(0);

      // Get piggy balances after payout
      const piggyETHBalance = await ethers.provider.getBalance(piggyAddress);
      const piggyToken1Balance = await token1.balanceOf(piggyAddress);
      const piggyToken2Balance = await token2.balanceOf(piggyAddress);
      expect(piggyETHBalance).to.equal(0);
      expect(piggyToken1Balance).to.equal(0);
      expect(piggyToken2Balance).to.equal(0);

      // Get gas cost
      const txReceipt = await ethers.provider.getTransactionReceipt(tx.hash);
      const gasCost = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);

      // Calculate expected fee amounts
      const payoutFee = ethToSend.mul(400).div(10000); // 400 basis points
      const tokenPayoutFee = tokenAmount.mul(400).div(10000); // 400 basis points

      // Calculate expected balance changes
      const expectedETHChange = ethToSend.sub(payoutFee).sub(gasCost);
      const expectedToken1Change = tokenAmount.sub(tokenPayoutFee);
      const expectedToken2Change = tokenAmount.sub(tokenPayoutFee);

      // Get owner balances after payout
      const ownerETHBalanceAfterPayout = await ethers.provider.getBalance(nftOwner.address);
      const ownerToken1BalanceAfterPayout = await token1.balanceOf(nftOwner.address);
      const ownerToken2BalanceAfterPayout = await token2.balanceOf(nftOwner.address);

      // Get fee recipient balances after payout
      const feeRecipientToken1BalanceAfterPayout = await token1.balanceOf(feeRecipient.address);
      const feeRecipientToken2BalanceAfterPayout = await token2.balanceOf(feeRecipient.address);

      // Verify expected balances and fee amounts
      expect(ownerETHBalanceAfterPayout).to.equal(initialOwnerETHBalance.add(expectedETHChange));
      expect(ownerToken1BalanceAfterPayout).to.equal(initialOwnerToken1Balance.add(expectedToken1Change));
      expect(ownerToken2BalanceAfterPayout).to.equal(initialOwnerToken2Balance.add(expectedToken2Change));
      expect(feeRecipientToken1BalanceAfterPayout).to.equal(initialFeeRecipientToken1Balance.add(tokenPayoutFee));
      expect(feeRecipientToken2BalanceAfterPayout).to.equal(initialFeeRecipientToken2Balance.add(tokenPayoutFee));

    });

    it("should, when unlocked, withdraw correct proportion of ETH & supported tokens to 20% owner", async function () {
      // Use the helper function to create a new 100 edition piggy contract
      const piggyAddress = await makePiggy(
        nftOwner.address,
        100,
        "100 Piggies",
        "",
        0,
        "100"
      )

      // distribute 20% of tokens to new owner
      await cryptoPiggies.connect(nftOwner).safeTransferFrom(nftOwner.address, newOwner.address, 0, 20, '0x')
      
      expect(await cryptoPiggies.balanceOf(newOwner.address, 0)).to.equal(20);

      // Get the PiggyBank
      const PiggyBank = await ethers.getContractFactory("PiggyBank")

      // Create a Contract instance
      const piggyBank = PiggyBank.attach(piggyAddress)

      // Deploy mock ERC20 tokens for testing
      const MockToken = await ethers.getContractFactory("MockToken");
      const token1 = await MockToken.connect(nonOwner).deploy("Mock Token 1", "MOCK1")
      await token1.deployed()
      const token2 = await MockToken.connect(nonOwner).deploy("Mock Token 2", "MOCK2")
      await token2.deployed()

      // Transfer enough tokens to reach the target amount
      const tokenAmount = ethers.utils.parseUnits("33", 18)
      await token1.connect(nonOwner).transfer(piggyAddress, tokenAmount)
      await token2.connect(nonOwner).transfer(piggyAddress, tokenAmount)

      // send the remaining required ETH:
      const ethToSend = ethers.utils.parseUnits("34", 18)
      await nonOwner.sendTransaction({
        to: piggyAddress,
        value: ethToSend,
      })

      // Check piggy balance is as expected
      const piggyETHBalance_beforePayout = await ethers.provider.getBalance(piggyAddress)
      const piggyToken1Balance_beforePayout = await token1.balanceOf(piggyAddress)
      const piggyToken2Balance_beforePayout = await token2.balanceOf(piggyAddress)
      expect(piggyETHBalance_beforePayout).to.equal(ethers.utils.parseUnits("34", 18))
      expect(piggyToken1Balance_beforePayout).to.equal(ethers.utils.parseUnits("33", 18))
      expect(piggyToken2Balance_beforePayout).to.equal(ethers.utils.parseUnits("33", 18))

      // Approve our mock tokens:
      await cryptoPiggies.addSupportedToken(token1.address)
      await cryptoPiggies.addSupportedToken(token2.address)

      // setTargetReached should not revert
      await expect(piggyBank.connect(nonOwner).setTargetReached()).not.to.be.reverted

      // get holders balance before payout
      const nftHolderETHBalance_beforePayout = await ethers.provider.getBalance(newOwner.address)
      const nftHolderToken1Balance_beforePayout = await token1.balanceOf(newOwner.address)
      const nftHolderToken2Balance_beforePayout = await token2.balanceOf(newOwner.address)

      //console.log('nftHolderETHBalance_beforePayout', nftHolderETHBalance_beforePayout)
      //console.log('nftHolderToken1Balance_beforePayout', nftHolderToken1Balance_beforePayout)
      //console.log('nftHolderToken2Balance_beforePayout', nftHolderToken2Balance_beforePayout)

      // Payout to a 20% holder
      const tx = await cryptoPiggies.connect(newOwner).payout(0)

      // set expected value of 20% of piggy balances:
      const oneFifthOfPiggyETHBalance = ethers.BigNumber.from(ethToSend.mul(2).div(10))
      const oneFifthOfPiggyToken1Balance = ethers.BigNumber.from(tokenAmount.mul(2).div(10))
      const oneFifthOfPiggyToken2Balance = ethers.BigNumber.from(tokenAmount.mul(2).div(10))

      // Piggy should be left with 80% of ETH & Supported tokens
      const piggyETHBalance_afterPayout = await ethers.provider.getBalance(piggyAddress)
      const piggyToken1Balance_afterPayout = await token1.balanceOf(piggyAddress)
      const piggyToken2Balance_afterPayout = await token2.balanceOf(piggyAddress)
      expect(piggyETHBalance_afterPayout).to.equal(piggyETHBalance_beforePayout.sub(oneFifthOfPiggyETHBalance))
      expect(piggyToken1Balance_afterPayout).to.equal(piggyToken1Balance_beforePayout.sub(oneFifthOfPiggyToken1Balance))
      expect(piggyToken2Balance_afterPayout).to.equal(piggyToken2Balance_beforePayout.sub(oneFifthOfPiggyToken2Balance))

      // get gas used
      const txReceipt = await ethers.provider.getTransactionReceipt(tx.hash);
      const gasCost = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice)

      // holder should receive 20% of the piggy's ETH, minus break fee and gas:
      const nftHolderETHBalance_afterPayout = await ethers.provider.getBalance(newOwner.address);
      const payoutFee = oneFifthOfPiggyETHBalance.mul(400).div(10000) // 400 basis points
      const tokenPayoutFee = oneFifthOfPiggyToken1Balance.mul(400).div(10000) // 400 basis points

      // expected balance change == (piggyETHbalance_before * 0.2) - payout fee - gas cost

      const expectedBalanceChange = oneFifthOfPiggyETHBalance.sub(payoutFee).sub(gasCost);

      expect(nftHolderETHBalance_afterPayout).to.equal(nftHolderETHBalance_beforePayout.add(expectedBalanceChange));

      // holder should receive 20% of piggy's token1 and token2 balances:
      const nftHolderToken1Balance_afterPayout = await token1.balanceOf(newOwner.address);
      const nftHolderToken2Balance_afterPayout = await token2.balanceOf(newOwner.address);
      //console.log('ownerToken1BalanceAfterPayout', ownerToken1BalanceAfterPayout)
      //console.log('ownerToken2BalanceAfterPayout', ownerToken2BalanceAfterPayout)
      expect(nftHolderToken1Balance_afterPayout).to.equal(nftHolderToken1Balance_beforePayout.add(oneFifthOfPiggyToken1Balance).sub(tokenPayoutFee));
      expect(nftHolderToken2Balance_afterPayout).to.equal(nftHolderToken2Balance_beforePayout.add(oneFifthOfPiggyToken2Balance).sub(tokenPayoutFee));

    });

    it("should, when unlocked, send correct fee amounts when withdrawing mix of ETH & supported tokens for 20% owner", async function () {
      // Use the helper function to create a new 100 edition piggy contract
      const piggyAddress = await makePiggy(
        nftOwner.address,
        100,
        "100 Piggies",
        "",
        0,
        "100"
      )

      // distribute 20% of tokens to new owner
      await cryptoPiggies.connect(nftOwner).safeTransferFrom(nftOwner.address, newOwner.address, 0, 20, '0x')
      
      expect(await cryptoPiggies.balanceOf(newOwner.address, 0)).to.equal(20);

      // Get the PiggyBank
      const PiggyBank = await ethers.getContractFactory("PiggyBank")

      // Create a Contract instance
      const piggyBank = PiggyBank.attach(piggyAddress)

      // Deploy mock ERC20 tokens for testing
      const MockToken = await ethers.getContractFactory("MockToken");
      const token1 = await MockToken.connect(nonOwner).deploy("Mock Token 1", "MOCK1")
      await token1.deployed()
      const token2 = await MockToken.connect(nonOwner).deploy("Mock Token 2", "MOCK2")
      await token2.deployed()

      // Transfer enough tokens to reach the target amount
      const tokenAmount = ethers.utils.parseUnits("33", 18)
      await token1.connect(nonOwner).transfer(piggyAddress, tokenAmount)
      await token2.connect(nonOwner).transfer(piggyAddress, tokenAmount)

      // send the remaining required ETH:
      const ethToSend = ethers.utils.parseUnits("34", 18)
      await nonOwner.sendTransaction({
        to: piggyAddress,
        value: ethToSend,
      })

      // Check piggy balance is as expected
      const piggyETHBalance_beforePayout = await ethers.provider.getBalance(piggyAddress)
      const piggyToken1Balance_beforePayout = await token1.balanceOf(piggyAddress)
      const piggyToken2Balance_beforePayout = await token2.balanceOf(piggyAddress)
      expect(piggyETHBalance_beforePayout).to.equal(ethToSend)
      expect(piggyToken1Balance_beforePayout).to.equal(tokenAmount)
      expect(piggyToken2Balance_beforePayout).to.equal(tokenAmount)

      // Approve our mock tokens:
      await cryptoPiggies.addSupportedToken(token1.address)
      await cryptoPiggies.addSupportedToken(token2.address)

      // setTargetReached should not revert
      await expect(piggyBank.connect(nonOwner).setTargetReached()).not.to.be.reverted

      // get holders balance before payout
      const nftHolderETHBalance_beforePayout = await ethers.provider.getBalance(newOwner.address)
      const nftHolderToken1Balance_beforePayout = await token1.balanceOf(newOwner.address)
      const nftHolderToken2Balance_beforePayout = await token2.balanceOf(newOwner.address)

      // Get initial fee recipient balances
      const initialFeeRecipientETHBalance = await ethers.provider.getBalance(feeRecipient.address)
      const initialFeeRecipientToken1Balance = await token1.balanceOf(feeRecipient.address);
      const initialFeeRecipientToken2Balance = await token2.balanceOf(feeRecipient.address);

      // Payout to a 20% holder
      const tx = await cryptoPiggies.connect(newOwner).payout(0)

      // set expected value of 20% of piggy balances:
      const oneFifthOfPiggyETHBalance = ethers.BigNumber.from(ethToSend.mul(2).div(10))
      const oneFifthOfPiggyToken1Balance = ethers.BigNumber.from(tokenAmount.mul(2).div(10))
      const oneFifthOfPiggyToken2Balance = ethers.BigNumber.from(tokenAmount.mul(2).div(10))

      // Piggy should be left with 80% of ETH & Supported tokens
      const piggyETHBalance_afterPayout = await ethers.provider.getBalance(piggyAddress)
      const piggyToken1Balance_afterPayout = await token1.balanceOf(piggyAddress)
      const piggyToken2Balance_afterPayout = await token2.balanceOf(piggyAddress)
      expect(piggyETHBalance_afterPayout).to.equal(piggyETHBalance_beforePayout.sub(oneFifthOfPiggyETHBalance))
      expect(piggyToken1Balance_afterPayout).to.equal(piggyToken1Balance_beforePayout.sub(oneFifthOfPiggyToken1Balance))
      expect(piggyToken2Balance_afterPayout).to.equal(piggyToken2Balance_beforePayout.sub(oneFifthOfPiggyToken2Balance))

      // get gas used
      const txReceipt = await ethers.provider.getTransactionReceipt(tx.hash)
      const gasCost = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice)

      // holder should receive 20% of the piggy's ETH, minus break fee and gas:
      const nftHolderETHBalance_afterPayout = await ethers.provider.getBalance(newOwner.address)
      const payoutFee = oneFifthOfPiggyETHBalance.mul(400).div(10000) // 400 basis points
      const tokenPayoutFee = oneFifthOfPiggyToken1Balance.mul(400).div(10000) // 400 basis points

      // expected balance change == (piggyETHbalance_before * 0.2) - payout fee - gas cost
      const expectedBalanceChange = oneFifthOfPiggyETHBalance.sub(payoutFee).sub(gasCost)

      expect(nftHolderETHBalance_afterPayout).to.equal(nftHolderETHBalance_beforePayout.add(expectedBalanceChange))

      // holder should receive 20% of piggy's token1 and token2 balances:
      const nftHolderToken1Balance_afterPayout = await token1.balanceOf(newOwner.address)
      const nftHolderToken2Balance_afterPayout = await token2.balanceOf(newOwner.address)
      expect(nftHolderToken1Balance_afterPayout).to.equal(nftHolderToken1Balance_beforePayout.add(oneFifthOfPiggyToken1Balance).sub(tokenPayoutFee))
      expect(nftHolderToken2Balance_afterPayout).to.equal(nftHolderToken2Balance_beforePayout.add(oneFifthOfPiggyToken2Balance).sub(tokenPayoutFee))

      // Get fee recipient balances after payout
      const feeRecipientETHBalanceAfterPayout = await ethers.provider.getBalance(feeRecipient.address)
      const feeRecipientToken1BalanceAfterPayout = await token1.balanceOf(feeRecipient.address)
      const feeRecipientToken2BalanceAfterPayout = await token2.balanceOf(feeRecipient.address)

      // Verify expected balances and fee amounts
      expect(feeRecipientETHBalanceAfterPayout).to.equal(initialFeeRecipientETHBalance.add(payoutFee))
      expect(feeRecipientToken1BalanceAfterPayout).to.equal(initialFeeRecipientToken1Balance.add(tokenPayoutFee))
      expect(feeRecipientToken2BalanceAfterPayout).to.equal(initialFeeRecipientToken2Balance.add(tokenPayoutFee))


    });

  });
});