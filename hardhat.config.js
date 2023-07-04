/** @type import('hardhat/config').HardhatUserConfig */
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
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
      chainId: 1337,
      forking: {
        url: `https://eth-goerli.alchemyapi.io/v2/${ALCHECMY_API_KEY_TEST}`,
      }
    }
  },
  etherscan: {
    apiKey: `${ETHERSCAN_API_KEY}`
  }
};
