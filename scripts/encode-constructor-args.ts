import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Encode constructor arguments for a contract
 * @param contractName Name of the contract
 * @param args Constructor arguments
 * @returns ABI-encoded constructor arguments as hex string
 */
export async function encodeConstructorArgs(
  contractName: string,
  args: any[]
): Promise<string> {
  const ContractFactory = await ethers.getContractFactory(contractName);
  
  // If no args, return empty string (0x)
  if (args.length === 0) {
    return "0x";
  }
  
  // Get the constructor fragment from the interface
  // The constructor is a special fragment with type "constructor"
  const constructorFragment = ContractFactory.interface.fragments.find(
    (fragment: any) => fragment.type === "constructor"
  ) as ethers.ConstructorFragment | undefined;
  
  if (!constructorFragment) {
    throw new Error(`No constructor found for ${contractName} but args provided`);
  }
  
  if (constructorFragment.inputs.length !== args.length) {
    throw new Error(
      `Constructor argument count mismatch for ${contractName}: expected ${constructorFragment.inputs.length}, got ${args.length}`
    );
  }
  
  // Encode just the constructor arguments using the ABI encoder
  const inputTypes = constructorFragment.inputs.map((input: any) => input.type);
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(inputTypes, args);
  
  return encoded;
}

/**
 * Encode constructor arguments for all deployed contracts
 */
export async function encodeAllConstructorArgs(deploymentInfo: {
  MockUSDC: string;
  MockLagoonVault: string;
  MockLagoonVault_Asset: string;
  MockLagoonVault_Name: string;
  MockLagoonVault_Symbol: string;
  DepositRouter: string;
  DepositRouter_Treasury: string;
}): Promise<Record<string, string>> {
  const encoded: Record<string, string> = {};

  try {
    // MockUSDC - no constructor args
    const mockUSDCArgs: any[] = [];
    encoded.MockUSDC = await encodeConstructorArgs("MockUSDC", mockUSDCArgs);
    console.log("✓ Encoded MockUSDC constructor args:", encoded.MockUSDC);
  } catch (error: any) {
    console.warn("⚠️  Could not encode MockUSDC constructor args:", error.message);
  }

  try {
    // MockLagoonVault - (address _asset, string name, string symbol)
    const mockLagoonVaultArgs = [
      deploymentInfo.MockLagoonVault_Asset,
      deploymentInfo.MockLagoonVault_Name,
      deploymentInfo.MockLagoonVault_Symbol
    ];
    encoded.MockLagoonVault = await encodeConstructorArgs("MockLagoonVault", mockLagoonVaultArgs);
    console.log("✓ Encoded MockLagoonVault constructor args:", encoded.MockLagoonVault);
  } catch (error: any) {
    console.warn("⚠️  Could not encode MockLagoonVault constructor args:", error.message);
  }

  try {
    // DepositRouter - (address _treasury)
    const depositRouterArgs = [deploymentInfo.DepositRouter_Treasury];
    encoded.DepositRouter = await encodeConstructorArgs("DepositRouter", depositRouterArgs);
    console.log("✓ Encoded DepositRouter constructor args:", encoded.DepositRouter);
  } catch (error: any) {
    console.warn("⚠️  Could not encode DepositRouter constructor args:", error.message);
  }

  return encoded;
}

/**
 * Standalone script to encode constructor arguments
 */
async function main() {
  const network = await ethers.provider.getNetwork();
  const deploymentsDir = path.join(process.cwd(), "deployments");
  
  // Always use hardhat.json as the deployment file name
  const deploymentFile = path.join(deploymentsDir, "hardhat.json");
  
  if (!fs.existsSync(deploymentFile)) {
    console.error(`❌ Deployment file not found: ${deploymentFile}`);
    console.log("Please deploy contracts first using:");
    console.log("  npm run deploy:sepolia  (for Sepolia)");
    console.log("  npm run deploy:local   (for localhost)");
    console.log("  npm run deploy         (for default network)");
    process.exit(1);
  }
  
  const networkName = network.name;

  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));

  // Prepare deployment info with constructor arguments
  const deploymentInfo = {
    MockUSDC: deployment.MockUSDC,
    MockLagoonVault: deployment.MockLagoonVault,
    MockLagoonVault_Asset: deployment.MockUSDC || deployment.MockLagoonVault_Asset,
    MockLagoonVault_Name: deployment.MockLagoonVault_Name || "Mock Lagoon Vault",
    MockLagoonVault_Symbol: deployment.MockLagoonVault_Symbol || "MLV",
    DepositRouter: deployment.DepositRouter,
    DepositRouter_Treasury: deployment.Treasury || deployment.DepositRouter_Treasury
  };

  console.log("\n=== Encoding Constructor Arguments ===");
  console.log(`Using deployment file: ${deploymentFile}`);
  console.log(`Network: ${networkName} (chainId: ${network.chainId})\n`);
  
  const encodedArgs = await encodeAllConstructorArgs(deploymentInfo);

  // Save encoded args to deployment file
  const deploymentWithEncodedArgs = {
    ...deployment,
    ConstructorArgs: encodedArgs
  };

  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentWithEncodedArgs, null, 2));
  console.log(`\n✓ Saved encoded constructor arguments to ${deploymentFile}`);

  // Also save to a separate file for easy access
  const encodedArgsFile = path.join(deploymentsDir, "hardhat-constructor-args.json");
  fs.writeFileSync(encodedArgsFile, JSON.stringify({
    network: networkName,
    chainId: network.chainId.toString(),
    constructorArgs: encodedArgs
  }, null, 2));
  console.log(`✓ Saved constructor arguments to ${encodedArgsFile}`);

  // Display summary
  console.log("\n=== Encoded Constructor Arguments Summary ===");
  console.log("\nMockUSDC:");
  console.log("  Encoded Args:", encodedArgs.MockUSDC || "No constructor args");
  
  console.log("\nMockLagoonVault:");
  console.log("  Asset:", deploymentInfo.MockLagoonVault_Asset);
  console.log("  Name:", deploymentInfo.MockLagoonVault_Name);
  console.log("  Symbol:", deploymentInfo.MockLagoonVault_Symbol);
  console.log("  Encoded Args:", encodedArgs.MockLagoonVault || "Failed to encode");
  
  console.log("\nDepositRouter:");
  console.log("  Treasury:", deploymentInfo.DepositRouter_Treasury);
  console.log("  Encoded Args:", encodedArgs.DepositRouter || "Failed to encode");

  console.log("\n💡 Use these encoded arguments for contract verification on Etherscan:");
  console.log("   Example: hardhat verify --constructor-args <encoded-args> <contract-address>");
  console.log("\n   For MockLagoonVault:");
  console.log(`   hardhat verify --constructor-args ${encodedArgs.MockLagoonVault} ${deploymentInfo.MockLagoonVault}`);
  console.log("\n   For DepositRouter:");
  console.log(`   hardhat verify --constructor-args ${encodedArgs.DepositRouter} ${deploymentInfo.DepositRouter}`);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
