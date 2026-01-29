import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying DepositRouter with the account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  // Get treasury address from command line or use deployer address
  const treasuryAddress = process.env.TREASURY_ADDRESS || process.argv[2] || deployer.address;
  
  console.log("Using Treasury address:", treasuryAddress);

  const DepositRouter = await ethers.getContractFactory("DepositRouter");
  const depositRouter = await DepositRouter.deploy(treasuryAddress);
  await depositRouter.waitForDeployment();
  const depositRouterAddress = await depositRouter.getAddress();

  const network = await ethers.provider.getNetwork();
  console.log("DepositRouter deployed to:", depositRouterAddress);
  console.log("Network:", network.name);
  
  // Verify deployment
  const treasury = await depositRouter.treasury();
  const feesEnabled = await depositRouter.feesEnabled();
  const feeBps = await depositRouter.FEE_BPS();
  const kolFeeShare = await depositRouter.KOL_FEE_SHARE();
  const yieldoFeeShare = await depositRouter.YIELDO_FEE_SHARE();
  
  console.log("\n=== Contract Details ===");
  console.log("Treasury:", treasury);
  console.log("Fees Enabled:", feesEnabled);
  console.log("Fee BPS:", feeBps.toString());
  console.log("KOL Fee Share:", kolFeeShare.toString() + "%");
  console.log("Yieldo Fee Share:", yieldoFeeShare.toString() + "%");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
