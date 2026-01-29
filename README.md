# Deposit Router Smart Contracts - Hardhat Deployment

This project contains Hardhat deployment scripts for the DepositRouter smart contracts.

## Contracts

1. **MockUSDC** - Mock USDC token for testing
2. **MockLagoonVault** - Mock Lagoon vault implementation
3. **DepositRouter** - Main router contract for handling deposits with EIP-712 verification

## Setup

1. Install dependencies:
```bash
npm install
```

2. Compile contracts:
```bash
npm run compile
```

## Testing

Run all tests:
```bash
npm test
```

Or run specific test files:
```bash
# Test MockUSDC
npx hardhat test test/MockUSDC.test.js

# Test MockLagoonVault
npx hardhat test test/MockLagoonVault.test.js

# Test DepositRouter
npx hardhat test test/DepositRouter.test.js

# Run integration tests
npx hardhat test test/integration.test.js
```

### Test Coverage

The test suite includes:

1. **MockUSDC.test.js** - Tests for ERC20 token functionality:
   - Deployment and initial supply
   - Minting tokens
   - Token transfers
   - Approvals and transferFrom

2. **MockLagoonVault.test.js** - Tests for vault functionality:
   - Synchronous deposits
   - Asynchronous deposits
   - Claiming async deposits
   - Total assets tracking

3. **DepositRouter.test.js** - Tests for router functionality:
   - EIP-712 signature verification
   - Sync deposit flow
   - Async deposit flow
   - Fee collection
   - Nonce management
   - Owner functions

4. **integration.test.js** - End-to-end workflow tests:
   - Complete sync deposit workflow with fees
   - Complete async deposit workflow
   - Multiple deposits
   - Various edge cases

## Deployment

### Deploy All Contracts (Recommended)

Deploy all contracts in the correct order:
```bash
npm run deploy
```

Or for specific networks:
```bash
# Local network
npm run deploy:local

# Sepolia testnet
npm run deploy:sepolia
```

### Deploy Individual Contracts

1. **Deploy MockUSDC:**
```bash
npx hardhat run scripts/deploy-mock-usdc.js --network <network>
```

2. **Deploy MockLagoonVault** (requires MockUSDC address):
```bash
npx hardhat run scripts/deploy-mock-lagoon-vault.js --network <network> <MOCK_USDC_ADDRESS>
```

Or set environment variable:
```bash
MOCK_USDC_ADDRESS=0x... npx hardhat run scripts/deploy-mock-lagoon-vault.js --network <network>
```

3. **Deploy DepositRouter** (requires treasury address):
```bash
npx hardhat run scripts/deploy-deposit-router.js --network <network> <TREASURY_ADDRESS>
```

Or set environment variable:
```bash
TREASURY_ADDRESS=0x... npx hardhat run scripts/deploy-deposit-router.js --network <network>
```

## Verifying contracts (Etherscan)

After deploying to Sepolia (or another supported network), verify on Etherscan:

```bash
npm run verify:sepolia
```

Or explicitly:

```bash
npx hardhat run scripts/verify.ts --network sepolia
```

**Requirements:**

- `ETHERSCAN_API_KEY` in `.env` (get one from [etherscan.io/myapikey](https://etherscan.io/myapikey))
- `deployments/hardhat.json` from a prior deploy

The verify script reads `hardhat.json`, then verifies MockUSDC, MockLagoonVault, and DepositRouter with the correct constructor arguments. Already-verified contracts are skipped.

## Environment Variables

For Sepolia deployment and verification, create a `.env` file:
```
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
PRIVATE_KEY=your_private_key_here
ETHERSCAN_API_KEY=your_etherscan_api_key
```

## Network Configuration

The Hardhat configuration supports:
- `hardhat` - Local Hardhat network
- `localhost` - Local node (e.g., Ganache)
- `sepolia` - Sepolia testnet

## Contract Dependencies

- MockUSDC: No dependencies
- MockLagoonVault: Requires MockUSDC address
- DepositRouter: Requires treasury address

## ABI Extraction

After deployment, ABIs are automatically extracted and saved to the `abis/` folder:

- `abis/MockUSDC.json` - MockUSDC ABI
- `abis/MockLagoonVault.json` - MockLagoonVault ABI
- `abis/DepositRouter.json` - DepositRouter ABI
- `abis/all.json` - All ABIs in one file

You can also extract ABIs manually:
```bash
npm run extract-abi
```

## Deployment Files

After deployment, the following files are created:

- `deployments/<network>.json` - Deployment addresses for the network
- `deployments/<network>-with-abis.json` - Deployment addresses with ABIs included
- `abis/*.json` - Individual contract ABIs

## Troubleshooting Deposits

If deposits are reverting, use the diagnostic scripts:

**Check deposit prerequisites:**
```bash
npm run check-deposit
```

**Test a deposit:**
```bash
npm run test-deposit
```

### Common Revert Reasons

1. **Insufficient Allowance** - User hasn't approved the router to spend tokens
   - Solution: User must call `token.approve(routerAddress, amount)` first

2. **Insufficient Balance** - User doesn't have enough tokens
   - Solution: User needs to acquire tokens first

3. **Invalid Signature** - EIP-712 signature doesn't match the intent
   - Solution: Ensure signature is created correctly with the right domain and parameters

4. **Expired Deadline** - Intent deadline has passed
   - Solution: Create a new intent with a future deadline

5. **Nonce Already Used** - Same nonce was used in a previous deposit
   - Solution: Use a unique nonce for each deposit

6. **Deposit Already Executed** - Same intent hash was used before
   - Solution: Create a new intent with different parameters

## Notes

- The main deployment script (`deploy.js`) deploys all contracts in the correct order
- Individual deployment scripts allow for more granular control
- ABIs are automatically extracted after deployment
- Deployment addresses are saved to the `deployments/` folder
- Users must approve the router before making deposits
