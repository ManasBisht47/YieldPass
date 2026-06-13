import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

/// Deploys mock contracts on local / testnet only. Skipped on mainnet.
const deploy: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  if (hre.network.name === "qie-mainnet") return;

  const { deployments, getNamedAccounts } = hre;
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  log("--- [0/5] Deploying mocks (testnet/local only) ---");

  await deploy("MockQUSDC",   { from: deployer, log: true });
  await deploy("MockQIEPass", { from: deployer, log: true });

  log("Mocks deployed.");
};

deploy.tags = ["mocks", "all"];
export default deploy;
