import { ethers } from "hardhat";
import type { Contract } from "ethers";
import type { Signer } from "ethers";

interface DeployedContracts {
  deployer: Signer;
  user: Signer;
  kol: Signer;
  treasury: Signer;
  mockUSDC: Contract;
  mockUSDCAddress: string;
  mockLagoonVault: Contract;
  mockLagoonVaultAddress: string;
  depositRouter: Contract;
  depositRouterAddress: string;
}

interface DepositIntent {
  user: string;
  vault: string;
  asset: string;
  amount: bigint;
  nonce: number | bigint;
  deadline: number | bigint;
  kolAddress: string;
}

/**
 * Deploy all contracts for testing
 */
export async function deployContracts(): Promise<DeployedContracts> {
  const [deployer, user, kol, treasury] = await ethers.getSigners();

  // Deploy MockUSDC
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const mockUSDC = await MockUSDC.deploy();
  await mockUSDC.waitForDeployment();
  const mockUSDCAddress = await mockUSDC.getAddress();

  // Deploy MockLagoonVault
  const MockLagoonVault = await ethers.getContractFactory("MockLagoonVault");
  const mockLagoonVault = await MockLagoonVault.deploy(
    mockUSDCAddress,
    "Test Lagoon Vault",
    "TLV"
  );
  await mockLagoonVault.waitForDeployment();
  const mockLagoonVaultAddress = await mockLagoonVault.getAddress();

  // Deploy DepositRouter
  const DepositRouter = await ethers.getContractFactory("DepositRouter");
  const depositRouter = await DepositRouter.deploy(await treasury.getAddress());
  await depositRouter.waitForDeployment();
  const depositRouterAddress = await depositRouter.getAddress();

  return {
    deployer,
    user,
    kol,
    treasury,
    mockUSDC,
    mockUSDCAddress,
    mockLagoonVault,
    mockLagoonVaultAddress,
    depositRouter,
    depositRouterAddress,
  };
}

/**
 * Create EIP-712 signature for deposit intent
 */
export async function signDepositIntent(
  signer: Signer,
  depositRouter: Contract,
  intent: DepositIntent
): Promise<string> {
  const network = await ethers.provider.getNetwork();
  const domain = {
    name: "YieldoDepositRouter",
    version: "1",
    chainId: Number(network.chainId),
    verifyingContract: await depositRouter.getAddress(),
  };

  const types = {
    DepositIntent: [
      { name: "user", type: "address" },
      { name: "vault", type: "address" },
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "kolAddress", type: "address" },
    ],
  };

  const signature = await signer.signTypedData(domain, types, intent);
  return signature;
}

/**
 * Create deposit intent object
 */
export function createDepositIntent(
  user: string,
  vault: string,
  asset: string,
  amount: bigint,
  nonce: number | bigint,
  deadline: number | bigint,
  kolAddress: string
): DepositIntent {
  return {
    user,
    vault,
    asset,
    amount,
    nonce,
    deadline,
    kolAddress,
  };
}
