const { ethers } = require("hardhat");
const { extractAllABIs } = require("./extract-abi");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  // Deploy MockUSDC first
  console.log("\n=== Deploying MockUSDC ===");
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const mockUSDC = await MockUSDC.deploy();
  await mockUSDC.waitForDeployment();
  const mockUSDCAddress = await mockUSDC.getAddress();
  console.log("MockUSDC deployed to:", mockUSDCAddress);

  // Deploy MockLagoonVault (requires MockUSDC address)
  console.log("\n=== Deploying MockLagoonVault ===");
  const MockLagoonVault = await ethers.getContractFactory("MockLagoonVault");
  const vaultName = "Mock Lagoon Vault";
  const vaultSymbol = "MLV";
  const mockLagoonVault = await MockLagoonVault.deploy(
    mockUSDCAddress,
    vaultName,
    vaultSymbol
  );
  await mockLagoonVault.waitForDeployment();
  const mockLagoonVaultAddress = await mockLagoonVault.getAddress();
  console.log("MockLagoonVault deployed to:", mockLagoonVaultAddress);

  // Deploy DepositRouter (requires treasury address - using deployer for now)
  console.log("\n=== Deploying DepositRouter ===");
  const DepositRouter = await ethers.getContractFactory("DepositRouter");
  const treasuryAddress = deployer.address; // You can change this to your treasury address
  const depositRouter = await DepositRouter.deploy(treasuryAddress);
  await depositRouter.waitForDeployment();
  const depositRouterAddress = await depositRouter.getAddress();
  console.log("DepositRouter deployed to:", depositRouterAddress);

  // Summary
  console.log("\n=== Deployment Summary ===");
  console.log("MockUSDC:", mockUSDCAddress);
  console.log("MockLagoonVault:", mockLagoonVaultAddress);
  console.log("DepositRouter:", depositRouterAddress);
  console.log("Treasury:", treasuryAddress);

  // Save deployment addresses (optional - you can create a separate file for this)
  console.log("\n=== Save these addresses ===");
  const deploymentInfo = {
    MockUSDC: mockUSDCAddress,
    MockLagoonVault: mockLagoonVaultAddress,
    DepositRouter: depositRouterAddress,
    Treasury: treasuryAddress,
    Network: network.name,
    Deployer: deployer.address
  };
  console.log(JSON.stringify(deploymentInfo, null, 2));

  // Save deployment info to file
  const fs = require("fs");
  const path = require("path");
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  
  const deploymentFile = path.join(deploymentsDir, `${network.name}.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\n✓ Saved deployment info to ${deploymentFile}`);

  // Extract ABIs
  try {
    const abis = extractAllABIs();
    
    // Save deployment info with ABIs
    if (abis && Object.keys(abis).length > 0) {
      const deploymentWithABIs = {
        ...deploymentInfo,
        ABIs: abis
      };
      
      const deploymentWithABIsFile = path.join(deploymentsDir, `${network.name}-with-abis.json`);
      fs.writeFileSync(deploymentWithABIsFile, JSON.stringify(deploymentWithABIs, null, 2));
      console.log(`✓ Saved deployment info with ABIs to ${deploymentWithABIsFile}`);
    }
  } catch (error) {
    console.warn("Warning: Could not extract ABIs. Make sure contracts are compiled.");
    console.warn(error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
