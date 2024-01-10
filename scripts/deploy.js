/*
{
  "owner":"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "tokenId":99999999,
  "name":"",
  "externalUrl":"",
  "metadata":"",
  "unlockTime":0,
  "targetBalance":0,
  "fund":"0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"
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

  const _name = 'cryptofunds'
  const _symbol = 'CPG'
  const _royaltyRecipient = '0x92abb8F1238a81E55C5310C6D1baf399Be1b483C'
  const _royaltyBps = '400'

  const _libAddress = '0x7a604461584925a1dB6Ec4A9d5A767c05D2a4Cd9' // Goerli deployed via thirdweb
  //const _implAddress = '0x6De1F083B9AD801345E6726F947879D12D7347B8' // Goerli deployed PB implementation*/

  // get the library if it's already deployed
  const lib = await ethers.getContractAt("CP_Utils_v2", _libAddress );
  console.log('got library at ', lib.address);
  
  // Get contract that we want to deploy
  const VaultFactory = await hre.ethers.getContractFactory("cryptofunds", {
    libraries: {
      CP_Utils_v2: lib.address,
    }}
  );

  // deploy
  const deployedFactory = await VaultFactory.deploy(_name, _symbol, _royaltyRecipient, _royaltyBps);

  // Wait for this transaction to be mined
  await deployedFactory.deployed();

  // Get contract address
  console.log('Factory address:', deployedFactory.address)

  /*// then deploy the implementation fund bank that the factory can then clone:
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
    fund: owner
  }*/


/*  // deploy fundbank implementation
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


}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
