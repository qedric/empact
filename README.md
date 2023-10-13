# cryptofunds

Welcome to the official README for cryptofunds, the community for creating and managing decentralised funds in the world of blockchain and DeFi

## Mission

At cryptofunds, our mission is to empower individuals, communities, and organisations to save, fundraise for various causes, and contribute to social impact initiatives through the innovative use of blockchain technology.

## Project Overview

cryptofunds are digital fund- represented as NFTs (Non-Fungible Tokens). These unique fund- have the following key features:

- **Customizable:** cryptofunds are white-label, allowing anyone to create their own fund-bank with unique parameters.

- **Unlock Mechanism:** Each cryptofund can be set to unlock either on a specified date in the future or when a target balance is reached.

- **NFT Ownership:** cryptofund NFTs are based on the ERC-1155 standard, and each NFT holder has a share of the corresponding fund-bank.

- **Dynamic Appearance:** cryptofunds are dynamic NFTs that change in appearance over time as they get closer to their unlock date.

## Use Cases

cryptofunds are versatile and can be used for various purposes, including:

1. **Disaster Relief:** Instead of collecting donations via sharing Ethereum addresses on social media, cryptofunds can be created with a specific cause in mind. Trustworthy charities can hold these fund-, making it easy for people worldwide to contribute, knowing their funds are in safe hands.

2. **Personal Savings:** Parents can create a single-edition cryptofund that unlocks on their child's 18th birthday, encouraging long-term savings.

3. **Fundraising for Projects:** Teams or organisations can create cryptofunds with multiple editions, where each NFT represents a percentage of the funds. This makes it an ideal way to distribute funds among contributors.

4. **Long-Term Savings:** Self-organised pension funds or long-term savings initiatives can create cryptofunds with a large number of editions, unlocking when a specific balance is achieved. The NFTs act like shares, allowing them to be bought and sold within the community.

## Smart Contracts

### Main Contract - `factory.sol`

The `factory.sol` smart contract is the heart of the cryptofunds ecosystem. It encompasses various features and functionalities for minting, managing, and interacting with cryptofunds. Some of the contract's key features include:

- **Minting:** Authorized addresses can mint cryptofunds using signed mint requests.

- **Customizable Fees:** The contract allows for setting fees for creating new cryptofunds and for withdrawing funds from them.

- **Dynamic Appearance:** cryptofunds change in appearance over time, reflecting their progress towards unlocking.

- **Token URI:** The contract generates on-chain metadata for each CryptoFund, providing essential information about its state.

- **ERC-1155 Compliance:** cryptofunds are compliant with the ERC-1155 standard, making them tradable and transferable.

- **Operator Roles:** Roles such as MINTER_ROLE and DEFAULT_ADMIN_ROLE are defined to control contract operations.

### Fund Contract - `fund.sol`

The `Fund.sol` contract serves as the actual fund-bank for each cryptoFund. It is cloned with each new cryptoFund and is responsible for keeping track of the balance, unlocking according to the target or maturity date, and facilitating withdrawals. 


### Generator Contract - `generator.sol`

The cryptofunds Generator Contract is designed to generate the on-chain artwork for the cryptofunds NFTs. This contract can be swapped out in the future, so that the artwork can change over time. 

## Getting Started

To get started with cryptofunds, visit our [website](https://cryptofunds.io/) to create your own cryptofund or explore existing ones. You can also interact with the smart contract on the Ethereum blockchain.

## Contributing

We welcome contributions from the community to make cryptofunds even better! If you're interested in contributing, please check out our [GitHub repository](https://github.com/qedric/funds-contract).

## Contact

If you have any questions or need assistance, feel free to contact us at [hello@cryptofunds.io](mailto:hello@cryptofunds.io).

Thank you for being a part of the cryptofunds community!

**Happy Saving, Fundraising, and Impacting!** 🐷🚀