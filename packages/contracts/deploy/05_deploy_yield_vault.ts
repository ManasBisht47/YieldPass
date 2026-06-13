import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const QUSDC_MAINNET = "0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5";

const deploy: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy, get, execute, log } = deployments;
  const { deployer, oracle } = await getNamedAccounts();

  log("--- [5/5] Deploying YieldVault ---");

  const strategy            = await get("YieldStrategy");
  const reputationRegistry  = await get("ReputationRegistry");
  const insuranceFund       = await get("InsuranceFund");

  let qusdcAddress = QUSDC_MAINNET;
  if (network.name === "hardhat" || network.name === "qie-testnet") {
    const mock = await deployments.get("MockQUSDC").catch(() => null);
    if (mock) qusdcAddress = mock.address;
  }

  const result = await deploy("YieldVault", {
    from: deployer,
    args: [
      deployer,                   // admin
      oracle,                     // keeper
      qusdcAddress,               // QUSDC
      strategy.address,           // YieldStrategy
      reputationRegistry.address, // ReputationRegistry
      insuranceFund.address,      // InsuranceFund
    ],
    log: true,
    waitConfirmations: 1,
  });

  log(`YieldVault deployed at: ${result.address}`);

  // Wire vault ↔ strategy: grant VAULT_ROLE and STRATEGY_ROLE.
  const vaultRole    = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("VAULT_ROLE"));
  const strategyRole = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("STRATEGY_ROLE"));
  const disburserRole = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("DISBURSER_ROLE"));

  await execute(
    "YieldStrategy",
    { from: deployer, log: true },
    "grantRole",
    vaultRole,
    result.address
  );
  log(`Granted VAULT_ROLE to YieldVault on YieldStrategy`);

  // Point YieldStrategy at the real vault now that it's deployed.
  await execute(
    "YieldStrategy",
    { from: deployer, log: true },
    "setVault",
    result.address
  );
  log(`YieldStrategy.vault set to YieldVault`);

  await execute(
    "InsuranceFund",
    { from: deployer, log: true },
    "grantRole",
    disburserRole,
    result.address
  );
  log(`Granted DISBURSER_ROLE to YieldVault on InsuranceFund`);

  // Write final addresses to deployments file.
  log("\n✅ All contracts deployed. Final addresses:");
  log(`  NullifierRegistry:  ${(await get("NullifierRegistry")).address}`);
  log(`  ReputationRegistry: ${(await get("ReputationRegistry")).address}`);
  log(`  InsuranceFund:      ${(await get("InsuranceFund")).address}`);
  log(`  YieldStrategy:      ${strategy.address}`);
  log(`  YieldVault:         ${result.address}`);
};

deploy.tags = ["YieldVault", "all"];
deploy.dependencies = ["YieldStrategy", "ReputationRegistry"];
export default deploy;
