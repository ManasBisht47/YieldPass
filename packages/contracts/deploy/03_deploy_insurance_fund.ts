import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

// QUSDC mainnet address — replace with testnet address when deploying to testnet.
const QUSDC_ADDRESS = "0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5";

const deploy: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  log("--- [3/5] Deploying InsuranceFund ---");

  // On local / testnet use MockQUSDC; on mainnet use the real address.
  let qusdcAddress = QUSDC_ADDRESS;
  if (network.name === "hardhat" || network.name === "qie-testnet") {
    const mock = await deployments.get("MockQUSDC").catch(() => null);
    if (mock) qusdcAddress = mock.address;
  }

  const result = await deploy("InsuranceFund", {
    from: deployer,
    args: [deployer, qusdcAddress],
    log: true,
    waitConfirmations: 1,
  });

  log(`InsuranceFund deployed at: ${result.address}`);
};

deploy.tags = ["InsuranceFund", "all"];
export default deploy;
