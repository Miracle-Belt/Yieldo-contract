import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Script to check if a deposit can be executed
 * Helps diagnose why deposits might be reverting
 */
async function main() {
  const [signer] = await ethers.getSigners();
  
  // Load deployment addresses
  const network = await ethers.provider.getNetwork();
  const deploymentsDir = path.join(process.cwd(), "deployments");
  
  // Always use hardhat.json as the deployment file name
  const deploymentFile = path.join(deploymentsDir, "hardhat.json");
  const networkName = network.name;
  
  if (!fs.existsSync(deploymentFile)) {
    console.log("⚠️  Deployment file not found:", deploymentFile);
    console.log("This script requires deployed contracts.");
    console.log("\nOptions:");
    console.log("1. Deploy to Sepolia: npm run deploy:sepolia");
    console.log("2. Deploy locally: npm run deploy:local");
    console.log("3. Deploy to default network: npm run deploy");
    process.exit(1);
  }
  
  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  
  // Get contract instances
  const mockUSDC = await ethers.getContractAt("MockUSDC", deployment.MockUSDC);
  const mockLagoonVault = await ethers.getContractAt("MockLagoonVault", deployment.MockLagoonVault);
  const depositRouter = await ethers.getContractAt("DepositRouter", deployment.DepositRouter);
  
  console.log("=== Deposit Prerequisites Check ===\n");
  console.log("Network:", networkName, `(chainId: ${network.chainId})`);
  console.log("Checker Address:", signer.address);
  console.log("\nContract Addresses:");
  console.log("MockUSDC:", deployment.MockUSDC);
  console.log("MockLagoonVault:", deployment.MockLagoonVault);
  console.log("DepositRouter:", deployment.DepositRouter);
  console.log("Treasury:", deployment.Treasury);
  
  // Check user balance
  const userBalance = await mockUSDC.balanceOf(signer.address);
  console.log("\n=== User Balance ===");
  console.log("USDC Balance:", ethers.formatUnits(userBalance, 6), "USDC");
  
  // Check allowance
  const allowance = await mockUSDC.allowance(signer.address, deployment.DepositRouter);
  console.log("\n=== Router Allowance ===");
  console.log("Allowance:", ethers.formatUnits(allowance, 6), "USDC");
  console.log("Status:", allowance > 0n ? "✓ Approved" : "✗ NOT APPROVED - User needs to approve router");
  
  // Check vault state
  const isTotalAssetsValid = await mockLagoonVault.isTotalAssetsValid();
  console.log("\n=== Vault State ===");
  console.log("Is Total Assets Valid:", isTotalAssetsValid);
  console.log("Deposit Type:", isTotalAssetsValid ? "Synchronous" : "Asynchronous");
  
  // Check router fees
  const feesEnabled = await depositRouter.feesEnabled();
  const feeBps = await depositRouter.FEE_BPS();
  console.log("\n=== Fee Configuration ===");
  console.log("Fees Enabled:", feesEnabled);
  console.log("Fee BPS:", feeBps.toString(), "(0.1%)");
  
  // Check treasury
  const treasury = await depositRouter.treasury();
  console.log("\n=== Treasury ===");
  console.log("Treasury Address:", treasury);
  
  // Example deposit calculation
  const exampleAmount = ethers.parseUnits("1000", 6);
  console.log("\n=== Example Deposit Calculation ===");
  console.log("Example Amount:", ethers.formatUnits(exampleAmount, 6), "USDC");
  
  if (feesEnabled) {
    const totalFee = (exampleAmount * BigInt(feeBps)) / 10000n;
    const depositAmount = exampleAmount - totalFee;
    console.log("Total Fee:", ethers.formatUnits(totalFee, 6), "USDC");
    console.log("Deposit Amount (after fee):", ethers.formatUnits(depositAmount, 6), "USDC");
  } else {
    console.log("No fees - Full amount will be deposited");
  }
  
  // Recommendations
  console.log("\n=== Recommendations ===");
  if (allowance === 0n) {
    console.log("⚠️  User needs to approve the router to spend USDC tokens");
    console.log("   Call: mockUSDC.approve(routerAddress, amount)");
  }
  
  if (userBalance === 0n) {
    console.log("⚠️  User has no USDC balance");
    console.log("   User needs to get USDC tokens first");
  }
  
  if (!isTotalAssetsValid) {
    console.log("ℹ️  Vault is in async mode - deposits will be queued");
    console.log("   User will need to claim the deposit later when vault becomes ready");
  }
  
  console.log("\n=== Common Revert Reasons ===");
  console.log("1. Insufficient allowance - User hasn't approved router");
  console.log("2. Insufficient balance - User doesn't have enough USDC");
  console.log("3. Invalid signature - Signature doesn't match intent");
  console.log("4. Expired deadline - Intent deadline has passed");
  console.log("5. Nonce already used - Same nonce was used before");
  console.log("6. Deposit already executed - Same intent hash was used");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
