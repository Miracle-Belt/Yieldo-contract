import * as fs from "fs";
import * as path from "path";

/**
 * Encode ABI JSON file to base64 or hex
 * @param abiPath Path to the ABI JSON file
 * @param encoding 'base64' or 'hex'
 * @returns Encoded string
 */
function encodeABIFile(abiPath: string, encoding: 'base64' | 'hex' = 'base64'): string {
  if (!fs.existsSync(abiPath)) {
    throw new Error(`ABI file not found: ${abiPath}`);
  }

  const abiContent = fs.readFileSync(abiPath, "utf8");
  
  if (encoding === 'base64') {
    return Buffer.from(abiContent).toString('base64');
  } else {
    return Buffer.from(abiContent).toString('hex');
  }
}

/**
 * Encode all ABI files in the abis directory
 */
function encodeAllABIs(encoding: 'base64' | 'hex' = 'base64'): Record<string, string> {
  const abisDir = path.join(process.cwd(), "abis");
  
  if (!fs.existsSync(abisDir)) {
    throw new Error(`ABIs directory not found: ${abisDir}`);
  }

  const contracts = ["MockUSDC", "MockLagoonVault", "DepositRouter"];
  const encoded: Record<string, string> = {};

  console.log(`\n=== Encoding ABIs (${encoding}) ===\n`);

  contracts.forEach((contractName) => {
    const abiPath = path.join(abisDir, `${contractName}.json`);
    
    if (fs.existsSync(abiPath)) {
      try {
        encoded[contractName] = encodeABIFile(abiPath, encoding);
        console.log(`✓ Encoded ${contractName}.json`);
      } catch (error: any) {
        console.warn(`⚠️  Could not encode ${contractName}:`, error.message);
      }
    } else {
      console.warn(`⚠️  ABI file not found: ${abiPath}`);
    }
  });

  return encoded;
}

/**
 * Decode encoded ABI back to JSON
 * @param encoded Encoded ABI string
 * @param encoding 'base64' or 'hex'
 * @returns Decoded JSON string
 */
export function decodeABI(encoded: string, encoding: 'base64' | 'hex' = 'base64'): string {
  if (encoding === 'base64') {
    return Buffer.from(encoded, 'base64').toString('utf8');
  } else {
    return Buffer.from(encoded, 'hex').toString('utf8');
  }
}

/**
 * Save encoded ABIs to deployment file
 */
async function main() {
  const encoding = (process.argv[2] as 'base64' | 'hex') || 'base64';
  
  if (encoding !== 'base64' && encoding !== 'hex') {
    console.error("Invalid encoding. Use 'base64' or 'hex'");
    process.exit(1);
  }

  try {
    // Encode all ABIs
    const encodedABIs = encodeAllABIs(encoding);

    if (Object.keys(encodedABIs).length === 0) {
      console.error("No ABIs found to encode. Run 'npm run extract-abi' first.");
      process.exit(1);
    }

    // Load deployment file
    const deploymentsDir = path.join(process.cwd(), "deployments");
    const deploymentFile = path.join(deploymentsDir, "hardhat.json");

    let deployment: any = {};
    if (fs.existsSync(deploymentFile)) {
      deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
    }

    // Add encoded ABIs to deployment
    deployment.EncodedABIs = {
      encoding: encoding,
      abis: encodedABIs
    };

    // Save to deployment file
    fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));
    console.log(`\n✓ Saved encoded ABIs to ${deploymentFile}`);

    // Also save to a separate file
    const encodedABIsFile = path.join(deploymentsDir, `hardhat-encoded-abis-${encoding}.json`);
    fs.writeFileSync(encodedABIsFile, JSON.stringify({
      encoding: encoding,
      encodedABIs: encodedABIs,
      timestamp: new Date().toISOString()
    }, null, 2));
    console.log(`✓ Saved encoded ABIs to ${encodedABIsFile}`);

    // Display summary
    console.log("\n=== Encoded ABIs Summary ===");
    console.log(`Encoding: ${encoding}`);
    console.log(`\nEncoded ABIs:`);
    Object.keys(encodedABIs).forEach(contractName => {
      const encoded = encodedABIs[contractName];
      console.log(`  ${contractName}: ${encoded.substring(0, 50)}... (${encoded.length} chars)`);
    });

    console.log("\n💡 To decode an ABI, use the decodeABI function:");
    console.log("   import { decodeABI } from './scripts/encode-abi';");
    console.log("   const decoded = decodeABI(encodedString, 'base64');");

  } catch (error: any) {
    console.error("Error encoding ABIs:", error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { encodeABIFile, encodeAllABIs };
