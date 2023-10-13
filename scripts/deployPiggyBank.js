
const hre = require("hardhat");

function callback(x) {
  console.log(x)
}

async function main() {

  const _facAddress = '0x90ca6c4390b80f5c83c29751438d61d6c2e1c0b6' // Goerli deployed

  // Get contract that we want to deploy
  const PB = await hre.ethers.getContractFactory("Fund");

  // deploy
  const deployedFund = await PB.deploy(_facAddress);

  // Wait for this transaction to be mined
  await deployedFund.deployed();

  console.log('deployedFund address:', deployedFund.address)

  /*// then deploy the implementation fund bank that the factory can then clone:
  const Fund = await hre.ethers.getContractFactory("Fund");

  const deployedFund = await Fund.deploy();

  await deployedFund.deployed();
  console.log(deployedFund);*/

  /*const data = {
    owner: owner,
    tokenId: 0,
    name: '',
    supply: 1,
    externalUrl: '',
    targetBalance: ethers.BigNumber.from(99),
    fund: owner
  }*/


/*  // deploy fundbank implementation
  const Fund = await ethers.getContractFactory("Fund");
  const deployedFundImplementation = await Fund.deploy();
  await deployedFundImplementation.deployed();

  //console.log('deployed Fund:', deployedFundImplementation)

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
