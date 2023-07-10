
const hre = require("hardhat");

function callback(x) {
  console.log(x)
}

async function main() {

  const _facAddress = '0x90ca6c4390b80f5c83c29751438d61d6c2e1c0b6' // Goerli deployed

  // Get contract that we want to deploy
  const PB = await hre.ethers.getContractFactory("PiggyBank");

  // deploy
  const deployedPiggy = await PB.deploy(_facAddress);

  // Wait for this transaction to be mined
  await deployedPiggy.deployed();

  console.log('deployedPiggy address:', deployedPiggy.address)

  /*// then deploy the implementation piggy bank that the factory can then clone:
  const Piggy = await hre.ethers.getContractFactory("PiggyBank");

  const deployedPiggy = await Piggy.deploy();

  await deployedPiggy.deployed();
  console.log(deployedPiggy);*/

  /*const data = {
    owner: owner,
    tokenId: 0,
    name: '',
    supply: 1,
    externalUrl: '',
    targetBalance: ethers.BigNumber.from(99),
    piggyBank: owner
  }*/


/*  // deploy piggybank implementation
  const PiggyBank = await ethers.getContractFactory("PiggyBank");
  const deployedPiggyBankImplementation = await PiggyBank.deploy();
  await deployedPiggyBankImplementation.deployed();

  //console.log('deployed PiggyBank:', deployedPiggyBankImplementation)

  //https://portal.thirdweb.com/typescript/sdk.erc1155signaturemintable

  // window in which the signature will remain valid
  const startTime = new Date();
  const endTime = new Date(Date.now() + 60 * 60 * 24 * 1000);

  const mintRequest = {
    quantity: ethers.BigNumber.from(12),
    validityStartTimestamp: startTime,
    validityEndTimestamp: endTime,
    name: "This is the implementation",
    externalUrl: '',
    unlockTime: 1675514261,
    targetBalance: ethers.BigNumber.from(99),
    tokenId: ethers.BigNumber.from(0)
  }

  // generate signature for mint request:
  const signedPayload = await deployedFactory.erc1155.signature.generate(payload);

  const tx = await deployedFactory.erc1155.signature.mint(signedPayload);

  console.log(x)*/

  //initialise

  /*
  struct MintRequest {
    uint256 quantity;
    uint128 validityStartTimestamp;
    uint128 validityEndTimestamp;
    string name;
    string externalUrl;
    uint256 unlockTime;
    uint256 targetBalance;
    uint256 tokenId;
}



*/


}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
