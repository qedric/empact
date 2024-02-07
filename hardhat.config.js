/** @type import('hardhat/config').HardhatUserConfig */
require("@nomicfoundation/hardhat-toolbox")
//require("@nomiclabs/hardhat-ethers")
require("hardhat-gas-reporter")
//require("hardhat-contract-sizer")
require('dotenv').config()
require('solidity-docgen')
require("solidity-coverage")

const { ALCHECMY_API_KEY_TEST, ALCHEMY_API_KEY_SEPOLIA, ETHERSCAN_API_KEY, PK } = process.env;

module.exports = {
  solidity: {
    version: '0.8.20',
    settings: {
      optimizer: {
        enabled: true,
        runs: 1200,
      },
    },
  },
  networks: {
    goerli: {
      url: `https://eth-goerli.alchemyapi.io/v2/${ALCHECMY_API_KEY_TEST}`,
      accounts: [PK]
    },
    sepolia: {
      url: `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY_SEPOLIA}`,
      accounts: [PK]
    },
    hardhat: {
    }
  },
  etherscan: {
    apiKey: `${ETHERSCAN_API_KEY}`
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    gasPrice: 20,
    coinmarketcap: '9ce1674f-8587-4207-877a-705d1429764b'
  },
  docgen: { 
    pages: `files`
  },
};