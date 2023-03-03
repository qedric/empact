// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.

const hre = require("hardhat");

function callback(x) {
  console.log(x)
}

async function main() {

  /*
    string memory _name,
    string memory _symbol,
    address _royaltyRecipient,
    uint128 _royaltyBps,
    address _primarySaleRecipient
  */
  const _name = 'CryptoPiggiesTESTPermissions2'
  const _symbol = 'CTP'
  const _royaltyRecipient = '0x92abb8F1238a81E55C5310C6D1baf399Be1b483C'
  const _royaltyBps = '400'
  const _primarySaleRecipient = '0x92abb8F1238a81E55C5310C6D1baf399Be1b483C';

  const _libAddress = '0x48466f3a11F4EFdFC5D107f24ff79D21C7EdE01F' // Goerli deployed via thirdweb

  // Get owner/deployer's wallet address
  //const owner = await hre.ethers.getSigners();

  //console.log(owner.address)

  txn = await ethers.provider.getBalance('0x92abb8F1238a81E55C5310C6D1baf399Be1b483C');
  console.log('balance:',txn);

  /*// deploy the library first if necessary
  const Lib = await hre.ethers.getContractFactory("Utils");
  const lib = await Lib.deploy();
  await lib.deployed();*/

  // get the library if it's already deployed
  const lib = await ethers.getContractAt("Utils", _libAddress );

  console.log('got library at ', lib.address);
  
  // Get contract that we want to deploy
  const PiggyFactory = await hre.ethers.getContractFactory("CryptoPiggies", {
    libraries: {
      Utils: lib.address,
    }}
  );

  console.log('got the conract we want to deploy');

  // deploy
  const deployedFactory = await PiggyFactory.deploy(_name, _symbol, _royaltyRecipient, _royaltyBps, _primarySaleRecipient);

  // Wait for this transaction to be mined
  await deployedFactory.deployed();

  // Get contract address
  console.log("Owner is: ", await deployedFactory.owner())

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
