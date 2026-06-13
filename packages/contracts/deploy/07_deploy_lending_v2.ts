import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const WETH_QIE = "0x95322ccB3fb8dDefD210805EE18662762a0bc4A2";
const INITIAL_ETH_PRICE = "300000000000"; // $3000 with 8 decimals
const QUSDC_MAINNET = "0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5";

const deploy: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy, get, log } = deployments;
  const { deployer } = await getNamedAccounts();

  log("--- [7] Deploying InterestRateModel + LendingPool v2 ---");

  let qusdcAddress = QUSDC_MAINNET;
  if (network.name === "hardhat" || network.name === "qie-testnet") {
    const mock = await deployments.get("MockQUSDC").catch(() => null);
    if (mock) qusdcAddress = mock.address;
  }

  const reputationRegistry = await get("ReputationRegistry");

  // ── PriceOracle (redeploy for clean state) ───────────────────────────────
  const oracle = await deploy("PriceOracle", {
    from: deployer,
    args: [deployer, INITIAL_ETH_PRICE],
    log: true,
    waitConfirmations: 1,
  });
  log(`PriceOracle: ${oracle.address}`);

  // ── InterestRateModel ─────────────────────────────────────────────────────
  const irm = await deploy("InterestRateModel", {
    from: deployer,
    args: [],
    log: true,
    waitConfirmations: 1,
  });
  log(`InterestRateModel: ${irm.address}`);
  log(`  Base rate  : 2 %`);
  log(`  Multiplier : 15 % slope below 80 % kink`);
  log(`  Jump mult  : 150 % slope above kink`);
  log(`  80 % util  → 14 % borrow / ~9 % supply APY`);

  // ── LendingPool v2 ────────────────────────────────────────────────────────
  const lending = await deploy("LendingPool", {
    from: deployer,
    args: [
      deployer,                     // admin
      deployer,                     // keeper (use deployer for MVP)
      WETH_QIE,                     // WETH on QIE chain
      qusdcAddress,                 // QUSDC
      reputationRegistry.address,   // ReputationRegistry
      oracle.address,               // PriceOracle
      irm.address,                  // InterestRateModel
      deployer,                     // treasury
    ],
    log: true,
    waitConfirmations: 1,
  });
  log(`LendingPool v2: ${lending.address}`);
  log(`  Features: public supply, dynamic rates, grace shield, 90% util cap, pausable`);
};

deploy.tags = ["LendingPoolV2", "all"];
deploy.dependencies = ["ReputationRegistry", "MockQUSDC"];

export default deploy;
