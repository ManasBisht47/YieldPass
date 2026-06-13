import YieldVaultABI         from "../../../../shared/abis/YieldVault.json";
import YieldStrategyABI      from "../../../../shared/abis/YieldStrategy.json";
import ReputationRegistryABI from "../../../../shared/abis/ReputationRegistry.json";
import NullifierRegistryABI  from "../../../../shared/abis/NullifierRegistry.json";
import InsuranceFundABI      from "../../../../shared/abis/InsuranceFund.json";
import LendingPoolABI        from "../../../../shared/abis/LendingPool.json";
import PriceOracleABI        from "../../../../shared/abis/PriceOracle.json";
import InterestRateModelABI  from "../../../../shared/abis/InterestRateModel.json";
import { CONTRACTS } from "./constants";

export const yieldVaultContract = {
  address: CONTRACTS.yieldVault,
  abi: YieldVaultABI.abi,
} as const;

export const reputationRegistryContract = {
  address: CONTRACTS.reputationRegistry,
  abi: ReputationRegistryABI.abi,
} as const;

export const nullifierRegistryContract = {
  address: CONTRACTS.nullifierRegistry,
  abi: NullifierRegistryABI.abi,
} as const;

export const insuranceFundContract = {
  address: CONTRACTS.insuranceFund,
  abi: InsuranceFundABI.abi,
} as const;

export const yieldStrategyContract = {
  address: CONTRACTS.yieldStrategy,
  abi: YieldStrategyABI.abi,
} as const;

export const lendingPoolContract = {
  address: CONTRACTS.lendingPool,
  abi: LendingPoolABI.abi,
} as const;

export const priceOracleContract = {
  address: CONTRACTS.priceOracle,
  abi: PriceOracleABI.abi,
} as const;

export const interestRateModelContract = {
  address: CONTRACTS.interestRateModel,
  abi: InterestRateModelABI.abi,
} as const;
