import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const QUSDC_MAINNET   = "0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5";
const TREASURY_MAINNET = process.env.TREASURY_ADDRESS ?? "";

const deploy: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy, get, execute, log } = deployments;
  const { deployer, oracle, treasury } = await getNamedAccounts();

  log("--- [4/5] Deploying YieldStrategy ---");

  const insuranceFund = await get("InsuranceFund");

  let qusdcAddress     = QUSDC_MAINNET;
  let treasuryAddress  = TREASURY_MAINNET || treasury;

  if (network.name === "hardhat" || network.name === "qie-testnet") {
    const mock = await deployments.get("MockQUSDC").catch(() => null);
    if (mock) qusdcAddress = mock.address;
  }

  // YieldVault address not deployed yet - use deployer as placeholder.
  // Updated in script 05 after vault is deployed.
  const result = await deploy("YieldStrategy", {
    from: deployer,
    args: [
      deployer,           // admin
      deployer,           // vault (updated post-deploy via grantRole)
      oracle,             // keeper
      qusdcAddress,
      insuranceFund.address,
      treasuryAddress,
    ],
    log: true,
    waitConfirmations: 1,
  });

  log(`YieldStrategy deployed at: ${result.address}`);

  // Grant YieldStrategy DEPOSITOR_ROLE on InsuranceFund.
  const depositorRole = hre.ethers.keccak256(
    hre.ethers.toUtf8Bytes("DEPOSITOR_ROLE")
  );

  await execute(
    "InsuranceFund",
    { from: deployer, log: true },
    "grantRole",
    depositorRole,
    result.address
  );

  log(`Granted DEPOSITOR_ROLE to YieldStrategy`);
};

deploy.tags = ["YieldStrategy", "all"];
deploy.dependencies = ["InsuranceFund"];
export default deploy;
