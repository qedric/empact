const { expect, assert } = require("chai")
const { ethers } = require("hardhat")
const { deploy, deployVaultImplementation, deployGenerator, deployTreasury, getTypedData, getRevertReason, getCurrentBlockTime, deployMockToken, deployMockOETHToken, generateMintRequest, makeLockedVault, makeUnlockedVault, makeOpenVault, make10K_decimalVault } = require("./test_helpers")

const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000'

describe(" -- Testing Generator Contract -- ", function () {

  let factory
  let generator
  let DEFAULT_ADMIN_AND_SIGNER, user1, feeRecipient

  // Extract the svg and percentage from the token metadata
  async function getImage(tokenId) {
    const metadata = await factory.uri(tokenId)
    //console.log(metadata)
    // Decode the base64 metadata
    const decodedMetadata = JSON.parse(atob(metadata.split(',')[1]))
    const p = decodedMetadata.attributes.find(attr => attr.trait_type === "Percent Complete").value
    const decodedImg = atob(decodedMetadata.image_data.split(",")[1])
    return {
      metadata: decodedMetadata, 
      percent: p,
      img: decodedImg
    }
  }

  before(async function () {
    [DEFAULT_ADMIN_AND_SIGNER, user1, feeRecipient] = await ethers.getSigners()
  })

  beforeEach(async function () {
    const deployedContracts = await deploy(feeRecipient.address, 'SepoliaETH', 'https://zebra.xyz/')
    factory = deployedContracts.factory
    generator = deployedContracts.generator
  })

  it("should set the correct attributes with supported token target balance", async function () {

    const MockTokenWithDecimals = await ethers.getContractFactory("MockTokenWithDecimals")

    const testDecimals = async (decimals) => {

      const token = await MockTokenWithDecimals.deploy(`Mock Token ${decimals}`, `${decimals}DECERC20`, decimals)
      await token.waitForDeployment()
      const vault = await make10K_decimalVault(factory, DEFAULT_ADMIN_AND_SIGNER, user1, token.target, decimals)
      
      // check the decimals is correct in the token
      expect(await token.decimals()).to.equal(decimals)

      // get the attributes from the vault
      const attributes = await vault.attributes()
      const tokenId = attributes.tokenId
      //console.log('\nattributes:', attributes)

      if (decimals == 0) {
        await expect(factory.uri(tokenId)).to.be.revertedWith('must be > 0')
        return
      }

      if (decimals >= 77) {
        await expect(factory.uri(tokenId)).to.be.revertedWith('Too many decimals')
        return
      }

      // get the metadata - it should match
      let metadata = await getImage(tokenId).then(r => r.metadata)
      //console.log('\nmetadata', metadata)

      const expectedFormattedTargetBalance = parseInt(ethers.formatUnits(attributes.targetBalance.toString(), decimals)).toFixed(0)
      expect(metadata.attributes.find(attr => attr.trait_type === "Vault Asset").value).to.equal(await token.symbol())
      expect(metadata.attributes.find(attr => attr.trait_type === "Target Balance").value).to.equal(expectedFormattedTargetBalance)
      expect(metadata.attributes.find(attr => attr.trait_type === "Current Balance").value).to.equal('0')

      // send 500 tokens
      const tokenAmount = ethers.parseUnits("500", decimals)
      const tx1 = await token.transfer(vault.target, tokenAmount)
      tx1.wait()
      // verify they arrived
      const newBalance = await token.balanceOf(vault.target)

      // get updated metadata from the vault
      metadata = await getImage(tokenId).then(r => r.metadata)
      //console.log('\nnew metadata', metadata)

      // metadata should reflect the deposit
      const expectedNewBalance = parseInt(ethers.formatUnits(tokenAmount, decimals)).toFixed(1)
      expect(metadata.attributes.find(attr => attr.trait_type === "Current Balance").value).to.equal(expectedNewBalance)
    }

    await testDecimals(0) // should fail
    await testDecimals(5)
    await testDecimals(6)
    await testDecimals(12)
    await testDecimals(18)
  })

  it("should generate the image with correct values - 0%", async function () {

    // Generate a sample token and its attributes
    const vault = await makeLockedVault(factory, DEFAULT_ADMIN_AND_SIGNER, user1)
    const tokenId = await vault.attributes().then(x => x.tokenId)
    let r = await getImage(tokenId)

    expect(r.percent).to.equal(0)
  })

  it("should generate the image with correct values - 60%", async function () {

    // Generate a sample token and its attributes
    const vault = await makeLockedVault(factory, DEFAULT_ADMIN_AND_SIGNER, user1)

    //send some ETH
    const amountToSend = ethers.parseEther("60")
    const tx = await DEFAULT_ADMIN_AND_SIGNER.sendTransaction({
      to: vault.target,
      value: amountToSend,
    })

    const tokenId = await vault.attributes().then(x => x.tokenId)
    let r = await getImage(tokenId)
    expect(r.percent).to.equal(60)

  })

  it("should generate the image with correct values - 100%", async function () {

    // Generate a sample token and its attributes
    const vault = await makeUnlockedVault(factory, DEFAULT_ADMIN_AND_SIGNER, user1)
    const tokenId = await vault.attributes().then(x => x.tokenId)
    let r = await getImage(tokenId)
    expect(r.percent).to.equal(100)
  })

  // open vaults have no tokens because they are burned
  /*it("should generate the image with correct values - open", async function () {

    // Generate a sample token and its attributes
    const vault = await makeOpenVault(factory, DEFAULT_ADMIN_AND_SIGNER, user1)
    const tokenId = await vault.attributes().then(x => x.tokenId)
    let r = await getImage(0)
  })*/

  it("should set the token URL prefix and emit the TokenUrlPrefixUpdated event", async function () {
    const newTokenUrlPrefix = "https://new-prefix.com/"
    const receipt = await generator.connect(DEFAULT_ADMIN_AND_SIGNER).setTokenUrlPrefix(newTokenUrlPrefix)

    const events = await generator.queryFilter("TokenUrlPrefixUpdated", receipt.blockHash)
    expect(events.length).to.equal(1)

    const event = events[0]
    expect(event.args.oldPrefix).to.equal("https://zebra.xyz/")
    expect(event.args.newPrefix).to.equal(newTokenUrlPrefix)
  })
})