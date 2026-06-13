import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

// WETH on QIE chain
const WETH_QIE = "0x95322ccB3fb8dDefD210805EE18662762a0bc4A2";

// ETH/USD initial price — $3000 with 8 decimals
const INITIAL_ETH_PRICE = "300000000000"; // 3000_00000000

const QUSDC_MAINNET = "0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5";

const deploy: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy, get, execute, log } = deployments;
  const { deployer } = await getNamedAccounts();

  log("--- [6/6] Deploying PriceOracle + LendingPool ---");

  let qusdcAddress = QUSDC_MAINNET;
  if (network.name === "hardhat" || network.name === "qie-testnet") {
    const mock = await deployments.get("MockQUSDC").catch(() => null);
    if (mock) qusdcAddress = mock.address;
  }

  const reputationRegistry = await get("ReputationRegistry");

  // ── PriceOracle ──────────────────────────────────────────────────────────
  const oracle = await deploy("PriceOracle", {
    from: deployer,
    args: [deployer, INITIAL_ETH_PRICE],
    log: true,
    waitConfirmations: 1,
  });
  log(`PriceOracle deployed at: ${oracle.address} (ETH = $3000)`);

  // ── LendingPool ───────────────────────────────────────────────────────────
  const lending = await deploy("LendingPool", {
    from: deployer,
    args: [
      deployer,                       // admin
      WETH_QIE,                       // WETH
      qusdcAddress,                   // QUSDC
      reputationRegistry.address,     // ReputationRegistry
      oracle.address,                 // PriceOracle
      deployer,                       // treasury (use deployer wallet for MVP)
    ],
    log: true,
    waitConfirmations: 1,
  });
  log(`LendingPool deployed at: ${lending.address}`);
};

deploy.tags = ["LendingPool", "all"];
deploy.dependencies = ["ReputationRegistry", "MockQUSDC"];

export default deploy;
