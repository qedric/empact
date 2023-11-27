# ZebraFramework

This is the official README for ZebraFramework, providing a foundation for diverse fundraising models.

## Mission

Our mission is to empower organisations, communities, and individuals to raise funds in a transparent and secure manner, and contribute to social impact initiatives through the innovative use of blockchain technology.

## Project Overview

ZebraFramework provides a white-label solution for fundraising platforms. Funds build on this framework feature the following characteristics:

- **Unlock Mechanism:** Each fund can be set to unlock according to parameters determined at the time of fund-creation.

- **Access to Funds:** funds are distributed via tokens that are NFTs based on the ERC-1155 standard; each NFT holder has a share of the corresponding fund.

- **Regenerative Finance:** Once funds have been distributed to all token holders, any further deposits are redistributed proportionally among other funds on the platform.

- **Dynamic Appearance:** ZebraFramework funds are represented by dynamic NFTs that change in appearance over time as they get closer to their maturity date.

## Use Cases

ZebraFramework fundraising platforms are versatile and can be used for various purposes, including:

1. **NGOs and Nonprofits:** NGOs can build out their own platform that empowers their donors with the transparency and confidence to give more, knowing their donation has already been allocated to the intended beneficiaries.

2. **Disaster Relief:** Instead of collecting donations via sharing Ethereum addresses on social media, ZebraFramework can be used to create funds that have a specific cause in mind. Trustworthy aid organisations can hold fund tokens, making it easy for people worldwide to contribute knowing their funds will go where they are intended.

3. **Personal Savings:** Parents can create a single-edition fund that unlocks on their child's 18th birthday, encouraging long-term savings.

4. **Fundraising for Projects:** Teams or organisations can divide funds by percentage, making it an ideal way to distribute funds among contributors.

5. **Long-Term Savings:** Self-organised pension funds or long-term savings initiatives can use ZebraFramework with a large number of tokens, unlocking when a specific balance is achieved. The tokens act like shares or bonds, allowing them to be bought and sold within the community. Royalties from token trading can be distributed back in to the community.

## Smart Contracts

### Main Contract - `factory.sol`

The `factory.sol` smart contract is the heart of the ZebraFramework ecosystem. It encompasses various features and functionalities for minting, managing, and interacting with ZebraFramework. Some of the contract's key features include:

- **Minting:** Authorized addresses can mint ZebraFramework using signed mint requests.

- **Customizable Fees:** The contract allows for setting fees for creating new ZebraFramework and for withdrawing funds from them.

- **Token URI:** The contract generates on-chain metadata for each CryptoFund, providing essential information about its state.

- **ERC-1155 Compliance:** ZebraFramework are compliant with the ERC-1155 standard, making them tradable and transferable.

- **Operator Roles:** Roles such as SIGNER_ROLE and DEFAULT_ADMIN_ROLE are defined to control contract operations.

### Fund Contract - `fund.sol`

The `Fund.sol` contract serves as the actual vault for each fund. It is cloned with each new fund creation and is responsible for keeping track of the balance, unlocking according to the target or maturity date, and facilitating withdrawals. 


### Generator Contract - `generator.sol`

The ZebraFramework Generator Contract is designed to generate the on-chain artwork for the ZebraFramework NFTs that represent each fund. This contract can be swapped out, so that the artwork can change over time.

- **Dynamic Appearance:** ZebraFramework fund NFTs change in appearance over time, reflecting their progress towards unlocking.

## Getting Started

To get introduced to ZebraFramework, visit our [website](https://zappfundraising.vercel.app//) to create your own fund or explore existing ones. You can also interact with the smart contract on the Ethereum blockchain.

## Contributing

We welcome contributions from the community to make ZebraFramework even better! If you're interested in contributing, please check out our [GitHub repository](https://github.com/qedric/zebraframework).

## Contact

If you have any questions or need assistance, feel free to contact us.

Thank you for being a part of the ZebraFramework community!

**Happy Saving, Fundraising, and Impacting!** 🐷🚀
