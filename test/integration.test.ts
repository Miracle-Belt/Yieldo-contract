import { expect } from "chai";
import { ethers } from "hardhat";
import { deployContracts, signDepositIntent, createDepositIntent } from "./helpers/setup";
import type { Contract } from "ethers";
import type { Signer } from "ethers";

describe("Integration Tests - Full Workflow", function () {
  let mockUSDC: Contract;
  let mockLagoonVault: Contract;
  let depositRouter: Contract;
  let deployer: Signer;
  let user: Signer;
  let kol: Signer;
  let treasury: Signer;
  let mockUSDCAddress: string;
  let mockLagoonVaultAddress: string;
  let depositRouterAddress: string;

  beforeEach(async function () {
    const contracts = await deployContracts();
    mockUSDC = contracts.mockUSDC;
    mockLagoonVault = contracts.mockLagoonVault;
    depositRouter = contracts.depositRouter;
    deployer = contracts.deployer;
    user = contracts.user;
    kol = contracts.kol;
    treasury = contracts.treasury;
    mockUSDCAddress = contracts.mockUSDCAddress;
    mockLagoonVaultAddress = contracts.mockLagoonVaultAddress;
    depositRouterAddress = contracts.depositRouterAddress;
  });

  describe("Complete Sync Deposit Workflow", function () {
    it("Should complete full sync deposit flow with fees", async function () {
      // Setup: Mint USDC to user
      const userBalance = ethers.parseUnits("50000", 6);
      await mockUSDC.mint(await user.getAddress(), userBalance);

      // Setup: Enable fees
      await depositRouter.setFeesEnabled(true);
      await mockLagoonVault.setTotalAssetsValid(true);

      // Step 1: User approves router
      const depositAmount = ethers.parseUnits("10000", 6);
      await mockUSDC.connect(user).approve(depositRouterAddress, depositAmount);

      // Step 2: User creates deposit intent
      const nonce = 1;
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const intent = createDepositIntent(
        await user.getAddress(),
        mockLagoonVaultAddress,
        mockUSDCAddress,
        depositAmount,
        nonce,
        deadline,
        await kol.getAddress()
      );

      // Step 3: User signs intent
      const signature = await signDepositIntent(user, depositRouter, intent);

      // Step 4: Execute deposit (can be called by anyone)
      const kolBalanceBefore = await mockUSDC.balanceOf(await kol.getAddress());
      const treasuryBalanceBefore = await mockUSDC.balanceOf(await treasury.getAddress());
      const userVaultBalanceBefore = await mockLagoonVault.balanceOf(await user.getAddress());

      await depositRouter.verifyAndDeposit(intent, signature);

      // Verify: Fees were collected
      const expectedFee = ethers.parseUnits("10", 6); // 0.1% of 10000
      const expectedKolFee = ethers.parseUnits("7", 6); // 70% of fee
      const expectedYieldoFee = ethers.parseUnits("3", 6); // 30% of fee

      expect(await mockUSDC.balanceOf(await kol.getAddress())).to.equal(kolBalanceBefore + expectedKolFee);
      expect(await mockUSDC.balanceOf(await treasury.getAddress())).to.equal(treasuryBalanceBefore + expectedYieldoFee);

      // Verify: Vault shares were minted (amount minus fee)
      const expectedShares = depositAmount - expectedFee;
      expect(await mockLagoonVault.balanceOf(await user.getAddress())).to.equal(
        userVaultBalanceBefore + expectedShares
      );

      // Verify: User's USDC balance decreased
      expect(await mockUSDC.balanceOf(await user.getAddress())).to.equal(userBalance - depositAmount);
    });

    it("Should handle multiple deposits from same user", async function () {
      const userBalance = ethers.parseUnits("50000", 6);
      await mockUSDC.mint(await user.getAddress(), userBalance);
      await mockLagoonVault.setTotalAssetsValid(true);

      const depositAmount1 = ethers.parseUnits("5000", 6);
      const depositAmount2 = ethers.parseUnits("3000", 6);

      // First deposit
      await mockUSDC.connect(user).approve(depositRouterAddress, depositAmount1);
      const intent1 = createDepositIntent(
        await user.getAddress(),
        mockLagoonVaultAddress,
        mockUSDCAddress,
        depositAmount1,
        1,
        Math.floor(Date.now() / 1000) + 3600,
        await kol.getAddress()
      );
      const signature1 = await signDepositIntent(user, depositRouter, intent1);
      await depositRouter.verifyAndDeposit(intent1, signature1);

      // Second deposit with different nonce
      await mockUSDC.connect(user).approve(depositRouterAddress, depositAmount2);
      const intent2 = createDepositIntent(
        await user.getAddress(),
        mockLagoonVaultAddress,
        mockUSDCAddress,
        depositAmount2,
        2,
        Math.floor(Date.now() / 1000) + 3600,
        await kol.getAddress()
      );
      const signature2 = await signDepositIntent(user, depositRouter, intent2);
      await depositRouter.verifyAndDeposit(intent2, signature2);

      // Verify total vault shares
      expect(await mockLagoonVault.balanceOf(await user.getAddress())).to.equal(depositAmount1 + depositAmount2);
    });
  });

  describe("Complete Async Deposit Workflow", function () {
    it("Should complete full async deposit flow", async function () {
      // Setup: Mint USDC to user
      const userBalance = ethers.parseUnits("50000", 6);
      await mockUSDC.mint(await user.getAddress(), userBalance);

      // Setup: Vault in async mode
      await mockLagoonVault.setTotalAssetsValid(false);

      // Step 1: User approves router
      const depositAmount = ethers.parseUnits("10000", 6);
      await mockUSDC.connect(user).approve(depositRouterAddress, depositAmount);

      // Step 2: User creates and signs deposit intent
      const nonce = 1;
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const intent = createDepositIntent(
        await user.getAddress(),
        mockLagoonVaultAddress,
        mockUSDCAddress,
        depositAmount,
        nonce,
        deadline,
        await kol.getAddress()
      );
      const signature = await signDepositIntent(user, depositRouter, intent);

      // Step 3: Execute deposit (creates async request)
      const tx = await depositRouter.verifyAndDeposit(intent, signature);
      const receipt = await tx.wait();
      
      const event = receipt?.logs.find((log: any) => {
        try {
          const parsed = depositRouter.interface.parseLog(log);
          return parsed && parsed.name === "DepositIntentVerified";
        } catch {
          return false;
        }
      });
      if (!event) throw new Error("Event not found");
      const intentHash = depositRouter.interface.parseLog(event).args.intentHash;

      // Verify: Async request was created
      const request = await mockLagoonVault.asyncRequests(0);
      expect(request.owner).to.equal(await user.getAddress());
      expect(request.assets).to.equal(depositAmount);
      expect(request.claimed).to.be.false;

      // Verify: No vault shares yet
      expect(await mockLagoonVault.balanceOf(await user.getAddress())).to.equal(0);

      // Step 4: Vault becomes ready
      await mockLagoonVault.setTotalAssetsValid(true);

      // Step 5: Claim async deposit
      await depositRouter.claimAsyncDeposit(intentHash);

      // Verify: Vault shares were minted
      expect(await mockLagoonVault.balanceOf(await user.getAddress())).to.equal(depositAmount);

      // Verify: Request is marked as claimed
      const requestAfter = await mockLagoonVault.asyncRequests(0);
      expect(requestAfter.claimed).to.be.true;
    });
  });

  describe("Workflow with Different Scenarios", function () {
    it("Should handle deposit without KOL address", async function () {
      const userBalance = ethers.parseUnits("10000", 6);
      await mockUSDC.mint(await user.getAddress(), userBalance);
      await mockLagoonVault.setTotalAssetsValid(true);
      await depositRouter.setFeesEnabled(true);

      const depositAmount = ethers.parseUnits("5000", 6);
      await mockUSDC.connect(user).approve(depositRouterAddress, depositAmount);

      const intent = createDepositIntent(
        await user.getAddress(),
        mockLagoonVaultAddress,
        mockUSDCAddress,
        depositAmount,
        1,
        Math.floor(Date.now() / 1000) + 3600,
        ethers.ZeroAddress // No KOL
      );

      const signature = await signDepositIntent(user, depositRouter, intent);
      await depositRouter.verifyAndDeposit(intent, signature);

      // Should still work, but no KOL fee
      const expectedFee = ethers.parseUnits("5", 6); // 0.1% of 5000
      const expectedShares = depositAmount - expectedFee;
      expect(await mockLagoonVault.balanceOf(await user.getAddress())).to.equal(expectedShares);
    });

    it("Should handle transition from sync to async mode", async function () {
      const userBalance = ethers.parseUnits("20000", 6);
      await mockUSDC.mint(await user.getAddress(), userBalance);

      // First deposit in sync mode
      await mockLagoonVault.setTotalAssetsValid(true);
      const depositAmount1 = ethers.parseUnits("5000", 6);
      await mockUSDC.connect(user).approve(depositRouterAddress, depositAmount1);
      
      const intent1 = createDepositIntent(
        await user.getAddress(),
        mockLagoonVaultAddress,
        mockUSDCAddress,
        depositAmount1,
        1,
        Math.floor(Date.now() / 1000) + 3600,
        await kol.getAddress()
      );
      const signature1 = await signDepositIntent(user, depositRouter, intent1);
      await depositRouter.verifyAndDeposit(intent1, signature1);

      expect(await mockLagoonVault.balanceOf(await user.getAddress())).to.equal(depositAmount1);

      // Switch to async mode
      await mockLagoonVault.setTotalAssetsValid(false);

      // Second deposit in async mode
      const depositAmount2 = ethers.parseUnits("3000", 6);
      await mockUSDC.connect(user).approve(depositRouterAddress, depositAmount2);
      
      const intent2 = createDepositIntent(
        await user.getAddress(),
        mockLagoonVaultAddress,
        mockUSDCAddress,
        depositAmount2,
        2,
        Math.floor(Date.now() / 1000) + 3600,
        await kol.getAddress()
      );
      const signature2 = await signDepositIntent(user, depositRouter, intent2);
      const tx = await depositRouter.verifyAndDeposit(intent2, signature2);
      const receipt = await tx.wait();
      
      // Extract intent hash from event
      const event = receipt?.logs.find((log: any) => {
        try {
          const parsed = depositRouter.interface.parseLog(log);
          return parsed && parsed.name === "DepositIntentVerified";
        } catch {
          return false;
        }
      });
      if (!event) throw new Error("Event not found");
      const intentHash2 = depositRouter.interface.parseLog(event).args.intentHash;

      // Shares should still be from first deposit only (async not claimed yet)
      expect(await mockLagoonVault.balanceOf(await user.getAddress())).to.equal(depositAmount1);

      // Make vault ready and claim async deposit
      await mockLagoonVault.setTotalAssetsValid(true);
      await depositRouter.claimAsyncDeposit(intentHash2);

      // Now shares should include both deposits
      expect(await mockLagoonVault.balanceOf(await user.getAddress())).to.equal(depositAmount1 + depositAmount2);
    });
  });
});
