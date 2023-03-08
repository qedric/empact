//https://forum.openzeppelin.com/t/how-to-correctly-test-the-initialisation-of-a-clone-contract-on-hardhat-eip-1167/31774
// https://ethereum.stackexchange.com/questions/110652/how-to-test-clone-contract-functions

const _name = 'Piggies_Local_TEST'
const _symbol = 'CPG'
const _royaltyRecipient = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const _royaltyBps = '400'
const _primarySaleRecipient = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

const { ethers } = require("hardhat");

const MintPiggyRequest1155 = [
	{
	  name: "to",
	  type: "address"
	}, {
	  name: "quantity",
	  type: "uint256"
	}, {
	  name: "validityStartTimestamp",
	  type: "uint128"
	}, {
	  name: "validityEndTimestamp",
	  type: "uint128"
	}, {
	  name: "name",
	  type: "string"
	}, {
	  name: "external_url",
	  type: "string"
	}, {
	  name: "metadata",
	  type: "string"
	}, {
	  name: "unlockTime",
	  type: "uint256"
	}, {
	  name: "targetBalance",
	  type: "uint256"
	}
];

async function generateSig(payloadToSign, contractWrapper) {
  
  // to do - check role
  //await this.roles?.verify(["minter"], await this.contractWrapper.getSignerAddress());

  const chainId = await contractWrapper.getChainID();
  const signer = contractWrapper.getSigner();
  if (!signer) { return false }

  const signature = await contractWrapper.signTypedData(signer, {
      name: "SignatureMintERC1155",
      version: "1",
      chainId,
      verifyingContract: contractWrapper.readContract.address
    }, {
      MintRequest: MintPiggyRequest1155
    },payloadToSign);
  return {
    payload: payloadToSign,
    signature: signature.toString()
  };  
}

async function main() {

	// 1. deploy the library
	const Lib = await hre.ethers.getContractFactory("Utils");
	const lib = await Lib.deploy();
	await lib.deployed();

	// 2. deploy the implementation PiggyBank
	const PB = await hre.ethers.getContractFactory("PiggyBank");
	const pB = await Lib.deploy();
	await pB.deployed();

	// 3. deploy cryptoPiggies Factory contract
  const PiggyFactory = await hre.ethers.getContractFactory("CryptoPiggies", {
    libraries: { Utils: lib.address }
  });
  const piggyFactory = await PiggyFactory.deploy(_name, _symbol, _royaltyRecipient, _royaltyBps, _primarySaleRecipient, _implAddress);
  await piggyFactory.deployed();

  




}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});