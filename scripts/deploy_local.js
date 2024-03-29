// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.


/*
{
  "owner":"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "tokenId":99999999,
  "name":"",
  "externalUrl":"",
  "metadata":"",
  "unlockTime":0,
  "targetBalance":0,
  "vault":"0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"
}

["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",99999999,"","","",0,0,"0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"]
*/

// factory constructor params:
// "RemixTest","CTR","0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", 400,"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266","0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"

const hre = require("hardhat");

function callback(x) {
  console.log(x)
}

async function main() {

  const _name = 'VaultsTESTLOCAL'
  const _symbol = 'CPG'
  const _royaltyRecipient = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
  const _royaltyBps = '400'
  const _primarySaleRecipient = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

  /*const _libAddress = '0x5FbDB2315678afecb367f032d93F642f64180aa3' // Goerli deployed via thirdweb
  const _implAddress = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512' // Goerli deployed PB implementation*/

  // deploy the Vault first if necessary
  const PB = await hre.ethers.getContractFactory("Vault");
  const pb = await PB.deploy();
  await pb.deployed();

  console.log('got Vault at ', pb.address);

  // deploy the library first if necessary
  const Lib = await hre.ethers.getContractFactory("Utils");
  const lib = await Lib.deploy();
  await lib.deployed();

  // get the library if it's already deployed
  //const lib = await ethers.getContractAt("Utils", _libAddress );

  console.log('got library at ', lib.address);
  
  // Get contract that we want to deploy
  const VaultFactory = await hre.ethers.getContractFactory("cryptovaults", {
    libraries: {
      Utils: lib.address,
    }}
  );

  console.log('got the conract we want to deploy');

  // deploy
  const deployedFactory = await VaultFactory.deploy(_name, _symbol, _royaltyRecipient, _royaltyBps, _primarySaleRecipient, pb.address);

  // Wait for this transaction to be mined
  await deployedFactory.deployed();

  // Get contract address
  console.log("Owner is: ", await deployedFactory.owner())

  console.log('VaultFactory address:', deployedFactory.address)

  /*// then deploy the implementation vault bank that the factory can then clone:
  const Vault = await hre.ethers.getContractFactory("Vault");

  const deployedVault = await Vault.deploy();

  await deployedVault.deployed();
  console.log(deployedVault);*/

  /*const data = {
    owner: owner,
    tokenId: 0,
    name: '',
    supply: 1,
    externalUrl: '',
    targetBalance: ethers.BigNumber.from(99),
    vault: owner
  }*/


/*  // deploy vaultbank implementation
  const Vault = await ethers.getContractFactory("Vault");
  const deployedVaultImplementation = await Vault.deploy();
  await deployedVaultImplementation.deployed();

  //console.log('deployed Vault:', deployedVaultImplementation)

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
