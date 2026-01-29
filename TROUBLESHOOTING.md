# Troubleshooting MetaMask Gas Estimation Issues

## Problem: "We're unable to provide an accurate fee and this estimate might be high"

This error occurs when MetaMask cannot estimate gas because the transaction would revert during simulation. Here's how to fix it:

## Common Causes and Solutions

### 1. **Invalid Signature** (Most Common)
**Symptom**: Gas estimation fails immediately

**Causes**:
- Wrong chain ID in EIP-712 domain
- Wrong contract address in `verifyingContract`
- Struct field order mismatch
- Signature signed by wrong wallet

**Solution**:
```javascript
// Verify your EIP-712 domain matches exactly:
const domain = {
  name: "YieldoDepositRouter",
  version: "1",
  chainId: 11155111, // Sepolia - check your network!
  verifyingContract: "0x..." // Your DepositRouter address
};

// Verify struct order matches contract:
// user, vault, asset, amount, nonce, deadline, kolAddress
const intent = {
  user: "0x...",
  vault: "0x...",
  asset: "0x...",
  amount: ethers.parseUnits("1000", 6),
  nonce: 1,
  deadline: Math.floor(Date.now() / 1000) + 3600,
  kolAddress: "0x..."
};
```

### 2. **Insufficient Token Allowance**
**Symptom**: Gas estimation fails

**Solution**:
```javascript
// Approve BEFORE calling verifyAndDeposit
await token.approve(depositRouterAddress, amount);
// Wait for confirmation
await approveTx.wait();
// Then call verifyAndDeposit
```

### 3. **Insufficient Token Balance**
**Symptom**: Gas estimation fails

**Solution**:
```javascript
// Check balance first
const balance = await token.balanceOf(userAddress);
if (balance < amount) {
  console.error("Insufficient balance!");
}
```

### 4. **Expired Deadline**
**Symptom**: Gas estimation fails

**Solution**:
```javascript
// Ensure deadline is in the future
const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
// Check current time
const currentTime = Math.floor(Date.now() / 1000);
if (deadline <= currentTime) {
  console.error("Deadline must be in the future!");
}
```

### 5. **Nonce Already Used**
**Symptom**: Gas estimation fails

**Solution**:
```javascript
// Use a unique nonce for each deposit
// Option 1: Use timestamp
const nonce = Date.now();

// Option 2: Use counter
let nonceCounter = 0;
const nonce = ++nonceCounter;

// Option 3: Check if nonce is used
const isUsed = await depositRouter.usedNonces(userAddress, nonce);
if (isUsed) {
  console.error("Nonce already used!");
}
```

### 6. **Vault Not Ready (Async Mode)**
**Symptom**: Transaction might succeed but deposit is async

**Solution**:
```javascript
// Check vault status
const isReady = await vault.isTotalAssetsValid();
if (!isReady) {
  console.log("Vault is in async mode - deposit will be queued");
}
```

## Step-by-Step Debugging

### Step 1: Verify Prerequisites
```javascript
// Run this check script
const checks = {
  balance: await token.balanceOf(userAddress),
  allowance: await token.allowance(userAddress, depositRouterAddress),
  deadline: intent.deadline > Math.floor(Date.now() / 1000),
  nonceUsed: await depositRouter.usedNonces(userAddress, intent.nonce),
  vaultReady: await vault.isTotalAssetsValid()
};

console.log("Prerequisites:", checks);
```

### Step 2: Verify Signature
```javascript
// Test signature verification off-chain first
const domain = { /* ... */ };
const types = { /* ... */ };
const signature = await signer.signTypedData(domain, types, intent);

// Verify the signature matches
const recovered = ethers.verifyTypedData(domain, types, intent, signature);
if (recovered !== userAddress) {
  console.error("Signature mismatch!");
}
```

### Step 3: Test with Custom Gas Limit
If estimation fails, try with a custom gas limit:

```javascript
// Estimate gas manually (if possible)
let gasEstimate;
try {
  gasEstimate = await depositRouter.verifyAndDeposit.estimateGas(intent, signature);
} catch (error) {
  console.error("Gas estimation failed:", error.message);
  // Use a safe default
  gasEstimate = 500000; // Adjust based on your contract complexity
}

// Send with custom gas
const tx = await depositRouter.verifyAndDeposit(intent, signature, {
  gasLimit: gasEstimate * 120n / 100n // Add 20% buffer
});
```

### Step 4: Check Contract State
```javascript
// Verify contract is deployed and accessible
const code = await ethers.provider.getCode(depositRouterAddress);
if (code === "0x") {
  console.error("Contract not deployed!");
}

// Check if deposit already exists
const intentHash = keccak256(
  abi.encodePacked(
    intent.user,
    intent.nonce,
    intent.vault,
    intent.amount
  )
);
const existingDeposit = await depositRouter.getDeposit(intentHash);
if (existingDeposit.timestamp > 0) {
  console.error("Deposit already executed!");
}
```

## MetaMask-Specific Solutions

### Solution 1: Use Custom Gas Limit
1. In MetaMask, click "Edit" on the transaction
2. Click "Advanced"
3. Set a custom gas limit (try 500,000 - 1,000,000)
4. Submit transaction

### Solution 2: Reset MetaMask
1. Clear MetaMask cache
2. Refresh the page
3. Reconnect wallet
4. Try again

### Solution 3: Use Programmatic Transaction
Instead of MetaMask UI, use code:

```javascript
// Connect to MetaMask programmatically
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

// Create contract instance
const depositRouter = new ethers.Contract(
  depositRouterAddress,
  depositRouterABI,
  signer
);

// Send transaction with explicit gas
const tx = await depositRouter.verifyAndDeposit(intent, signature, {
  gasLimit: 800000 // Set explicit gas limit
});

await tx.wait();
```

## Quick Fix Checklist

Before calling `verifyAndDeposit`, ensure:

- [ ] User has approved router: `token.allowance(user, router) >= amount`
- [ ] User has sufficient balance: `token.balanceOf(user) >= amount`
- [ ] Deadline is in future: `deadline > block.timestamp`
- [ ] Nonce is unique: `!usedNonces[user][nonce]`
- [ ] Signature is valid: Signed by `intent.user`
- [ ] Chain ID matches network
- [ ] Contract addresses are correct
- [ ] Struct field order matches TYPEHASH

## Testing Script

Use this script to test before MetaMask:

```javascript
async function testDeposit() {
  // 1. Check balance
  const balance = await token.balanceOf(userAddress);
  console.log("Balance:", balance.toString());
  
  // 2. Check allowance
  const allowance = await token.allowance(userAddress, routerAddress);
  console.log("Allowance:", allowance.toString());
  
  // 3. Verify signature
  const domain = { /* ... */ };
  const types = { /* ... */ };
  const signature = await signer.signTypedData(domain, types, intent);
  const recovered = ethers.verifyTypedData(domain, types, intent, signature);
  console.log("Signature valid:", recovered === userAddress);
  
  // 4. Check nonce
  const nonceUsed = await router.usedNonces(userAddress, intent.nonce);
  console.log("Nonce used:", nonceUsed);
  
  // 5. Check deadline
  const currentTime = Math.floor(Date.now() / 1000);
  console.log("Deadline valid:", intent.deadline > currentTime);
  
  // 6. Try static call (simulates transaction)
  try {
    await router.verifyAndDeposit.staticCall(intent, signature);
    console.log("✓ Transaction would succeed!");
  } catch (error) {
    console.error("✗ Transaction would fail:", error.message);
  }
}
```

## Still Having Issues?

1. Check contract events/logs for revert reasons
2. Use a test script to verify all prerequisites
3. Try with a smaller amount first
4. Verify you're on the correct network
5. Check if contract is paused or has any restrictions
