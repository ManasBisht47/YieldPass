import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

// This is where staking switched from QUSDC to native QIE - people stake the
// chain's own coin, it gets wrapped to WQIE, and the strategy LPs it on QIEDex.
// Redeploys WQIE-flavoured Insurance/Strategy/Vault; the lending side keeps its
// QUSDC instances. (Superseded by 10_deploy_launch for actual launches.)

// Canonical WQIE exists only on QIE MAINNET. On testnet we deploy our own
// WETH9-style wrapper (mocks/WQIE9.sol).
const WQIE_MAINNET = "0x0087904D95BEe9E5F24dc8852804b547981A9139";

const deploy: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy, get, execute, log } = deployments;
  const { deployer, oracle, treasury } = await getNamedAccounts();

  log("--- [8] Deploying native-QIE staking stack (WQIE) ---");

  const reputationRegistry = await get("ReputationRegistry");
  const treasuryAddress    = process.env.TREASURY_ADDRESS || treasury || deployer;

  let WQIE = WQIE_MAINNET;
  if (network.name === "hardhat" || network.name === "qie-testnet") {
    const wqie9 = await deploy("WQIE9", {
      from: deployer,
      args: [],
      log: true,
      waitConfirmations: 1,
    });
    WQIE = wqie9.address;
    log(`WQIE9 (testnet wrapper): ${WQIE}`);
  }

  // ── InsuranceFund (WQIE) ──────────────────────────────────────────────────
  const fund = await deploy("InsuranceFundQIE", {
    contract: "InsuranceFund",
    from: deployer,
    args: [deployer, WQIE],
    log: true,
    waitConfirmations: 1,
  });
  log(`InsuranceFundQIE: ${fund.address}`);

  // ── YieldStrategy (WQIE) - vault placeholder, set after vault deploy ────
  const strategy = await deploy("YieldStrategyQIE", {
    contract: "YieldStrategy",
    from: deployer,
    args: [deployer, deployer, oracle, WQIE, fund.address, treasuryAddress],
    log: true,
    waitConfirmations: 1,
  });
  log(`YieldStrategyQIE: ${strategy.address}`);

  const depositorRole = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("DEPOSITOR_ROLE"));
  await execute("InsuranceFundQIE", { from: deployer, log: true }, "grantRole", depositorRole, strategy.address);
  log("Granted DEPOSITOR_ROLE to YieldStrategyQIE");

  // ── YieldVault (native QIE) ───────────────────────────────────────────────
  const vault = await deploy("YieldVaultQIE", {
    contract: "YieldVault",
    from: deployer,
    args: [
      deployer,                   // admin
      oracle,                     // keeper
      WQIE,                       // wrapped QIE
      strategy.address,           // YieldStrategyQIE
      reputationRegistry.address, // ReputationRegistry
      fund.address,               // InsuranceFundQIE
    ],
    log: true,
    waitConfirmations: 1,
  });
  log(`YieldVaultQIE: ${vault.address}`);

  // ── Wiring ────────────────────────────────────────────────────────────────
  const vaultRole     = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("VAULT_ROLE"));
  const disburserRole = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("DISBURSER_ROLE"));

  await execute("YieldStrategyQIE", { from: deployer, log: true }, "grantRole", vaultRole, vault.address);
  await execute("YieldStrategyQIE", { from: deployer, log: true }, "setVault", vault.address);
  log("YieldStrategyQIE wired to YieldVaultQIE");

  await execute("InsuranceFundQIE", { from: deployer, log: true }, "grantRole", disburserRole, vault.address);
  log("Granted DISBURSER_ROLE to YieldVaultQIE");

  log("\n✅ Native-QIE staking stack:");
  log(`  WQIE:             ${WQIE}`);
  log(`  InsuranceFundQIE: ${fund.address}`);
  log(`  YieldStrategyQIE: ${strategy.address}`);
  log(`  YieldVaultQIE:    ${vault.address}`);
};

deploy.tags = ["QIEStaking"];
deploy.dependencies = ["ReputationRegistry"];
export default deploy;
