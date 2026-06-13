import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const deploy: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  log("--- [1/5] Deploying NullifierRegistry ---");

  const result = await deploy("NullifierRegistry", {
    from: deployer,
    args: [deployer],   // admin = deployer; transfer to multisig post-deploy
    log: true,
    waitConfirmations: 1,
  });

  log(`NullifierRegistry deployed at: ${result.address}`);
};

deploy.tags = ["NullifierRegistry", "all"];
export default deploy;
