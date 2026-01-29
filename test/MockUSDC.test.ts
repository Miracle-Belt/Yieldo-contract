import { expect } from "chai";
import { ethers } from "hardhat";
import type { Contract } from "ethers";
import type { Signer } from "ethers";

describe("MockUSDC", function () {
  let mockUSDC: Contract;
  let owner: Signer;
  let user1: Signer;
  let user2: Signer;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    mockUSDC = await MockUSDC.deploy();
    await mockUSDC.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct name and symbol", async function () {
      expect(await mockUSDC.name()).to.equal("Mock USDC");
      expect(await mockUSDC.symbol()).to.equal("USDC");
    });

    it("Should have 6 decimals", async function () {
      expect(await mockUSDC.decimals()).to.equal(6);
    });

    it("Should mint initial supply to deployer", async function () {
      const initialSupply = ethers.parseUnits("1000000", 6); // 1M USDC with 6 decimals
      expect(await mockUSDC.balanceOf(await owner.getAddress())).to.equal(initialSupply);
      expect(await mockUSDC.totalSupply()).to.equal(initialSupply);
    });
  });

  describe("Minting", function () {
    it("Should allow minting to any address", async function () {
      const amount = ethers.parseUnits("1000", 6);
      await mockUSDC.mint(await user1.getAddress(), amount);
      expect(await mockUSDC.balanceOf(await user1.getAddress())).to.equal(amount);
    });

    it("Should increase total supply when minting", async function () {
      const initialSupply = await mockUSDC.totalSupply();
      const amount = ethers.parseUnits("500", 6);
      await mockUSDC.mint(await user1.getAddress(), amount);
      expect(await mockUSDC.totalSupply()).to.equal(initialSupply + amount);
    });

    it("Should allow multiple mints", async function () {
      const amount1 = ethers.parseUnits("100", 6);
      const amount2 = ethers.parseUnits("200", 6);
      await mockUSDC.mint(await user1.getAddress(), amount1);
      await mockUSDC.mint(await user1.getAddress(), amount2);
      expect(await mockUSDC.balanceOf(await user1.getAddress())).to.equal(amount1 + amount2);
    });
  });

  describe("Transfers", function () {
    beforeEach(async function () {
      const amount = ethers.parseUnits("10000", 6);
      await mockUSDC.mint(await user1.getAddress(), amount);
    });

    it("Should transfer tokens correctly", async function () {
      const amount = ethers.parseUnits("1000", 6);
      await mockUSDC.connect(user1).transfer(await user2.getAddress(), amount);
      expect(await mockUSDC.balanceOf(await user2.getAddress())).to.equal(amount);
    });

    it("Should update balances after transfer", async function () {
      const amount = ethers.parseUnits("1000", 6);
      const user1BalanceBefore = await mockUSDC.balanceOf(await user1.getAddress());
      await mockUSDC.connect(user1).transfer(await user2.getAddress(), amount);
      expect(await mockUSDC.balanceOf(await user1.getAddress())).to.equal(user1BalanceBefore - amount);
      expect(await mockUSDC.balanceOf(await user2.getAddress())).to.equal(amount);
    });

    it("Should revert if insufficient balance", async function () {
      const amount = ethers.parseUnits("20000", 6);
      await expect(
        mockUSDC.connect(user1).transfer(await user2.getAddress(), amount)
      ).to.be.reverted;
    });
  });

  describe("Approvals", function () {
    beforeEach(async function () {
      const amount = ethers.parseUnits("10000", 6);
      await mockUSDC.mint(await user1.getAddress(), amount);
    });

    it("Should approve spending", async function () {
      const amount = ethers.parseUnits("1000", 6);
      await mockUSDC.connect(user1).approve(await user2.getAddress(), amount);
      expect(await mockUSDC.allowance(await user1.getAddress(), await user2.getAddress())).to.equal(amount);
    });

    it("Should allow transferFrom after approval", async function () {
      const amount = ethers.parseUnits("1000", 6);
      await mockUSDC.connect(user1).approve(await user2.getAddress(), amount);
      await mockUSDC.connect(user2).transferFrom(await user1.getAddress(), await user2.getAddress(), amount);
      expect(await mockUSDC.balanceOf(await user2.getAddress())).to.equal(amount);
    });
  });
});
