/**
 * Verify all prerequisites before calling verifyAndDeposit
 * Run this script to check if your deposit will succeed
 */

const { ethers } = require("hardhat");

async function verifyDepositPrerequisites(
  depositRouterAddress,
  tokenAddress,
  vaultAddress,
  userAddress,
  intent,
  signature
) {
  console.log("=== Verifying Deposit Prerequisites ===\n");

  const DepositRouter = await ethers.getContractFactory("DepositRouter");
  const depositRouter = DepositRouter.attach(depositRouterAddress);

  const IERC20 = await ethers.getContractFactory("MockUSDC");
  const token = IERC20.attach(tokenAddress);

  const ILagoonVault = await ethers.getContractFactory("MockLagoonVault");
  const vault = ILagoonVault.attach(vaultAddress);

  const checks = {
    passed: 0,
    failed: 0,
    warnings: 0,
  };

  // 1. Check token balance
  console.log("1. Checking token balance...");
  try {
    const balance = await token.balanceOf(userAddress);
    const amount = BigInt(intent.amount);
    if (balance >= amount) {
      console.log("   ✓ Sufficient balance:", ethers.formatUnits(balance, 6));
      checks.passed++;
    } else {
      console.log("   ✗ Insufficient balance!");
      console.log("     Required:", ethers.formatUnits(amount, 6));
      console.log("     Available:", ethers.formatUnits(balance, 6));
      checks.failed++;
    }
  } catch (error) {
    console.log("   ✗ Error checking balance:", error.message);
    checks.failed++;
  }

  // 2. Check token allowance
  console.log("\n2. Checking token allowance...");
  try {
    const allowance = await token.allowance(userAddress, depositRouterAddress);
    const amount = BigInt(intent.amount);
    if (allowance >= amount) {
      console.log("   ✓ Sufficient allowance:", ethers.formatUnits(allowance, 6));
      checks.passed++;
    } else {
      console.log("   ✗ Insufficient allowance!");
      console.log("     Required:", ethers.formatUnits(amount, 6));
      console.log("     Approved:", ethers.formatUnits(allowance, 6));
      console.log("     Fix: Call token.approve(router, amount)");
      checks.failed++;
    }
  } catch (error) {
    console.log("   ✗ Error checking allowance:", error.message);
    checks.failed++;
  }

  // 3. Check deadline
  console.log("\n3. Checking deadline...");
  try {
    const currentTime = Math.floor(Date.now() / 1000);
    const deadline = Number(intent.deadline);
    if (deadline > currentTime) {
      const timeLeft = deadline - currentTime;
      const hours = Math.floor(timeLeft / 3600);
      const minutes = Math.floor((timeLeft % 3600) / 60);
      console.log(`   ✓ Deadline valid (${hours}h ${minutes}m remaining)`);
      checks.passed++;
    } else {
      console.log("   ✗ Deadline expired!");
      console.log("     Current:", new Date(currentTime * 1000).toISOString());
      console.log("     Deadline:", new Date(deadline * 1000).toISOString());
      checks.failed++;
    }
  } catch (error) {
    console.log("   ✗ Error checking deadline:", error.message);
    checks.failed++;
  }

  // 4. Check nonce
  console.log("\n4. Checking nonce...");
  try {
    const nonceUsed = await depositRouter.usedNonces(userAddress, intent.nonce);
    if (!nonceUsed) {
      console.log("   ✓ Nonce is available");
      checks.passed++;
    } else {
      console.log("   ✗ Nonce already used!");
      console.log("     Fix: Use a different nonce");
      checks.failed++;
    }
  } catch (error) {
    console.log("   ✗ Error checking nonce:", error.message);
    checks.failed++;
  }

  // 5. Verify signature
  console.log("\n5. Verifying signature...");
  try {
    // Calculate intent hash
    const intentHash = ethers.keccak256(
      ethers.solidityPacked(
        ["address", "uint256", "address", "uint256"],
        [intent.user, intent.nonce, intent.vault, intent.amount]
      )
    );

    // Check if deposit already exists
    const existingDeposit = await depositRouter.getDeposit(intentHash);
    if (existingDeposit.timestamp === 0n) {
      console.log("   ✓ Deposit not yet executed");
      checks.passed++;
    } else {
      console.log("   ✗ Deposit already executed!");
      console.log("     Intent hash:", intentHash);
      checks.failed++;
    }

    // Try to verify signature (basic check)
    console.log("   ⚠ Signature verification requires EIP-712 domain");
    console.log("     Ensure chainId and verifyingContract are correct");
    checks.warnings++;
  } catch (error) {
    console.log("   ✗ Error verifying signature:", error.message);
    checks.failed++;
  }

  // 6. Check vault status
  console.log("\n6. Checking vault status...");
  try {
    const isReady = await vault.isTotalAssetsValid();
    if (isReady) {
      console.log("   ✓ Vault ready for sync deposits");
      checks.passed++;
    } else {
      console.log("   ⚠ Vault in async mode (deposit will be queued)");
      checks.warnings++;
    }
  } catch (error) {
    console.log("   ✗ Error checking vault:", error.message);
    checks.failed++;
  }

  // 7. Try static call (simulate transaction)
  console.log("\n7. Simulating transaction...");
  try {
    await depositRouter.verifyAndDeposit.staticCall(intent, signature);
    console.log("   ✓ Transaction simulation successful!");
    checks.passed++;
  } catch (error) {
    console.log("   ✗ Transaction simulation failed!");
    console.log("     Error:", error.message);
    
    // Try to decode error
    if (error.data) {
      try {
        const reason = depositRouter.interface.parseError(error.data);
        if (reason) {
          console.log("     Revert reason:", reason.name);
        }
      } catch {
        // Could not decode
      }
    }
    checks.failed++;
  }

  // Summary
  console.log("\n=== Summary ===");
  console.log(`✓ Passed: ${checks.passed}`);
  console.log(`✗ Failed: ${checks.failed}`);
  console.log(`⚠ Warnings: ${checks.warnings}`);

  if (checks.failed === 0) {
    console.log("\n✅ All checks passed! Transaction should succeed.");
  } else {
    console.log("\n❌ Some checks failed. Fix the issues above before proceeding.");
  }

  return checks;
}

// Example usage
async function main() {
  const [deployer, user] = await ethers.getSigners();

  // Example addresses - replace with your actual addresses
  const DEPOSIT_ROUTER = process.env.DEPOSIT_ROUTER_ADDRESS || "0x...";
  const TOKEN = process.env.TOKEN_ADDRESS || "0x...";
  const VAULT = process.env.VAULT_ADDRESS || "0x...";

  // Example intent - replace with your actual intent
  const intent = {
    user: user.address,
    vault: VAULT,
    asset: TOKEN,
    amount: ethers.parseUnits("1000", 6),
    nonce: 1,
    deadline: Math.floor(Date.now() / 1000) + 3600,
    kolAddress: ethers.ZeroAddress,
  };

  // You would generate signature here
  const signature = "0x..."; // Replace with actual signature

  await verifyDepositPrerequisites(
    DEPOSIT_ROUTER,
    TOKEN,
    VAULT,
    user.address,
    intent,
    signature
  );
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { verifyDepositPrerequisites };
