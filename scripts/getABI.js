const hre = require("hardhat");

async function main() {

  let address = '0xBd109580024630B12BC8FFe6159c66D9AA0fDa0F'
  
  /*const contract = await hre.ethers.getContractAt("PIGGY", address );

  txn = await contract.attributes();
  console.log(txn);

  txn = await contract.contract_attributes();
  console.log(txn);

  txn = await contract.supply();
  console.log(txn);

  txn = await contract.uri(0);
  console.log(txn);*/

  const contract = await hre.ethers.getVerifiedContractAt(address);
  console.log(contract);

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


