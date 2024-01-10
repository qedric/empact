# empact protocol

This is the official README for empact protocol, providing a foundation for diverse fundraising & asset management models.

## Mission

Our mission is to empower organisations, communities, and individuals to raise funds and manage tokenised real-world and digital assets in a transparent and secure manner, and contribute to social impact initiatives through the innovative use of blockchain technology.

## Project Overview

empact protocol provides a white-label solution for fundraising & asset management platforms. Our empact vaults feature the following characteristics:

- **Unlock Mechanism:** Each vault can be set to unlock according to parameters determined at the time of vault-creation.

- **Access to Vaults:** vaults are distributed via tokens that are NFTs based on the ERC-1155 standard; each NFT holder has a share of the corresponding vault.

- **Regenerative Finance:** Once vaults have been distributed to all token holders, any further deposits are redistributed proportionally among other vaults on the platform.

- **Dynamic Appearance:** empact protocol vaults are represented by dynamic NFTs that change in appearance over time as they get closer to their maturity date.

## Use Cases

empact protocol fundraising & asset management vaults are versatile and can be used for various purposes, including:

1. **NGOs and Nonprofits:** NGOs can build out their own platform that empowers their donors with the transparency and confidence to give more, knowing their donation has already been allocated to the intended beneficiaries.

2. **Disaster Relief:** Instead of collecting donations via sharing crypto addresses on social media, empact protocol can be used to create fundraising initiatives that have a specific cause in mind. Trustworthy aid organisations can hold vault tokens, making it easy for people worldwide to contribute knowing their funds will go where they are intended.

3. **Real-World Assets (RWAs):** empact vaults can lock up tokensied RWAs such as treasury bonds or real-estate tokens, allowing the asset to be further tokenised and traded on the existing NFT marketplaces without risking the underlying asset.

4. **Personal Savings:** Parents can create a single-edition vault that unlocks on their child's 18th birthday, encouraging long-term savings.

5. **Fundraising for Projects:** Teams or organisations can divide vault funds by percentage, making it an ideal way to distribute funds among contributors.

6. **Long-Term Savings:** Self-organised pension funds or long-term savings initiatives can use empact vaults with a large number of tokens, unlocking when a specific balance is achieved. The tokens act like shares or bonds, allowing them to be bought and sold within the community. Royalties from token trading can be distributed back in to the community.

## Smart Contracts

### Main Contract - `factory.sol`

The `factory.sol` smart contract is the heart of the empact protocol ecosystem. It encompasses various features and functionalities for minting, managing, and interacting with empact protocol. Some of the contract's key features include:

- **Minting:** Authorized addresses can mint empact vaults using signed mint requests.

- **Customizable Fees:** The contract allows for setting fees for creating new empact vaults and for withdrawing assets from them.

- **Token URI:** The contract generates on-chain metadata for each empact vault, providing essential information about its state.

- **ERC-1155 Compliance:** empact vaults implement the ERC-1155 standard, making them tradable and transferable NFTs.

- **Operator Roles:** Roles such as SIGNER_ROLE and DEFAULT_ADMIN_ROLE are defined to control contract operations.

### Vault Contract - `vault.sol`

The `Vault.sol` contract serves as the actual non-custodial vault to secure assets on-chain. It is cloned with each new vault creation and is responsible for keeping track of the balance, unlocking according to the unlock conditions, and facilitating withdrawals. 


### Generator Contract - `generator.sol`

The Generator Contract is designed to generate the on-chain artwork for the empact protocol NFTs that represent each vault. This contract can be swapped out, so that the artwork can change over time.

- **Dynamic Appearance:** empact protocol vault NFTs change in appearance over time, reflecting their progress towards unlocking.

## Getting Started

To get introduced to empact protocol, visit our [website](https://zappfundraising.vercel.app//) to create your own vault or explore existing ones. You can also interact with the smart contract on the Ethereum blockchain.

## Contributing

We welcome contributions from the community to make empact protocol even better! If you're interested in contributing, please check out our [GitHub repository](https://github.com/qedric/empact).

## Contact

If you have any questions or need assistance, feel free to contact us.

Thank you for being a part of the empact protocol community!

**Happy Saving, Vaultraising, and Impacting!** 🐷🚀
