require("@nomiclabs/hardhat-ethers");

async function main() {

  let address = '0xa16E02E87b7454126E5E10d957A927A7F5B5d2be'
  
  const contract = await ethers.getContractAt("PIGGY", address );

  const [owner] = await ethers.getSigners();

  const transactionHash = await owner.sendTransaction({
    to: address,
    value: ethers.utils.parseEther("1.265326"),
  });
  
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});