import { expect } from "chai";
import { ethers } from "hardhat";
import type { Contract } from "ethers";
import type { Signer } from "ethers";

describe("MockLagoonVault", function () {
  let mockUSDC: Contract;
  let mockLagoonVault: Contract;
  let owner: Signer;
  let user1: Signer;
  let user2: Signer;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    mockUSDC = await MockUSDC.deploy();
    await mockUSDC.waitForDeployment();
    const mockUSDCAddress = await mockUSDC.getAddress();

    // Deploy MockLagoonVault
    const MockLagoonVault = await ethers.getContractFactory("MockLagoonVault");
    mockLagoonVault = await MockLagoonVault.deploy(
      mockUSDCAddress,
      "Test Lagoon Vault",
      "TLV"
    );
    await mockLagoonVault.waitForDeployment();

    // Mint USDC to users
    const amount = ethers.parseUnits("100000", 6);
    await mockUSDC.mint(await user1.getAddress(), amount);
    await mockUSDC.mint(await user2.getAddress(), amount);
  });

  describe("Deployment", function () {
    it("Should set the correct asset address", async function () {
      expect(await mockLagoonVault.asset()).to.equal(await mockUSDC.getAddress());
    });

    it("Should set the correct name and symbol", async function () {
      expect(await mockLagoonVault.name()).to.equal("Test Lagoon Vault");
      expect(await mockLagoonVault.symbol()).to.equal("TLV");
    });

    it("Should start with totalAssetsValid = true", async function () {
      expect(await mockLagoonVault.isTotalAssetsValid()).to.be.true;
    });

    it("Should start with zero total assets", async function () {
      expect(await mockLagoonVault.totalAssets()).to.equal(0);
    });
  });

  describe("Synchronous Deposits", function () {
    beforeEach(async function () {
      // Ensure vault is ready for sync deposits
      await mockLagoonVault.setTotalAssetsValid(true);
    });

    it("Should allow sync deposit", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);
      await mockUSDC.connect(user1).approve(await mockLagoonVault.getAddress(), depositAmount);
      
      await expect(
        mockLagoonVault.connect(user1).syncDeposit(depositAmount, await user1.getAddress(), await user2.getAddress())
      ).to.emit(mockLagoonVault, "SyncDeposit")
        .withArgs(await user1.getAddress(), await user2.getAddress(), depositAmount, depositAmount);

      expect(await mockLagoonVault.balanceOf(await user1.getAddress())).to.equal(depositAmount);
      expect(await mockLagoonVault.totalAssets()).to.equal(depositAmount);
    });

    it("Should transfer assets from user", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);
      const userBalanceBefore = await mockUSDC.balanceOf(await user1.getAddress());
      await mockUSDC.connect(user1).approve(await mockLagoonVault.getAddress(), depositAmount);
      
      await mockLagoonVault.connect(user1).syncDeposit(depositAmount, await user1.getAddress(), await user2.getAddress());
      
      expect(await mockUSDC.balanceOf(await user1.getAddress())).to.equal(userBalanceBefore - depositAmount);
      expect(await mockUSDC.balanceOf(await mockLagoonVault.getAddress())).to.equal(depositAmount);
    });

    it("Should revert if vault not ready for sync deposits", async function () {
      await mockLagoonVault.setTotalAssetsValid(false);
      const depositAmount = ethers.parseUnits("1000", 6);
      await mockUSDC.connect(user1).approve(await mockLagoonVault.getAddress(), depositAmount);
      
      await expect(
        mockLagoonVault.connect(user1).syncDeposit(depositAmount, await user1.getAddress(), await user2.getAddress())
      ).to.be.revertedWith("Vault not ready for sync deposits");
    });

    it("Should revert if amount is zero", async function () {
      await expect(
        mockLagoonVault.connect(user1).syncDeposit(0, await user1.getAddress(), await user2.getAddress())
      ).to.be.revertedWith("Invalid amount");
    });
  });

  describe("Asynchronous Deposits", function () {
    beforeEach(async function () {
      // Set vault to async mode
      await mockLagoonVault.setTotalAssetsValid(false);
    });

    it("Should allow async deposit request", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);
      await mockUSDC.connect(user1).approve(await mockLagoonVault.getAddress(), depositAmount);
      
      const tx = await mockLagoonVault.connect(user1).requestDeposit(
        depositAmount,
        await user1.getAddress(),
        await user1.getAddress()
      );
      
      await expect(tx)
        .to.emit(mockLagoonVault, "AsyncDepositRequested")
        .withArgs(0, await user1.getAddress(), depositAmount);

      const request = await mockLagoonVault.asyncRequests(0);
      expect(request.owner).to.equal(await user1.getAddress());
      expect(request.assets).to.equal(depositAmount);
      expect(request.claimed).to.be.false;
    });

    it("Should revert async deposit if vault is ready for sync", async function () {
      await mockLagoonVault.setTotalAssetsValid(true);
      const depositAmount = ethers.parseUnits("1000", 6);
      await mockUSDC.connect(user1).approve(await mockLagoonVault.getAddress(), depositAmount);
      
      await expect(
        mockLagoonVault.connect(user1).requestDeposit(depositAmount, await user1.getAddress(), await user1.getAddress())
      ).to.be.revertedWith("Vault ready for sync deposits");
    });

    it("Should allow claiming async deposit when vault becomes ready", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);
      await mockUSDC.connect(user1).approve(await mockLagoonVault.getAddress(), depositAmount);
      
      const tx = await mockLagoonVault.connect(user1).requestDeposit(
        depositAmount,
        await user1.getAddress(),
        await user1.getAddress()
      );
      const receipt = await tx.wait();
      const event = receipt?.logs.find((log: any) => {
        try {
          return mockLagoonVault.interface.parseLog(log).name === "AsyncDepositRequested";
        } catch {
          return false;
        }
      });
      if (!event) throw new Error("Event not found");
      const requestId = mockLagoonVault.interface.parseLog(event).args.requestId;

      // Make vault ready
      await mockLagoonVault.setTotalAssetsValid(true);

      // Claim the deposit
      await expect(
        mockLagoonVault.claimAsyncDeposit(requestId)
      ).to.emit(mockLagoonVault, "AsyncDepositClaimed")
        .withArgs(requestId, await user1.getAddress(), depositAmount);

      expect(await mockLagoonVault.balanceOf(await user1.getAddress())).to.equal(depositAmount);
      const request = await mockLagoonVault.asyncRequests(requestId);
      expect(request.claimed).to.be.true;
    });

    it("Should revert claiming if vault not ready", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);
      await mockUSDC.connect(user1).approve(await mockLagoonVault.getAddress(), depositAmount);
      
      await mockLagoonVault.connect(user1).requestDeposit(
        depositAmount,
        await user1.getAddress(),
        await user1.getAddress()
      );

      await expect(
        mockLagoonVault.claimAsyncDeposit(0)
      ).to.be.revertedWith("Vault not ready");
    });

    it("Should revert claiming if already claimed", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);
      await mockUSDC.connect(user1).approve(await mockLagoonVault.getAddress(), depositAmount);
      
      await mockLagoonVault.connect(user1).requestDeposit(
        depositAmount,
        await user1.getAddress(),
        await user1.getAddress()
      );

      await mockLagoonVault.setTotalAssetsValid(true);
      await mockLagoonVault.claimAsyncDeposit(0);

      await expect(
        mockLagoonVault.claimAsyncDeposit(0)
      ).to.be.revertedWith("Already claimed");
    });
  });

  describe("Total Assets", function () {
    it("Should track total assets correctly", async function () {
      await mockLagoonVault.setTotalAssetsValid(true);
      const depositAmount1 = ethers.parseUnits("1000", 6);
      const depositAmount2 = ethers.parseUnits("2000", 6);
      
      await mockUSDC.connect(user1).approve(await mockLagoonVault.getAddress(), depositAmount1);
      await mockUSDC.connect(user2).approve(await mockLagoonVault.getAddress(), depositAmount2);
      
      await mockLagoonVault.connect(user1).syncDeposit(depositAmount1, await user1.getAddress(), ethers.ZeroAddress);
      expect(await mockLagoonVault.totalAssets()).to.equal(depositAmount1);
      
      await mockLagoonVault.connect(user2).syncDeposit(depositAmount2, await user2.getAddress(), ethers.ZeroAddress);
      expect(await mockLagoonVault.totalAssets()).to.equal(depositAmount1 + depositAmount2);
    });
  });
});
