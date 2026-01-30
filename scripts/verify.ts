import { run, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

interface Deployment {
  MockUSDC: string;
  MockLagoonVault: string;
  MockLagoonVault_Asset: string;
  MockLagoonVault_Name: string;
  MockLagoonVault_Symbol: string;
  DepositRouter: string;
  DepositRouter_Treasury: string;
  Treasury: string;
  Network?: string;
}

async function main() {
  const deploymentPath = path.join(process.cwd(), "deployments", "hardhat.json");
  if (!fs.existsSync(deploymentPath)) {
    console.error("❌ deployments/hardhat.json not found. Deploy first: npm run deploy:sepolia");
    process.exit(1);
  }

  const deployment: Deployment = JSON.parse(
    fs.readFileSync(deploymentPath, "utf8")
  );

  console.log(`\n=== Verifying contracts on ${network.name} ===\n`);

  // 1. MockUSDC – no constructor args
  try {
    console.log("Verifying MockUSDC...");
    await run("verify:verify", {
      address: deployment.MockUSDC,
      contract: "contracts/MockUSDC.sol:MockUSDC",
      constructorArguments: [],
    });
    console.log("✓ MockUSDC verified\n");
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (err.message && /already verified/i.test(err.message)) {
      console.log("✓ MockUSDC already verified\n");
    } else {
      console.error("MockUSDC verification failed:", err.message ?? e);
    }
  }

  // 2. MockLagoonVault – (asset, name, symbol)
  try {
    console.log("Verifying MockLagoonVault...");
    await run("verify:verify", {
      address: deployment.MockLagoonVault,
      contract: "contracts/MockLagoonVault.sol:MockLagoonVault",
      constructorArguments: [
        deployment.MockLagoonVault_Asset || deployment.MockUSDC,
        deployment.MockLagoonVault_Name || "Mock Lagoon Vault",
        deployment.MockLagoonVault_Symbol || "MLV",
      ],
    });
    console.log("✓ MockLagoonVault verified\n");
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (err.message && /already verified/i.test(err.message)) {
      console.log("✓ MockLagoonVault already verified\n");
    } else {
      console.error("MockLagoonVault verification failed:", err.message ?? e);
    }
  }

  // 3. DepositRouter – (treasury)
  try {
    console.log("Verifying DepositRouter...");
    await run("verify:verify", {
      address: deployment.DepositRouter,
      contract: "contracts/DepositRouter.sol:DepositRouter",
      constructorArguments: [
        deployment.DepositRouter_Treasury || deployment.Treasury,
      ],
    });
    console.log("✓ DepositRouter verified\n");
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (err.message && /already verified/i.test(err.message)) {
      console.log("✓ DepositRouter already verified\n");
    } else {
      console.error("DepositRouter verification failed:", err.message ?? e);
    }
  }

  console.log("=== Verification done ===");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
