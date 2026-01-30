import { ethers } from "hardhat";
import { extractAllABIs } from "./extract-abi";
import { encodeAllABIs } from "./encode-abi";
import { encodeAllConstructorArgs } from "./encode-constructor-args";
import * as fs from "fs";
import * as path from "path";

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
  console.log("  Constructor args - Asset:", mockUSDCAddress);
  console.log("  Constructor args - Name:", vaultName);
  console.log("  Constructor args - Symbol:", vaultSymbol);

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
  const network = await ethers.provider.getNetwork();
  const deploymentInfo = {
    MockUSDC: mockUSDCAddress,
    MockLagoonVault: mockLagoonVaultAddress,
    MockLagoonVault_Asset: mockUSDCAddress,
    MockLagoonVault_Name: vaultName,
    MockLagoonVault_Symbol: vaultSymbol,
    DepositRouter: depositRouterAddress,
    DepositRouter_Treasury: treasuryAddress,
    Treasury: treasuryAddress,
    Network: network.name,
    ChainId: network.chainId.toString(),
    Deployer: deployer.address
  };
  console.log(JSON.stringify(deploymentInfo, null, 2));

  // Save deployment info to file
  const deploymentsDir = path.join(process.cwd(), "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  
  // Always use hardhat.json as the deployment file name
  const deploymentFile = path.join(deploymentsDir, "hardhat.json");
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
      
      const deploymentWithABIsFile = path.join(deploymentsDir, "hardhat-with-abis.json");
      fs.writeFileSync(deploymentWithABIsFile, JSON.stringify(deploymentWithABIs, null, 2));
      console.log(`✓ Saved deployment info with ABIs to ${deploymentWithABIsFile}`);

      // Also encode ABIs (base64 by default)
      try {
        console.log("\n=== Encoding ABIs ===");
        const encodedABIs = encodeAllABIs('base64');
        
        if (encodedABIs && Object.keys(encodedABIs).length > 0) {
          deploymentInfo.EncodedABIs = {
            encoding: 'base64',
            abis: encodedABIs
          };
          
          // Update main deployment file with encoded ABIs
          const deploymentWithEncodedABIs = {
            ...deploymentInfo,
            EncodedABIs: {
              encoding: 'base64',
              abis: encodedABIs
            }
          };
          fs.writeFileSync(deploymentFile, JSON.stringify(deploymentWithEncodedABIs, null, 2));
          
          // Also save to separate file
          const encodedABIsFile = path.join(deploymentsDir, "hardhat-encoded-abis-base64.json");
          fs.writeFileSync(encodedABIsFile, JSON.stringify({
            encoding: 'base64',
            encodedABIs: encodedABIs,
            timestamp: new Date().toISOString()
          }, null, 2));
          console.log(`✓ Saved encoded ABIs to ${encodedABIsFile}`);
        }
      } catch (error: any) {
        console.warn("Warning: Could not encode ABIs.");
        console.warn(error.message);
      }
    }
  } catch (error: any) {
    console.warn("Warning: Could not extract ABIs. Make sure contracts are compiled.");
    console.warn(error.message);
  }

  // Encode constructor arguments
  try {
    console.log("\n=== Encoding Constructor Arguments ===");
    const encodedArgs = await encodeAllConstructorArgs(deploymentInfo);
    
    // Save deployment info with encoded constructor args
    const deploymentWithEncodedArgs = {
      ...deploymentInfo,
      ConstructorArgs: encodedArgs
    };
    
    fs.writeFileSync(deploymentFile, JSON.stringify(deploymentWithEncodedArgs, null, 2));
    console.log(`✓ Saved encoded constructor arguments to ${deploymentFile}`);
    
    // Also save to a separate file for easy access
    const encodedArgsFile = path.join(deploymentsDir, "hardhat-constructor-args.json");
    fs.writeFileSync(encodedArgsFile, JSON.stringify({
      network: network.name,
      chainId: network.chainId.toString(),
      constructorArgs: encodedArgs
    }, null, 2));
    console.log(`✓ Saved constructor arguments to ${encodedArgsFile}`);
    
    // Display encoded args
    console.log("\n=== Encoded Constructor Arguments ===");
    console.log("MockUSDC:", encodedArgs.MockUSDC || "No constructor args");
    console.log("MockLagoonVault:", encodedArgs.MockLagoonVault || "Failed to encode");
    console.log("DepositRouter:", encodedArgs.DepositRouter || "Failed to encode");
    console.log("\n💡 Use these for contract verification on Etherscan");
  } catch (error: any) {
    console.warn("Warning: Could not encode constructor arguments.");
    console.warn(error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
