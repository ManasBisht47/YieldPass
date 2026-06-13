import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-deploy";
import * as dotenv from "dotenv";

dotenv.config();

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY ?? "";
const ORACLE_PRIVATE_KEY   = process.env.ORACLE_PRIVATE_KEY   ?? "";

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          evmVersion: "paris",  // safe for QIE EVM - avoids PUSH0/MCOPY opcodes
          viaIR: false,
        },
      },
    ],
  },

  networks: {
    hardhat: {
      chainId: 31337,
    },

    "qie-testnet": {
      url: "https://rpc1testnet.qie.digital/",
      chainId: 1983,
      // accounts[0] = deployer, accounts[1] = oracle (must match namedAccounts)
      accounts: [
        ...(DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : []),
        ...(ORACLE_PRIVATE_KEY   ? [ORACLE_PRIVATE_KEY]   : []),
      ],
      gasPrice: 10_000_000_000, // 10 gwei in aqie terms
    },

    "qie-mainnet": {
      url: "https://rpc1mainnet.qie.digital/",
      chainId: 1990,
      accounts: [
        ...(DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : []),
        ...(ORACLE_PRIVATE_KEY   ? [ORACLE_PRIVATE_KEY]   : []),
      ],
      gasPrice: 10_000_000_000,
    },
  },

  namedAccounts: {
    deployer: { default: 0 },
    oracle:   { default: 1 },
    treasury: { default: 2 },
  },

  paths: {
    sources:   "./contracts",
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts",
    deploy:    "./deploy",
  },

  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
  },

  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
};

export default config;
