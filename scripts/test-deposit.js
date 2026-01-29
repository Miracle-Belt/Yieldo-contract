const { ethers } = require("hardhat");
const { signDepositIntent, createDepositIntent } = require("../test/helpers/setup");

/**
 * Test script to make a deposit on deployed contracts
 * This helps verify the deposit flow works correctly
 */
async function main() {
  const [user] = await ethers.getSigners();
  
  // Load deployment addresses
  const network = await ethers.provider.getNetwork();
  const fs = require("fs");
  const path = require("path");
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  
  // Try to find deployment file
  let deploymentFile;
  let networkName = network.name;
  
  // Check if deployment file exists for current network
  const currentNetworkFile = path.join(deploymentsDir, `${networkName}.json`);
  
  if (fs.existsSync(currentNetworkFile)) {
    deploymentFile = currentNetworkFile;
  } else {
    // Try to find any deployment file
    const files = fs.readdirSync(deploymentsDir).filter(f => f.endsWith('.json') && !f.includes('-with-abis'));
    
    if (files.length === 0) {
      console.log("⚠️  No deployment files found.");
      console.log("This script requires deployed contracts.");
      console.log("\nOptions:");
      console.log("1. Deploy to Sepolia: npm run deploy:sepolia");
      console.log("2. Deploy locally: npm run deploy:local");
      console.log("3. Test on specific network: npm run test-deposit:sepolia");
      process.exit(1);
    } else if (files.length === 1) {
      // Use the only available deployment
      networkName = files[0].replace('.json', '');
      deploymentFile = path.join(deploymentsDir, files[0]);
      console.log(`⚠️  No deployment found for ${network.name}, using ${networkName} deployment`);
    } else {
      // Multiple deployments available
      console.log("⚠️  No deployment file found for current network:", network.name);
      console.log("Available deployments:", files.map(f => f.replace('.json', '')).join(', '));
      console.log("\nPlease specify a network:");
      console.log("  npm run test-deposit:sepolia");
      console.log("  npm run test-deposit -- --network <network-name>");
      process.exit(1);
    }
  }
  
  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  
  // Get contract instances
  const mockUSDC = await ethers.getContractAt("MockUSDC", deployment.MockUSDC);
  const mockLagoonVault = await ethers.getContractAt("MockLagoonVault", deployment.MockLagoonVault);
  const depositRouter = await ethers.getContractAt("DepositRouter", deployment.DepositRouter);
  
  console.log("=== Testing Deposit ===\n");
  console.log("User:", user.address);
  console.log("Network:", network.name);
  
  // Check prerequisites
  const userBalance = await mockUSDC.balanceOf(user.address);
  const allowance = await mockUSDC.allowance(user.address, deployment.DepositRouter);
  const depositAmount = ethers.parseUnits("100", 6); // 100 USDC
  
  console.log("\n=== Prerequisites ===");
  console.log("User Balance:", ethers.formatUnits(userBalance, 6), "USDC");
  console.log("Router Allowance:", ethers.formatUnits(allowance, 6), "USDC");
  console.log("Deposit Amount:", ethers.formatUnits(depositAmount, 6), "USDC");
  
  if (userBalance < depositAmount) {
    console.error("\n❌ Insufficient balance! Minting tokens...");
    const mintTx = await mockUSDC.mint(user.address, depositAmount);
    await mintTx.wait();
    console.log("✓ Tokens minted");
  }
  
  if (allowance < depositAmount) {
    console.log("\n⚠️  Insufficient allowance! Approving router...");
    const approveTx = await mockUSDC.approve(deployment.DepositRouter, depositAmount);
    await approveTx.wait();
    console.log("✓ Router approved");
  }
  
  // Check vault state
  const isTotalAssetsValid = await mockLagoonVault.isTotalAssetsValid();
  console.log("\n=== Vault State ===");
  console.log("Is Total Assets Valid:", isTotalAssetsValid);
  
  // Create deposit intent
  // Use a unique nonce - timestamp ensures uniqueness
  const nonce = Date.now();
  const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
  
  const intent = createDepositIntent(
    user.address,
    deployment.MockLagoonVault,
    deployment.MockUSDC,
    depositAmount,
    nonce,
    deadline,
    ethers.ZeroAddress // No KOL for testing
  );
  
  console.log("\n=== Creating Deposit Intent ===");
  console.log("User:", intent.user);
  console.log("Vault:", intent.vault);
  console.log("Asset:", intent.asset);
  console.log("Amount:", ethers.formatUnits(intent.amount, 6), "USDC");
  console.log("Nonce:", intent.nonce.toString());
  console.log("Deadline:", new Date(Number(intent.deadline) * 1000).toISOString());
  
  // Sign intent
  console.log("\n=== Signing Intent ===");
  const signature = await signDepositIntent(user, depositRouter, intent);
  console.log("Signature created");
  
  // Execute deposit
  console.log("\n=== Executing Deposit ===");
  try {
    const tx = await depositRouter.verifyAndDeposit(intent, signature);
    console.log("Transaction hash:", tx.hash);
    
    const receipt = await tx.wait();
    console.log("✓ Deposit successful!");
    console.log("Gas used:", receipt.gasUsed.toString());
    
    // Check events
    const events = receipt.logs
      .map(log => {
        try {
          return depositRouter.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .filter(e => e !== null);
    
    console.log("\n=== Events ===");
    events.forEach(event => {
      console.log(`- ${event.name}`);
    });
    
    // Check vault shares
    const shares = await mockLagoonVault.balanceOf(user.address);
    console.log("\n=== Result ===");
    console.log("Vault Shares:", ethers.formatUnits(shares, 6));
    
  } catch (error) {
    console.error("\n❌ Deposit failed!");
    console.error("Error:", error.message);
    
    // Try to decode revert reason
    if (error.data) {
      try {
        const reason = depositRouter.interface.parseError(error.data);
        console.error("Revert reason:", reason.name);
      } catch {
        console.error("Could not decode revert reason");
      }
    }
    
    // Common issues
    console.log("\n=== Troubleshooting ===");
    console.log("1. Check if user has approved the router");
    console.log("2. Check if user has sufficient balance");
    console.log("3. Check if deadline is valid");
    console.log("4. Check if nonce is unique");
    console.log("5. Check if signature is correct");
    
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
