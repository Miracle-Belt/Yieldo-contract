import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying MockLagoonVault with the account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  // Get MockUSDC address from command line or use default
  const mockUSDCAddress = process.env.MOCK_USDC_ADDRESS || process.argv[2];
  
  if (!mockUSDCAddress) {
    throw new Error("Please provide MockUSDC address as argument or set MOCK_USDC_ADDRESS env variable");
  }

  console.log("Using MockUSDC address:", mockUSDCAddress);

  const MockLagoonVault = await ethers.getContractFactory("MockLagoonVault");
  const vaultName = process.env.VAULT_NAME || "Mock Lagoon Vault";
  const vaultSymbol = process.env.VAULT_SYMBOL || "MLV";
  
  const mockLagoonVault = await MockLagoonVault.deploy(
    mockUSDCAddress,
    vaultName,
    vaultSymbol
  );
  await mockLagoonVault.waitForDeployment();
  const mockLagoonVaultAddress = await mockLagoonVault.getAddress();

  const network = await ethers.provider.getNetwork();
  console.log("MockLagoonVault deployed to:", mockLagoonVaultAddress);
  console.log("Network:", network.name);
  
  // Verify deployment
  const asset = await mockLagoonVault.asset();
  const name = await mockLagoonVault.name();
  const symbol = await mockLagoonVault.symbol();
  const isTotalAssetsValid = await mockLagoonVault.isTotalAssetsValid();
  
  console.log("\n=== Contract Details ===");
  console.log("Asset:", asset);
  console.log("Name:", name);
  console.log("Symbol:", symbol);
  console.log("Total Assets Valid:", isTotalAssetsValid);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
