const YieldoDepositRouter = artifacts.require("YieldoDepositRouter");

module.exports = async function (deployer, network, accounts) {
  const usdcAddress = process.env.TESTNET_USDC;
  const lagoonVaultAddress = process.env.LAGOON_VAULT;
  const yieldoTreasury = process.env.YIELDO_TREASURY;

  await deployer.deploy(YieldoDepositRouter, usdcAddress, lagoonVaultAddress, yieldoTreasury);
  const router = await YieldoDepositRouter.deployed();

  console.log("YieldoDepositRouter deployed at:", router.address);
};
