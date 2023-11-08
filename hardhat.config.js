/** @type import('hardhat/config').HardhatUserConfig */
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require("hardhat-gas-reporter");
require('dotenv').config();

const { ALCHECMY_API_KEY_TEST, ETHERSCAN_API_KEY, PK } = process.env;

module.exports = {
  solidity: {
    version: '0.8.11',
    settings: {
      optimizer: {
        enabled: true,
        runs: 800,
      },
    },
  },
  networks: {
    goerli: {
      url: `https://eth-goerli.alchemyapi.io/v2/${ALCHECMY_API_KEY_TEST}`,
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
};