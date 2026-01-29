# Deposit Guide - How to Make a Deposit

This guide explains how users can make deposits to the DepositRouter contract.

## Prerequisites

1. **User must have USDC tokens** in their wallet
2. **User must approve the router** to spend their USDC tokens
3. **User must create and sign a deposit intent** using EIP-712

## Step-by-Step Process

### Step 1: Approve the Router

Before making a deposit, the user must approve the DepositRouter contract to spend their USDC tokens:

```javascript
// Using ethers.js
const mockUSDC = new ethers.Contract(usdcAddress, usdcABI, signer);
const depositRouterAddress = "0x00339b7d042e6430a23B699EFFD2096185ac2164"; // Sepolia

// Approve router to spend tokens
const amount = ethers.parseUnits("1000", 6); // 1000 USDC
const tx = await mockUSDC.approve(depositRouterAddress, amount);
await tx.wait();
```

### Step 2: Create Deposit Intent

Create a deposit intent object with the following parameters:

```javascript
const intent = {
  user: userAddress,           // Address making the deposit
  vault: vaultAddress,          // Lagoon vault address
  asset: usdcAddress,          // USDC token address
  amount: ethers.parseUnits("1000", 6), // Amount in USDC (6 decimals)
  nonce: 1,                     // Unique nonce (increment for each deposit)
  deadline: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
  kolAddress: "0x0000000000000000000000000000000000000000" // KOL address (or zero)
};
```

### Step 3: Sign the Intent (EIP-712)

Sign the intent using EIP-712 typed data signing:

```javascript
const domain = {
  name: "YieldoDepositRouter",
  version: "1",
  chainId: 11155111, // Sepolia chain ID
  verifyingContract: depositRouterAddress
};

const types = {
  DepositIntent: [
    { name: "user", type: "address" },
    { name: "vault", type: "address" },
    { name: "asset", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "kolAddress", type: "address" }
  ]
};

// Sign with user's wallet
const signature = await signer._signTypedData(domain, types, intent);
```

### Step 4: Execute Deposit

Call the `verifyAndDeposit` function on the DepositRouter:

```javascript
const depositRouter = new ethers.Contract(
  depositRouterAddress,
  depositRouterABI,
  signer
);

const tx = await depositRouter.verifyAndDeposit(intent, signature);
const receipt = await tx.wait();
```

## Important Notes

### Chain ID
- **Sepolia**: `11155111`
- Make sure the chainId in the EIP-712 domain matches the network you're on

### Contract Addresses (Sepolia)
- **MockUSDC**: `0xfc4b959D4F646FE4CD1612e1370Ea897c2c2a926`
- **MockLagoonVault**: `0x7d4882b62549DEfb184aD16B5D83468f5c2bf26a`
- **DepositRouter**: `0x00339b7d042e6430a23B699EFFD2096185ac2164`

### Nonce Management
- Each deposit must use a **unique nonce**
- Reusing a nonce will cause the transaction to revert
- Recommended: Use a counter or timestamp-based nonce

### Deadline
- The deadline must be in the future (Unix timestamp in seconds)
- Expired intents will revert
- Recommended: Set deadline to at least 1 hour in the future

### Token Decimals
- USDC uses **6 decimals**
- When specifying amounts, use `ethers.parseUnits("1000", 6)` for 1000 USDC

## Common Errors and Solutions

### Error: "ERC20InsufficientAllowance"
**Cause**: User hasn't approved the router  
**Solution**: Call `token.approve(routerAddress, amount)` first

### Error: "ERC20InsufficientBalance"
**Cause**: User doesn't have enough tokens  
**Solution**: User needs to acquire more USDC tokens

### Error: "Invalid signature"
**Cause**: Signature doesn't match the intent  
**Solution**: 
- Check that chainId matches the network
- Check that verifyingContract address is correct
- Ensure the signer is the same as intent.user

### Error: "Intent expired"
**Cause**: Deadline has passed  
**Solution**: Create a new intent with a future deadline

### Error: "Nonce already used"
**Cause**: Same nonce was used before  
**Solution**: Use a different, unique nonce

### Error: "Deposit already executed"
**Cause**: Same intent hash was used before  
**Solution**: Create a new intent with different parameters

## Testing Your Setup

Use the diagnostic scripts to verify your setup:

```bash
# Check prerequisites
npm run check-deposit -- --network sepolia

# Test a deposit
npm run test-deposit -- --network sepolia
```

## Example: Complete Deposit Flow (JavaScript/ethers.js)

```javascript
const { ethers } = require("ethers");

// Setup
const provider = new ethers.JsonRpcProvider("YOUR_RPC_URL");
const wallet = new ethers.Wallet("YOUR_PRIVATE_KEY", provider);

// Contract addresses (Sepolia)
const USDC_ADDRESS = "0xfc4b959D4F646FE4CD1612e1370Ea897c2c2a926";
const VAULT_ADDRESS = "0x7d4882b62549DEfb184aD16B5D83468f5c2bf26a";
const ROUTER_ADDRESS = "0x00339b7d042e6430a23B699EFFD2096185ac2164";

// Load ABIs
const usdcABI = require("./abis/MockUSDC.json");
const routerABI = require("./abis/DepositRouter.json");

const usdc = new ethers.Contract(USDC_ADDRESS, usdcABI, wallet);
const router = new ethers.Contract(ROUTER_ADDRESS, routerABI, wallet);

async function makeDeposit() {
  const amount = ethers.parseUnits("100", 6); // 100 USDC
  
  // Step 1: Approve
  console.log("Approving router...");
  const approveTx = await usdc.approve(ROUTER_ADDRESS, amount);
  await approveTx.wait();
  console.log("✓ Approved");
  
  // Step 2: Create intent
  const intent = {
    user: wallet.address,
    vault: VAULT_ADDRESS,
    asset: USDC_ADDRESS,
    amount: amount,
    nonce: Date.now(), // Use timestamp as nonce
    deadline: Math.floor(Date.now() / 1000) + 3600,
    kolAddress: ethers.ZeroAddress
  };
  
  // Step 3: Sign
  console.log("Signing intent...");
  const domain = {
    name: "YieldoDepositRouter",
    version: "1",
    chainId: 11155111,
    verifyingContract: ROUTER_ADDRESS
  };
  
  const types = {
    DepositIntent: [
      { name: "user", type: "address" },
      { name: "vault", type: "address" },
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "kolAddress", type: "address" }
    ]
  };
  
  const signature = await wallet.signTypedData(domain, types, intent);
  console.log("✓ Signed");
  
  // Step 4: Deposit
  console.log("Executing deposit...");
  const tx = await router.verifyAndDeposit(intent, signature);
  const receipt = await tx.wait();
  console.log("✓ Deposit successful!");
  console.log("Tx hash:", receipt.hash);
}

makeDeposit().catch(console.error);
```

## Support

If you encounter issues:
1. Run `npm run check-deposit` to verify prerequisites
2. Check the error message for specific revert reasons
3. Verify all addresses and parameters are correct
4. Ensure you're on the correct network (Sepolia)
