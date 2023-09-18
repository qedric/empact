# cryptopiggies

Welcome to the official README for cryptoPiggies, the community for creating and managing digital piggy-banks in the world of blockchain and NFTs!

## Mission

At cryptoPiggies, our mission is to empower individuals, communities, and organisations to save, fundraise for various causes, and contribute to social impact initiatives through the innovative use of blockchain technology.

## Project Overview

cryptopiggies are digital piggy-banks represented as NFTs (Non-Fungible Tokens). These unique piggy-banks have the following key features:

- **Customizable:** cryptopiggies are white-label, allowing anyone to create their own piggy-bank with unique parameters.

- **Unlock Mechanism:** Each cryptopiggy can be set to unlock either on a specified date in the future or when a target balance is reached.

- **NFT Ownership:** cryptopiggy NFTs are based on the ERC-1155 standard, and each NFT holder has a share of the corresponding piggy-bank.

- **Dynamic Appearance:** cryptopiggies are dynamic NFTs that change in appearance over time as they get closer to their unlock date.

## Use Cases

cryptopiggies are versatile and can be used for various purposes, including:

1. **Disaster Relief:** Instead of collecting donations via sharing Ethereum addresses on social media, cryptopiggies can be created with a specific cause in mind. Trustworthy charities can hold these piggy-banks, making it easy for people worldwide to contribute, knowing their funds are in safe hands.

2. **Personal Savings:** Parents can create a single-edition cryptopiggy that unlocks on their child's 18th birthday, encouraging long-term savings.

3. **Fundraising for Projects:** Teams or organisations can create cryptopiggies with multiple editions, where each NFT represents a percentage of the funds. This makes it an ideal way to distribute funds among contributors.

4. **Long-Term Savings:** Self-organised pension funds or long-term savings initiatives can create cryptopiggies with a large number of editions, unlocking when a specific balance is achieved. The NFTs act like shares, allowing them to be bought and sold within the community.

## Smart Contracts

### Main Contract - `cryptopiggies.sol`

The `CryptoPiggies.sol` smart contract is the heart of the CryptoPiggies ecosystem. It encompasses various features and functionalities for minting, managing, and interacting with CryptoPiggies. Some of the contract's key features include:

- **Minting:** Authorized addresses can mint CryptoPiggies using signed mint requests.

- **Customizable Fees:** The contract allows for setting fees for creating new CryptoPiggies and for withdrawing funds from them.

- **Dynamic Appearance:** CryptoPiggies change in appearance over time, reflecting their progress towards unlocking.

- **Token URI:** The contract generates on-chain metadata for each CryptoPiggy, providing essential information about its state.

- **ERC-1155 Compliance:** CryptoPiggies are compliant with the ERC-1155 standard, making them tradable and transferable.

- **Operator Roles:** Roles such as MINTER_ROLE and DEFAULT_ADMIN_ROLE are defined to control contract operations.

### PiggyBank Contract - `piggyBank.sol`

The `PiggyBank.sol` contract serves as the actual piggy-bank for each cryptoPiggy. It is cloned with each new cryptoPiggy and is responsible for keeping track of the balance, unlocking according to the target or maturity date, and facilitating withdrawals. 


### Generator Contract - `generator.sol`

The CryptoPiggies Generator Contract is designed to generate the on-chain artwork for the cryptopiggies NFTs. This contract can be swapped out in the future, so that the artwork can change over time. 

## Getting Started

To get started with cryptopiggies, visit our [website](https://cryptopiggies.io/) to create your own cryptopiggy or explore existing ones. You can also interact with the smart contract on the Ethereum blockchain.

## Contributing

We welcome contributions from the community to make cryptopiggies even better! If you're interested in contributing, please check out our [GitHub repository](https://github.com/qedric/piggies-contract).

## Contact

If you have any questions or need assistance, feel free to contact us at [contact@cryptopiggies.io](mailto:hello@cryptopiggies.io).

Thank you for being a part of the cryptopiggies community!

**Happy Saving, Fundraising, and Impacting!** 🐷🚀