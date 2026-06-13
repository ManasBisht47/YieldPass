import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const deploy: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy, get, execute, log } = deployments;
  const { deployer, oracle } = await getNamedAccounts();

  log("--- [2/5] Deploying ReputationRegistry ---");

  const nullifierRegistry = await get("NullifierRegistry");

  const result = await deploy("ReputationRegistry", {
    from: deployer,
    args: [deployer, oracle, nullifierRegistry.address],
    log: true,
    waitConfirmations: 1,
  });

  log(`ReputationRegistry deployed at: ${result.address}`);

  // Grant ReputationRegistry the REGISTRAR_ROLE on NullifierRegistry
  // so it can call registerNullifier() when linking child wallets.
  const registrarRole = hre.ethers.keccak256(
    hre.ethers.toUtf8Bytes("REGISTRAR_ROLE")
  );

  await execute(
    "NullifierRegistry",
    { from: deployer, log: true },
    "grantRole",
    registrarRole,
    result.address
  );

  log(`Granted REGISTRAR_ROLE to ReputationRegistry`);
};

deploy.tags = ["ReputationRegistry", "all"];
deploy.dependencies = ["NullifierRegistry"];
export default deploy;
