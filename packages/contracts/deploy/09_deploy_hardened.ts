import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

// The hardening pass before mainnet — bounded oracle updates, slippage-guarded
// + token-generic strategy, settable anti-whale caps, and the lending oracle
// staleness check. Same network-aware token wiring as the others (real addresses
// on mainnet, mocks on testnet). Folded into 10_deploy_launch afterwards.

const MAINNET = {
  WQIE:    "0x0087904D95BEe9E5F24dc8852804b547981A9139",
  QUSDC:   "0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5",
  ROUTER:  "0x08cd2e72e156D8563B4351eb4065C262A9f553Ef",
  FACTORY: "0x8E23128a5511223bE6c0d64106e2D4508C08398C",
  WETH:    "0x95322ccB3fb8dDefD210805EE18662762a0bc4A2",
};

const INITIAL_ETH_PRICE = "165000000000"; // $1650, 8 decimals

const deploy: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy, get, execute, log } = deployments;
  const { deployer, oracle: keeper, treasury } = await getNamedAccounts();

  const isTestnet = network.name === "hardhat" || network.name === "qie-testnet";
  log(`--- [9] Hardened stack (${isTestnet ? "TESTNET" : "MAINNET"}) ---`);

  const reputationRegistry = await get("ReputationRegistry");
  const irm                = await get("InterestRateModel");
  const insuranceFundQie   = await get("InsuranceFundQIE");
  const treasuryAddress    = process.env.TREASURY_ADDRESS || treasury || deployer;

  // ── Token / DEX addresses per network ────────────────────────────────────
  let WQIE = MAINNET.WQIE, QUSDC = MAINNET.QUSDC, WETH = MAINNET.WETH;
  let ROUTER = MAINNET.ROUTER, FACTORY = MAINNET.FACTORY;

  if (isTestnet) {
    WQIE  = (await get("WQIE9")).address;
    QUSDC = (await get("MockQUSDC")).address;
    const stub = await deploy("MockDexStub", { from: deployer, args: [], log: true, waitConfirmations: 1 });
    ROUTER = stub.address;
    FACTORY = stub.address;
    log(`Testnet stubs — WQIE9: ${WQIE}, MockQUSDC: ${QUSDC}, DexStub: ${stub.address}`);
  }

  // ── PriceOracle v2 ────────────────────────────────────────────────────────
  const oracleV2 = await deploy("PriceOracleV2", {
    contract: "PriceOracle",
    from: deployer,
    args: [deployer, INITIAL_ETH_PRICE],
    log: true,
    waitConfirmations: 1,
  });
  log(`PriceOracleV2: ${oracleV2.address}`);

  // Grant UPDATER_ROLE to the price-keeper wallet (funder key on testnet).
  if (process.env.PRICE_UPDATER_ADDRESS) {
    const updaterRole = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("UPDATER_ROLE"));
    await execute("PriceOracleV2", { from: deployer, log: true }, "grantRole", updaterRole, process.env.PRICE_UPDATER_ADDRESS);
    log(`UPDATER_ROLE → ${process.env.PRICE_UPDATER_ADDRESS}`);
  }

  // ── YieldStrategy v2 (WQIE primary / QUSDC pair) ─────────────────────────
  const strategy = await deploy("YieldStrategyQIE2", {
    contract: "YieldStrategy",
    from: deployer,
    args: [
      deployer,                 // admin
      deployer,                 // vault placeholder
      keeper,                   // keeper
      WQIE,                     // stakingToken
      QUSDC,                    // pairToken
      ROUTER,
      FACTORY,
      insuranceFundQie.address,
      treasuryAddress,
    ],
    log: true,
    waitConfirmations: 1,
  });
  log(`YieldStrategyQIE2: ${strategy.address}`);

  const depositorRole = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("DEPOSITOR_ROLE"));
  await execute("InsuranceFundQIE", { from: deployer, log: true }, "grantRole", depositorRole, strategy.address);

  // ── YieldVault v3 ─────────────────────────────────────────────────────────
  const vault = await deploy("YieldVaultQIE2", {
    contract: "YieldVault",
    from: deployer,
    args: [deployer, keeper, WQIE, strategy.address, reputationRegistry.address, insuranceFundQie.address],
    log: true,
    waitConfirmations: 1,
  });
  log(`YieldVaultQIE2: ${vault.address}`);

  const vaultRole     = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("VAULT_ROLE"));
  const disburserRole = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("DISBURSER_ROLE"));
  await execute("YieldStrategyQIE2", { from: deployer, log: true }, "grantRole", vaultRole, vault.address);
  await execute("YieldStrategyQIE2", { from: deployer, log: true }, "setVault", vault.address);
  await execute("InsuranceFundQIE",  { from: deployer, log: true }, "grantRole", disburserRole, vault.address);

  // Testnet: no real DEX — keep everything in reserve.
  if (isTestnet) {
    await execute("YieldStrategyQIE2", { from: deployer, log: true }, "setDeployRatio", 0);
    log("deployRatio = 0 (testnet, no QIEDex)");
  }

  // ── LendingPool v4 ────────────────────────────────────────────────────────
  const lending = await deploy("LendingPoolV4", {
    contract: "LendingPool",
    from: deployer,
    args: [
      deployer,                   // admin
      deployer,                   // keeper
      WETH,
      QUSDC,
      reputationRegistry.address,
      oracleV2.address,           // hardened oracle
      irm.address,
      deployer,                   // treasury
    ],
    log: true,
    waitConfirmations: 1,
  });
  log(`LendingPoolV4: ${lending.address}`);

  log("\n✅ Hardened stack:");
  log(`  PriceOracleV2:     ${oracleV2.address}`);
  log(`  YieldStrategyQIE2: ${strategy.address}`);
  log(`  YieldVaultQIE2:    ${vault.address}`);
  log(`  LendingPoolV4:     ${lending.address}`);
};

deploy.tags = ["Hardened"];
deploy.dependencies = ["ReputationRegistry"];
export default deploy;
