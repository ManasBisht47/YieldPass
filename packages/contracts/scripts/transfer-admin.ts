/**
 * transfer-admin.ts — mainnet launch-day script.
 *
 * Moves DEFAULT_ADMIN_ROLE on every protocol contract from the deployer EOA
 * to a multisig (Gnosis Safe), then renounces the deployer's admin role.
 * After this runs, no single key can touch oracle/roles/pause.
 *
 * Usage:
 *   NEW_ADMIN=0xYourSafeAddress npx hardhat run scripts/transfer-admin.ts --network qie-mainnet
 *
 * Dry-run first (omit RENOUNCE=1 to keep deployer admin until verified):
 *   NEW_ADMIN=0xSafe npx hardhat run scripts/transfer-admin.ts --network qie-mainnet
 *   # verify Safe can execute an admin call, THEN:
 *   NEW_ADMIN=0xSafe RENOUNCE=1 npx hardhat run scripts/transfer-admin.ts --network qie-mainnet
 */

import { ethers, deployments } from "hardhat";

const ADMIN_ROLE = ethers.ZeroHash; // DEFAULT_ADMIN_ROLE = 0x00

const CONTRACTS = [
  "ReputationRegistry",
  "NullifierRegistry",
  "InsuranceFundQIE",
  "YieldStrategyQIE2",
  "YieldVaultQIE2",
  "LendingPoolV4",
  "PriceOracleV2",
  "InterestRateModel",
];

async function main() {
  const newAdmin = process.env.NEW_ADMIN;
  if (!newAdmin || !ethers.isAddress(newAdmin)) {
    throw new Error("Set NEW_ADMIN=0x… (the multisig address)");
  }
  const renounce = process.env.RENOUNCE === "1";
  const [deployer] = await ethers.getSigners();

  console.log(`Deployer:  ${deployer.address}`);
  console.log(`New admin: ${newAdmin}`);
  console.log(`Renounce:  ${renounce ? "YES — deployer loses admin" : "no (dry-run handover)"}\n`);

  for (const name of CONTRACTS) {
    const dep = await deployments.get(name).catch(() => null);
    if (!dep) { console.log(`- ${name}: not deployed on this network, skipping`); continue; }

    const c = await ethers.getContractAt("AccessControl", dep.address);

    const hasNew = await c.hasRole(ADMIN_ROLE, newAdmin);
    if (!hasNew) {
      const tx = await c.grantRole(ADMIN_ROLE, newAdmin);
      await tx.wait();
      console.log(`✓ ${name}: granted admin to multisig`);
    } else {
      console.log(`- ${name}: multisig already admin`);
    }

    if (renounce) {
      const tx = await c.renounceRole(ADMIN_ROLE, deployer.address);
      await tx.wait();
      console.log(`✓ ${name}: deployer renounced admin`);
    }
  }

  console.log("\nDone. Verify with hasRole() before funding mainnet contracts.");
}

main().catch((e) => { console.error(e); process.exit(1); });
