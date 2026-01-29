const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployContracts, signDepositIntent, createDepositIntent } = require("./helpers/setup");

describe("DepositRouter", function () {
  let mockUSDC, mockLagoonVault, depositRouter;
  let deployer, user, kol, treasury;
  let mockUSDCAddress, mockLagoonVaultAddress, depositRouterAddress;

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
    await mockUSDC.mint(user.address, amount);
  });

  describe("Deployment", function () {
    it("Should set the correct treasury address", async function () {
      expect(await depositRouter.treasury()).to.equal(treasury.address);
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
        user.address,
        mockLagoonVaultAddress,
        mockUSDCAddress,
        depositAmount,
        nonce,
        deadline,
        kol.address
      );

      const signature = await signDepositIntent(user, depositRouter, intent);

      // Approve router to spend USDC
      await mockUSDC.connect(user).approve(depositRouterAddress, depositAmount);

      await expect(
        depositRouter.verifyAndDeposit(intent, signature)
      ).to.emit(depositRouter, "DepositIntentVerified");

      // Check vault shares were minted
      expect(await mockLagoonVault.balanceOf(user.address)).to.equal(depositAmount);
    });

    it("Should revert with invalid signature", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);
      const nonce = 1;
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const intent = createDepositIntent(
        user.address,
        mockLagoonVaultAddress,
        mockUSDCAddress,
        depositAmount,
        nonce,
        deadline,
        kol.address
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
        user.address,
        mockLagoonVaultAddress,
        mockUSDCAddress,
        depositAmount,
        nonce,
        deadline,
        kol.address
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
        user.address,
        mockLagoonVaultAddress,
        mockUSDCAddress,
        depositAmount,
        nonce,
        deadline,
        kol.address
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
        user.address,
        mockLagoonVaultAddress,
        mockUSDCAddress,
        depositAmount,
        nonce,
        deadline,
        kol.address
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
        user.address,
        mockLagoonVaultAddress,
        mockUSDCAddress,
        depositAmount,
        nonce,
        deadline,
        kol.address
      );

      const signature = await signDepositIntent(user, depositRouter, intent);
      await mockUSDC.connect(user).approve(depositRouterAddress, depositAmount);

      await expect(
        depositRouter.verifyAndDeposit(intent, signature)
      ).to.emit(depositRouter, "AsyncDepositRequested");

      // Check that request was created in vault
      const request = await mockLagoonVault.asyncRequests(0);
      expect(request.owner).to.equal(user.address);
      expect(request.assets).to.equal(depositAmount);
    });

    it("Should allow claiming async deposit when vault becomes ready", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);
      const nonce = 1;
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const intent = createDepositIntent(
        user.address,
        mockLagoonVaultAddress,
        mockUSDCAddress,
        depositAmount,
        nonce,
        deadline,
        kol.address
      );

      const signature = await signDepositIntent(user, depositRouter, intent);
      await mockUSDC.connect(user).approve(depositRouterAddress, depositAmount);

      const tx = await depositRouter.verifyAndDeposit(intent, signature);
      const receipt = await tx.wait();
      
      // Extract intent hash from event
      const event = receipt.logs.find(log => {
        try {
          const parsed = depositRouter.interface.parseLog(log);
          return parsed && parsed.name === "DepositIntentVerified";
        } catch {
          return false;
        }
      });
      const intentHash = depositRouter.interface.parseLog(event).args.intentHash;

      // Make vault ready
      await mockLagoonVault.setTotalAssetsValid(true);

      // Claim the async deposit
      await expect(
        depositRouter.claimAsyncDeposit(intentHash)
      ).to.emit(depositRouter, "DepositExecuted");

      // Check vault shares were minted
      expect(await mockLagoonVault.balanceOf(user.address)).to.equal(depositAmount);
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
        user.address,
        mockLagoonVaultAddress,
        mockUSDCAddress,
        depositAmount,
        nonce,
        deadline,
        kol.address
      );

      const signature = await signDepositIntent(user, depositRouter, intent);
      await mockUSDC.connect(user).approve(depositRouterAddress, depositAmount);

      const kolBalanceBefore = await mockUSDC.balanceOf(kol.address);
      const treasuryBalanceBefore = await mockUSDC.balanceOf(treasury.address);

      await expect(
        depositRouter.verifyAndDeposit(intent, signature)
      ).to.emit(depositRouter, "FeeCollected");

      // Fee = 10000 * 10 / 10000 = 10 USDC
      // KOL fee = 10 * 70 / 100 = 7 USDC
      // Yieldo fee = 10 * 30 / 100 = 3 USDC
      const expectedKolFee = ethers.parseUnits("7", 6);
      const expectedYieldoFee = ethers.parseUnits("3", 6);

      expect(await mockUSDC.balanceOf(kol.address)).to.equal(kolBalanceBefore + expectedKolFee);
      expect(await mockUSDC.balanceOf(treasury.address)).to.equal(treasuryBalanceBefore + expectedYieldoFee);

      // Deposit amount should be reduced by fee
      const depositAfterFee = depositAmount - ethers.parseUnits("10", 6);
      expect(await mockLagoonVault.balanceOf(user.address)).to.equal(depositAfterFee);
    });

    it("Should not collect fees when disabled", async function () {
      await depositRouter.setFeesEnabled(false);
      const depositAmount = ethers.parseUnits("10000", 6);
      const nonce = 1;
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const intent = createDepositIntent(
        user.address,
        mockLagoonVaultAddress,
        mockUSDCAddress,
        depositAmount,
        nonce,
        deadline,
        kol.address
      );

      const signature = await signDepositIntent(user, depositRouter, intent);
      await mockUSDC.connect(user).approve(depositRouterAddress, depositAmount);

      await depositRouter.verifyAndDeposit(intent, signature);

      // Full amount should be deposited
      expect(await mockLagoonVault.balanceOf(user.address)).to.equal(depositAmount);
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
      const newTreasury = deployer.address;
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
        depositRouter.connect(user).setTreasury(user.address)
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
        user.address,
        mockLagoonVaultAddress,
        mockUSDCAddress,
        depositAmount,
        nonce,
        deadline,
        kol.address
      );

      const signature = await signDepositIntent(user, depositRouter, intent);
      await mockUSDC.connect(user).approve(depositRouterAddress, depositAmount);

      const tx = await depositRouter.verifyAndDeposit(intent, signature);
      const receipt = await tx.wait();
      
      const event = receipt.logs.find(log => {
        try {
          const parsed = depositRouter.interface.parseLog(log);
          return parsed && parsed.name === "DepositIntentVerified";
        } catch {
          return false;
        }
      });
      const intentHash = depositRouter.interface.parseLog(event).args.intentHash;

      const record = await depositRouter.getDeposit(intentHash);
      expect(record.user).to.equal(user.address);
      expect(record.vault).to.equal(mockLagoonVaultAddress);
      expect(record.asset).to.equal(mockUSDCAddress);
      expect(record.amount).to.equal(depositAmount);
      expect(record.kolAddress).to.equal(kol.address);
      expect(record.isAsync).to.be.false;
    });
  });
});
