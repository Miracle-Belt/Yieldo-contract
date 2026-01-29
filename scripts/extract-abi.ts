import * as fs from "fs";
import * as path from "path";

interface Artifact {
  abi: any[];
}

/**
 * Extract ABI from compiled artifacts and save to abis folder
 */
export function extractABI(contractName: string): any[] | null {
  // Use process.cwd() for paths since __dirname doesn't work in TS with CommonJS
  const artifactPath = path.join(
    process.cwd(),
    "artifacts",
    "contracts",
    `${contractName}.sol`,
    `${contractName}.json`
  );

  if (!fs.existsSync(artifactPath)) {
    console.error(`Artifact not found for ${contractName} at ${artifactPath}`);
    return null;
  }

  const artifact: Artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const abi = artifact.abi;

  // Create abis directory if it doesn't exist
  const abisDir = path.join(process.cwd(), "abis");
  if (!fs.existsSync(abisDir)) {
    fs.mkdirSync(abisDir, { recursive: true });
  }

  // Save ABI to file
  const abiPath = path.join(abisDir, `${contractName}.json`);
  fs.writeFileSync(abiPath, JSON.stringify(abi, null, 2));
  console.log(`✓ Extracted ABI for ${contractName} -> ${abiPath}`);

  return abi;
}

/**
 * Extract all contract ABIs
 */
export function extractAllABIs(): Record<string, any[]> {
  const contracts = ["MockUSDC", "MockLagoonVault", "DepositRouter"];
  const abis: Record<string, any[]> = {};

  console.log("\n=== Extracting ABIs ===");
  
  contracts.forEach((contractName) => {
    const abi = extractABI(contractName);
    if (abi) {
      abis[contractName] = abi;
    }
  });

  // Save all ABIs to a single file
  const abisDir = path.join(process.cwd(), "abis");
  if (!fs.existsSync(abisDir)) {
    fs.mkdirSync(abisDir, { recursive: true });
  }

  const allABIsPath = path.join(abisDir, "all.json");
  fs.writeFileSync(allABIsPath, JSON.stringify(abis, null, 2));
  console.log(`✓ Saved all ABIs to ${allABIsPath}`);

  return abis;
}

// Run if called directly
if (require.main === module) {
  extractAllABIs();
}
