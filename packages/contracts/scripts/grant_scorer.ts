import { ethers, deployments, getNamedAccounts } from "hardhat";

async function main() {
  const rep = await deployments.get("ReputationRegistry");
  const contract = await ethers.getContractAt("ReputationRegistry", rep.address);
  
  const SCORER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("SCORER_ROLE"));
  const oracleAddress = "0xd1E5acc709fd0A2A95163a43302E94daa82e5EBC";
  
  const tx = await contract.grantRole(SCORER_ROLE, oracleAddress);
  await tx.wait();
  console.log("SCORER_ROLE granted to oracle:", oracleAddress);
  console.log("Tx:", tx.hash);
}

main().catch(console.error);
