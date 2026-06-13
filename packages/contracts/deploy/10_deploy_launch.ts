import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

// The whole stack in one script. The numbered 00-09 scripts were how this grew
// incrementally; this is the clean "deploy everything, wire everything, done"
// version we actually use for launch. Deploys the 8 contracts in dependency
// order and grants all the cross-contract roles inline (see the steps below).
//
// Picks real WQIE/QUSDC/QIEDex/WETH on mainnet, or spins up the mock versions on
// testnet so you can rehearse the exact same flow.
//
//   npx hardhat deploy --network qie-mainnet --tags Launch
//   npx hardhat deploy --network qie-testnet --tags Launch   # rehearsal

const MAINNET = {
  WQIE:    "0x0087904D95BEe9E5F24dc8852804b547981A9139",
  QUSDC:   "0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5",
  ROUTER:  "0x08cd2e72e156D8563B4351eb4065C262A9f553Ef",
  FACTORY: "0x8E23128a5511223bE6c0d64106e2D4508C08398C",
  WETH:    "0x95322ccB3fb8dDefD210805EE18662762a0bc4A2",
};

const INITIAL_ETH_PRICE = "165000000000"; // $1650, 8 decimals - keeper syncs to live on first run

const role = (hre: HardhatRuntimeEnvironment, name: string) =>
  hre.ethers.keccak256(hre.ethers.toUtf8Bytes(name));

const deploy: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy, execute, log } = deployments;
  const { deployer, oracle: keeper, treasury } = await getNamedAccounts();

  const isTestnet = network.name === "hardhat" || network.name === "qie-testnet";
  const treasuryAddress = process.env.TREASURY_ADDRESS || treasury || deployer;

  log(`\n════════ YieldPass LAUNCH deploy (${isTestnet ? "TESTNET" : "MAINNET"}) ════════`);
  log(`  deployer: ${deployer}`);
  log(`  keeper:   ${keeper}`);
  log(`  treasury: ${treasuryAddress}\n`);

  // ── Token / DEX addresses ────────────────────────────────────────────────
  let { WQIE, QUSDC, WETH, ROUTER, FACTORY } = MAINNET;
  if (isTestnet) {
    const wqie9 = await deploy("WQIE9", { from: deployer, args: [], log: true, waitConfirmations: 1 });
    const qusdc = (await deployments.getOrNull("MockQUSDC"))
      ?? await deploy("MockQUSDC", { from: deployer, args: [], log: true, waitConfirmations: 1 });
    const stub  = await deploy("MockDexStub", { from: deployer, args: [], log: true, waitConfirmations: 1 });
    WQIE = wqie9.address; QUSDC = qusdc.address; WETH = WETH; ROUTER = stub.address; FACTORY = stub.address;
    log(`  testnet stubs → WQIE9 ${WQIE} · MockQUSDC ${QUSDC} · DexStub ${stub.address}`);
  }

  // 1. NullifierRegistry
  const nullifier = await deploy("NullifierRegistry", { from: deployer, args: [deployer], log: true, waitConfirmations: 1 });

  // 2. ReputationRegistry (constructor grants SCORER_ROLE to keeper)
  const reputation = await deploy("ReputationRegistry", {
    from: deployer, args: [deployer, keeper, nullifier.address], log: true, waitConfirmations: 1,
  });
  await execute("NullifierRegistry", { from: deployer, log: true }, "grantRole", role(hre, "REGISTRAR_ROLE"), reputation.address);

  // 3. InterestRateModel
  const irm = await deploy("InterestRateModel", { from: deployer, args: [], log: true, waitConfirmations: 1 });

  // 4. InsuranceFund (WQIE)
  const fund = await deploy("InsuranceFundQIE", { contract: "InsuranceFund", from: deployer, args: [deployer, WQIE], log: true, waitConfirmations: 1 });

  // 5. PriceOracleV2 (keeper → UPDATER_ROLE)
  const oracleC = await deploy("PriceOracleV2", { contract: "PriceOracle", from: deployer, args: [deployer, INITIAL_ETH_PRICE], log: true, waitConfirmations: 1 });
  await execute("PriceOracleV2", { from: deployer, log: true }, "grantRole", role(hre, "UPDATER_ROLE"), keeper);

  // 6. YieldStrategy (WQIE staking / QUSDC pair / real QIEDex)
  const strategy = await deploy("YieldStrategyQIE2", {
    contract: "YieldStrategy", from: deployer,
    args: [deployer, deployer, keeper, WQIE, QUSDC, ROUTER, FACTORY, fund.address, treasuryAddress],
    log: true, waitConfirmations: 1,
  });
  await execute("InsuranceFundQIE", { from: deployer, log: true }, "grantRole", role(hre, "DEPOSITOR_ROLE"), strategy.address);

  // 7. YieldVault (native QIE)
  const vault = await deploy("YieldVaultQIE2", {
    contract: "YieldVault", from: deployer,
    args: [deployer, keeper, WQIE, strategy.address, reputation.address, fund.address],
    log: true, waitConfirmations: 1,
  });
  await execute("YieldStrategyQIE2", { from: deployer, log: true }, "grantRole", role(hre, "VAULT_ROLE"), vault.address);
  await execute("YieldStrategyQIE2", { from: deployer, log: true }, "setVault", vault.address);
  await execute("InsuranceFundQIE",  { from: deployer, log: true }, "grantRole", role(hre, "DISBURSER_ROLE"), vault.address);

  // 8. LendingPool (hardened oracle)
  const lending = await deploy("LendingPoolV4", {
    contract: "LendingPool", from: deployer,
    args: [deployer, keeper, WETH, QUSDC, reputation.address, oracleC.address, irm.address, treasuryAddress],
    log: true, waitConfirmations: 1,
  });

  // Testnet: no real DEX - keep all staked funds in reserve.
  if (isTestnet) {
    await execute("YieldStrategyQIE2", { from: deployer, log: true }, "setDeployRatio", 0);
  }

  log(`\n════════ DEPLOYED ════════`);
  log(`NEXT_PUBLIC_NULLIFIER_REGISTRY_ADDRESS=${nullifier.address}`);
  log(`NEXT_PUBLIC_REPUTATION_REGISTRY_ADDRESS=${reputation.address}`);
  log(`NEXT_PUBLIC_INTEREST_RATE_MODEL_ADDRESS=${irm.address}`);
  log(`NEXT_PUBLIC_INSURANCE_FUND_ADDRESS=${fund.address}`);
  log(`NEXT_PUBLIC_PRICE_ORACLE_ADDRESS=${oracleC.address}`);
  log(`NEXT_PUBLIC_YIELD_STRATEGY_ADDRESS=${strategy.address}`);
  log(`NEXT_PUBLIC_YIELD_VAULT_ADDRESS=${vault.address}`);
  log(`NEXT_PUBLIC_LENDING_POOL_ADDRESS=${lending.address}`);
  log(`NEXT_PUBLIC_WQIE_ADDRESS=${WQIE}`);
  log(`NEXT_PUBLIC_QUSDC_ADDRESS=${QUSDC}`);
  log(`NEXT_PUBLIC_WETH_ADDRESS=${WETH}`);
  log(`\nPost-deploy (mainnet): setBoostedCaps → setDeployRatio(500) → smoke test → transfer-admin`);
};

deploy.tags = ["Launch"];
export default deploy;
