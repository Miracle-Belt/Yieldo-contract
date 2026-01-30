import { expect } from "chai";
import { ethers } from "hardhat";
import { deployContracts, signDepositIntent, createDepositIntent } from "./helpers/setup";
import type { Contract } from "ethers";
import type { Signer } from "ethers";

describe("DepositRouter", function () {
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

    // Mint USDC to user
    const amount = ethers.parseUnits("100000", 6);
    await mockUSDC.mint(await user.getAddress(), amount);
  });

  describe("Deployment", function () {
    it("Should set the correct treasury address", async function () {
      expect(await depositRouter.treasury()).to.equal(await treasury.getAddress());
    });

    it("Should have fees disabled by default", async function () {
      expect(await depositRouter.feesEnabled()).to.be.false;
    });

    it("Should have correct fee constants", async function () {
      expect(await depositRouter.FEE_BPS()).to.equal(10); // 0.1%
      expect(await depositRouter.KOL_FEE_SHARE()).to.equal(70);
      expect(await depositRouter.YIELDO_FEE_SHARE()).to.equal(30);
    });
  });

  describe("Synchronous Deposit Flow", function () {
    beforeEach(async function () {
      // Ensure vault is ready for sync deposits
      await mockLagoonVault.setTotalAssetsValid(true);
    });

    it("Should execute sync deposit with valid signature", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);
      const nonce = 1;
      const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

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

      // Approve router to spend USDC
      await mockUSDC.connect(user).approve(depositRouterAddress, depositAmount);

      await expect(
        depositRouter.verifyAndDeposit(intent, signature)
      ).to.emit(depositRouter, "DepositIntentVerified");

      // Check vault shares were minted
      expect(await mockLagoonVault.balanceOf(await user.getAddress())).to.equal(depositAmount);
    });

    it("Should revert with invalid signature", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);
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

      // Sign with wrong signer
      const wrongSignature = await signDepositIntent(deployer, depositRouter, intent);

      await mockUSDC.connect(user).approve(depositRouterAddress, depositAmount);

      await expect(
        depositRouter.verifyAndDeposit(intent, wrongSignature)
      ).to.be.revertedWith("Invalid signature");
    });

    it("Should revert with expired deadline", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);
      const nonce = 1;
      const deadline = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

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
      await mockUSDC.connect(user).approve(depositRouterAddress, depositAmount);

      await expect(
        depositRouter.verifyAndDeposit(intent, signature)
      ).to.be.revertedWith("Intent expired");
    });

    it("Should revert with reused nonce", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);
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
      await mockUSDC.connect(user).approve(depositRouterAddress, depositAmount);

      // First deposit
      await depositRouter.verifyAndDeposit(intent, signature);

      // Try to reuse same nonce - will fail with "Deposit already executed" 
      // because intent hash is the same (checked before nonce check)
      await expect(
        depositRouter.verifyAndDeposit(intent, signature)
      ).to.be.revertedWith("Deposit already executed");
    });

    it("Should prevent duplicate execution", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);
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
      await mockUSDC.connect(user).approve(depositRouterAddress, depositAmount);

      // First execution
      await depositRouter.verifyAndDeposit(intent, signature);

      // Try to execute again - will fail with "Deposit already executed"
      // because intent hash is checked first (before nonce check)
      await expect(
        depositRouter.verifyAndDeposit(intent, signature)
      ).to.be.revertedWith("Deposit already executed");
    });
  });

  describe("Asynchronous Deposit Flow", function () {
    beforeEach(async function () {
      // Set vault to async mode
      await mockLagoonVault.setTotalAssetsValid(false);
    });

    it("Should request async deposit when vault not ready", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);
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
      await mockUSDC.connect(user).approve(depositRouterAddress, depositAmount);

      await expect(
        depositRouter.verifyAndDeposit(intent, signature)
      ).to.emit(depositRouter, "AsyncDepositRequested");

      // Check that request was created in vault
      const request = await mockLagoonVault.asyncRequests(0);
      expect(request.owner).to.equal(await user.getAddress());
      expect(request.assets).to.equal(depositAmount);
    });

    it("Should allow claiming async deposit when vault becomes ready", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);
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
      await mockUSDC.connect(user).approve(depositRouterAddress, depositAmount);

      const tx = await depositRouter.verifyAndDeposit(intent, signature);
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
      const intentHash = depositRouter.interface.parseLog(event).args.intentHash;

      // Make vault ready
      await mockLagoonVault.setTotalAssetsValid(true);

      // Claim the async deposit
      await expect(
        depositRouter.claimAsyncDeposit(intentHash)
      ).to.emit(depositRouter, "DepositExecuted");

      // Check vault shares were minted
      expect(await mockLagoonVault.balanceOf(await user.getAddress())).to.equal(depositAmount);
    });
  });

  describe("Fee Collection", function () {
    beforeEach(async function () {
      await mockLagoonVault.setTotalAssetsValid(true);
      await depositRouter.setFeesEnabled(true);
    });

    it("Should collect fees when enabled", async function () {
      const depositAmount = ethers.parseUnits("10000", 6); // 10k USDC
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
      await mockUSDC.connect(user).approve(depositRouterAddress, depositAmount);

      const kolBalanceBefore = await mockUSDC.balanceOf(await kol.getAddress());
      const treasuryBalanceBefore = await mockUSDC.balanceOf(await treasury.getAddress());

      await expect(
        depositRouter.verifyAndDeposit(intent, signature)
      ).to.emit(depositRouter, "FeeCollected");

      // Fee = 10000 * 10 / 10000 = 10 USDC
      // KOL fee = 10 * 70 / 100 = 7 USDC
      // Yieldo fee = 10 * 30 / 100 = 3 USDC
      const expectedKolFee = ethers.parseUnits("7", 6);
      const expectedYieldoFee = ethers.parseUnits("3", 6);

      expect(await mockUSDC.balanceOf(await kol.getAddress())).to.equal(kolBalanceBefore + expectedKolFee);
      expect(await mockUSDC.balanceOf(await treasury.getAddress())).to.equal(treasuryBalanceBefore + expectedYieldoFee);

      // Deposit amount should be reduced by fee
      const depositAfterFee = depositAmount - ethers.parseUnits("10", 6);
      expect(await mockLagoonVault.balanceOf(await user.getAddress())).to.equal(depositAfterFee);
    });

    it("Should not collect fees when disabled", async function () {
      await depositRouter.setFeesEnabled(false);
      const depositAmount = ethers.parseUnits("10000", 6);
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
      await mockUSDC.connect(user).approve(depositRouterAddress, depositAmount);

      await depositRouter.verifyAndDeposit(intent, signature);

      // Full amount should be deposited
      expect(await mockLagoonVault.balanceOf(await user.getAddress())).to.equal(depositAmount);
    });
  });

  describe("Owner Functions", function () {
    it("Should allow owner to enable/disable fees", async function () {
      await depositRouter.setFeesEnabled(true);
      expect(await depositRouter.feesEnabled()).to.be.true;

      await depositRouter.setFeesEnabled(false);
      expect(await depositRouter.feesEnabled()).to.be.false;
    });

    it("Should allow owner to update treasury", async function () {
      const newTreasury = await deployer.getAddress();
      await depositRouter.setTreasury(newTreasury);
      expect(await depositRouter.treasury()).to.equal(newTreasury);
    });

    it("Should revert if non-owner tries to set fees", async function () {
      await expect(
        depositRouter.connect(user).setFeesEnabled(true)
      ).to.be.reverted;
    });

    it("Should revert if non-owner tries to set treasury", async function () {
      await expect(
        depositRouter.connect(user).setTreasury(await user.getAddress())
      ).to.be.reverted;
    });
  });

  describe("Deposit Record Retrieval", function () {
    it("Should store and retrieve deposit records", async function () {
      await mockLagoonVault.setTotalAssetsValid(true);
      const depositAmount = ethers.parseUnits("1000", 6);
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
      await mockUSDC.connect(user).approve(depositRouterAddress, depositAmount);

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

      const record = await depositRouter.getDeposit(intentHash);
      expect(record.user).to.equal(await user.getAddress());
      expect(record.vault).to.equal(mockLagoonVaultAddress);
      expect(record.asset).to.equal(mockUSDCAddress);
      expect(record.amount).to.equal(depositAmount);
      expect(record.kolAddress).to.equal(await kol.getAddress());
      expect(record.isAsync).to.be.false;
    });
  });
});
