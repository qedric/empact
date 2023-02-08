const { ethers } = require("hardhat");

async function main() {

  let address = '0xa16E02E87b7454126E5E10d957A927A7F5B5d2be'
  
  const contract = await ethers.getContractAt("PIGGY", address );

  // Mint an NFT by sending 0.02 ether
  /*txn = await contract.mintSingleNFT(id, { value: utils.parseEther('0.02') });
  await txn.wait()
  console.log(`NFT number ${ id } has been minted`);*/

  txn = await contract.attributes();
  console.log(txn);

  txn = await contract.contractURI();
  console.log(txn);

  txn = await contract.supply();
  console.log(txn);

  txn = await contract.uri(0);
  console.log(txn);

  txn = await ethers.provider.getBalance(address);
  console.log('balance:',txn);

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
