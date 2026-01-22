require("dotenv").config();
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);

  const usdcAddress = process.env.TESTNET_USDC;
  const lagoonVaultAddress = process.env.LAGOON_VAULT;
  const yieldoTreasury = process.env.YIELDO_TREASURY;

  const Router = await hre.ethers.getContractFactory("YieldoDepositRouter");
  const router = await Router.deploy(usdcAddress, lagoonVaultAddress, yieldoTreasury);

  await router.deployed();
  console.log("YieldoDepositRouter deployed to:", router.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
