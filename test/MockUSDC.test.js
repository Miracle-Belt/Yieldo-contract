const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MockUSDC", function () {
  let mockUSDC;
  let owner;
  let user1;
  let user2;

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
      expect(await mockUSDC.balanceOf(owner.address)).to.equal(initialSupply);
      expect(await mockUSDC.totalSupply()).to.equal(initialSupply);
    });
  });

  describe("Minting", function () {
    it("Should allow minting to any address", async function () {
      const amount = ethers.parseUnits("1000", 6);
      await mockUSDC.mint(user1.address, amount);
      expect(await mockUSDC.balanceOf(user1.address)).to.equal(amount);
    });

    it("Should increase total supply when minting", async function () {
      const initialSupply = await mockUSDC.totalSupply();
      const amount = ethers.parseUnits("500", 6);
      await mockUSDC.mint(user1.address, amount);
      expect(await mockUSDC.totalSupply()).to.equal(initialSupply + amount);
    });

    it("Should allow multiple mints", async function () {
      const amount1 = ethers.parseUnits("100", 6);
      const amount2 = ethers.parseUnits("200", 6);
      await mockUSDC.mint(user1.address, amount1);
      await mockUSDC.mint(user1.address, amount2);
      expect(await mockUSDC.balanceOf(user1.address)).to.equal(amount1 + amount2);
    });
  });

  describe("Transfers", function () {
    beforeEach(async function () {
      const amount = ethers.parseUnits("10000", 6);
      await mockUSDC.mint(user1.address, amount);
    });

    it("Should transfer tokens correctly", async function () {
      const amount = ethers.parseUnits("1000", 6);
      await mockUSDC.connect(user1).transfer(user2.address, amount);
      expect(await mockUSDC.balanceOf(user2.address)).to.equal(amount);
    });

    it("Should update balances after transfer", async function () {
      const amount = ethers.parseUnits("1000", 6);
      const user1BalanceBefore = await mockUSDC.balanceOf(user1.address);
      await mockUSDC.connect(user1).transfer(user2.address, amount);
      expect(await mockUSDC.balanceOf(user1.address)).to.equal(user1BalanceBefore - amount);
      expect(await mockUSDC.balanceOf(user2.address)).to.equal(amount);
    });

    it("Should revert if insufficient balance", async function () {
      const amount = ethers.parseUnits("20000", 6);
      await expect(
        mockUSDC.connect(user1).transfer(user2.address, amount)
      ).to.be.reverted;
    });
  });

  describe("Approvals", function () {
    beforeEach(async function () {
      const amount = ethers.parseUnits("10000", 6);
      await mockUSDC.mint(user1.address, amount);
    });

    it("Should approve spending", async function () {
      const amount = ethers.parseUnits("1000", 6);
      await mockUSDC.connect(user1).approve(user2.address, amount);
      expect(await mockUSDC.allowance(user1.address, user2.address)).to.equal(amount);
    });

    it("Should allow transferFrom after approval", async function () {
      const amount = ethers.parseUnits("1000", 6);
      await mockUSDC.connect(user1).approve(user2.address, amount);
      await mockUSDC.connect(user2).transferFrom(user1.address, user2.address, amount);
      expect(await mockUSDC.balanceOf(user2.address)).to.equal(amount);
    });
  });
});
