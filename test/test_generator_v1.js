// We import Chai to use its asserting functions here.
const { expect, assert } = require("chai")
const { ethers, upgrades, network } = require("hardhat")
const helpers = require("@nomicfoundation/hardhat-network-helpers")
const { deploy, deployVaultImplementation, deployGenerator, deployTreasury, getTypedData, getRevertReason, getCurrentBlockTime, deployMockToken, deployMockOETHToken, generateMintRequest, makeVault, makeVault_100edition_target100_noUnlockTime, makeVault_100edition_notarget_99days } = require("./test_helpers")

const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000'

describe(" -- Testing Generator v1 Contract -- ", function () {

  let factory
  let INITIAL_DEFAULT_ADMIN_AND_SIGNER
  let user1
  let feeRecipient

  before(async function () {
    [INITIAL_DEFAULT_ADMIN_AND_SIGNER, NEW_SIGNER, user1, feeRecipient] = await ethers.getSigners()
  })

  beforeEach(async function () {
    const deployedContracts = await deploy(feeRecipient.address, 'https://zebra.xyz/')
    factory = deployedContracts.factory
    generator = deployedContracts.generator
  })

  it("should change the svg colours", async function () {

    const newFbg = 0x300000
    const newbg = 0x300000
    const newFg = 0x300000
    const newPbg = 0x300000
    const newPfg = 0x300000

    c = await generator.svgColours()
    await generator.setSvgColours(newFbg, newbg, newFg, newPbg, newPfg)
    c = await generator.svgColours()

    expect(`0x${newFbg.toString(16)}`).to.equal(c.fbg)
    expect(`0x${newbg.toString(16)}`).to.equal(c.bg)
    expect(`0x${newFg.toString(16)}`).to.equal(c.fg)
    expect(`0x${newPbg.toString(16)}`).to.equal(c.pbg)
    expect(`0x${newPfg.toString(16)}`).to.equal(c.pfg)
  })

  it("should generate the svg with correct colour and height values", async function () {

    async function getColours() {
      // Get the colours from the generator contract
      const c = await generator.svgColours()
      return {
        fbg: c.fbg.replace('0x', '#'),
        bg: c.bg.replace('0x', '#'),
        fg: c.fg.replace('0x', '#'),
        pbg: c.pbg.replace('0x', '#'),
        pfg: c.pfg.replace('0x', '#')
      }
    }

    // Extract the svg and percentage from the token metadata
    async function getSVG() {
      const metadata = await factory.uri(0)
      // Decode the base64 metadata
      const decodedMetadata = JSON.parse(atob(metadata.split(',')[1]))
      const p = decodedMetadata.attributes.find(attr => attr.trait_type === "Percent Complete").value
      const decodedSVG = atob(decodedMetadata.image_data.split(",")[1])
      return {
        percent: p,
        svg: decodedSVG
      }
    }

    // Check that the dynamic values are as expected
    async function checkValues() {
      let r = await getSVG() // 0%

      // Find the match in the SVG content
      let match = r.svg.match(regex1)
      const hexColor1 = match[0].match(/#[0-9a-fA-F]+/)[0]
      match = r.svg.match(regex2)
      const hexColor2 = match[0].match(/#[0-9a-fA-F]+/)[0]
      match = r.svg.match(regex3)
      const hexColor3 = match[0].match(/#[0-9a-fA-F]+/)[0]
      match = r.svg.match(regex4)
      const hexColor4 = match[0].match(/#[0-9a-fA-F]+/)[0]

      match = r.svg.match(regex)
      let height = parseInt(match[0].match(/height="(\d+)"/)[1], 10);

      return {
        hexColor1,
        hexColor2,
        hexColor3,
        hexColor4,
        height
      }
    }

    // Generate a sample token and its attributes
    const vault = await makeVault(factory, INITIAL_DEFAULT_ADMIN_AND_SIGNER, user1)

    // Regular expression to match the fill declarations in the svg
    const regex1 = /\.cls-1{fill:#[0-9a-fA-F]+;}/
    const regex2 = /\.cls-2{fill:#[0-9a-fA-F]+;}/
    const regex3 = /\.cls-3{fill:#[0-9a-fA-F]+;}/
    const regex4 = /\.cls-4{fill:#[0-9a-fA-F]+;}/
    const regex = /<rect class="cls-1" y="0" width="1080" height="(\d+)"\/>/g

    let c = await getColours()

    // 0%
    v = await checkValues()
    // Check the 'fill' attributes of elements
    expect(v.hexColor1).to.equal(c.bg, `cls1 colour should be ${c.bg}`)
    expect(v.hexColor2).to.equal(c.fg, `cls2 colour should be ${c.fg}`)
    expect(v.hexColor3).to.equal(c.pbg, `cls3 colour should be ${c.pbg}`)
    expect(v.hexColor4).to.equal(c.pfg, `cls4 colour should be ${c.pfg}`)
    // Check the 'height' attribute of the rect element
    expect(parseInt(v.height)).to.equal(1080, `Height should be 1080`)

    // 2. Move block time fwd 33 days; percent should still be 0 because it's the lowest progress
    await helpers.time.increase(60 * 60 * 24 * 33) // 33 days
    v = await checkValues()
    // Check the 'fill' attributes of elements
    expect(v.hexColor1).to.equal(c.bg, `cls1 colour should be ${c.bg}`)
    expect(v.hexColor2).to.equal(c.fg, `cls2 colour should be ${c.fg}`)
    expect(v.hexColor3).to.equal(c.pbg, `cls3 colour should be ${c.pbg}`)
    expect(v.hexColor4).to.equal(c.pfg, `cls4 colour should be ${c.pfg}`)
    // Check the 'height' attribute of the rect element
    expect(parseInt(v.height)).to.equal(1080, `Height should be 1080`)

    // 3. Send 0.2 ETH and ensure that the percentage returned is 20
    await user1.sendTransaction({ to: vault.address, value: ethers.utils.parseEther("0.2") })
    // 20%
    v = await checkValues()
    // Check the 'fill' attributes of elements
    expect(v.hexColor1).to.equal(c.bg, `cls1 colour should be ${c.bg}`)
    expect(v.hexColor2).to.equal(c.fg, `cls2 colour should be ${c.fg}`)
    expect(v.hexColor3).to.equal(c.pbg, `cls3 colour should be ${c.pbg}`)
    expect(v.hexColor4).to.equal(c.pfg, `cls4 colour should be ${c.pfg}`)
    // Check the 'height' attribute of the rect element
    expect(parseInt(v.height)).to.be.closeTo(1080*.8, 10, `Height should be close to 20% -  ${1080*.8}`)

    // 4. Send 0.2 ETH and ensure that the percentage returned is 33 (days is now lowest progress)
    await user1.sendTransaction({ to: vault.address, value: ethers.utils.parseEther("0.2") })
    // 33%
    v = await checkValues()
    // Check the 'fill' attributes of elements
    expect(v.hexColor1).to.equal(c.bg, `cls1 colour should be ${c.bg}`)
    expect(v.hexColor2).to.equal(c.fg, `cls2 colour should be ${c.fg}`)
    expect(v.hexColor3).to.equal(c.pbg, `cls3 colour should be ${c.pbg}`)
    expect(v.hexColor4).to.equal(c.pfg, `cls4 colour should be ${c.pfg}`)
    // Check the 'height' attribute of the rect element
    expect(parseInt(v.height)).to.closeTo(1080*.67, 20, `Height should be close to 33% - ${1080*.67}`)

    // 5. Move block time fwd another 33 days; percent should be 40 because ETH progress is lowest
    await helpers.time.increase(60 * 60 * 24 * 33) // 33 days
    v = await checkValues()
    // 40%
    // Check the 'fill' attributes of elements
    expect(v.hexColor1).to.equal(c.bg, `cls1 colour should be ${c.bg}`)
    expect(v.hexColor2).to.equal(c.fg, `cls2 colour should be ${c.fg}`)
    expect(v.hexColor3).to.equal(c.pbg, `cls3 colour should be ${c.pbg}`)
    expect(v.hexColor4).to.equal(c.pfg, `cls4 colour should be ${c.pfg}`)
    // Check the 'height' attribute of the rect element
    expect(parseInt(v.height)).to.closeTo(1080*.6,20, `Height should be close to 40% - ${1080*.6}`)

    // 6. Send 0.6 ETH and ensure that the percentage returned is 66 (days is now lowest progress)
    await user1.sendTransaction({ to: vault.address, value: ethers.utils.parseEther("0.6") })
    v = await checkValues()
    // 66%
    // Check the 'fill' attributes of elements
    expect(v.hexColor1).to.equal(c.bg, `cls1 colour should be ${c.bg}`)
    expect(v.hexColor2).to.equal(c.fg, `cls2 colour should be ${c.fg}`)
    expect(v.hexColor3).to.equal(c.pbg, `cls3 colour should be ${c.pbg}`)
    expect(v.hexColor4).to.equal(c.pfg, `cls4 colour should be ${c.pfg}`)
    // Check the 'height' attribute of the rect element
    expect(parseInt(v.height)).to.closeTo(1080*.34, 20, `Height should be close to 66% - ${1080*.34}`)

    // 5. Move block time fwd another 44 days; percent should now be 100 because ETH and time == 100
    await helpers.time.increase(60 * 60 * 24 * 34) // 33 days
    v = await checkValues()
    // 100%
    // Check the 'fill' attributes of elements
    expect(v.hexColor1).to.equal(c.fbg, `cls1 colour should be ${c.fbg}`)
    expect(v.hexColor2).to.equal(c.fg, `cls2 colour should be ${c.fg}`)
    expect(v.hexColor3).to.equal(c.pbg, `cls3 colour should be ${c.pbg}`)
    expect(v.hexColor4).to.equal(c.pfg, `cls4 colour should be ${c.pfg}`)
    // Check the 'height' attribute of the rect element
    expect(parseInt(v.height)).to.equal(0, `Height should be 0`)
  })
})