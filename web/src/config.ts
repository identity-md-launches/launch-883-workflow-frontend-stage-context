import {
  createPublicClient,
  defineChain,
  fallback,
  http,
  parseAbi,
  keccak256,
  toBytes,
  type Abi,
  type Address,
} from "viem";
export type PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};
export type Deployment = {
  version: 1;
  launchId: string;
  chainId: number;
  sourceCommit: string;
  attestationHash: string;
  contracts: {
    name: string;
    address: Address;
    abiHash: string;
    abiPath: string;
  }[];
  poolKey: PoolKey;
  assets: { path: string; sha256: string }[];
  network: {
    chainId: number;
    name: string;
    testnet: boolean;
    rpcUrls: string[];
    explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    uniswapV4: {
      poolManager: Address;
      universalRouter: Address;
      quoter: Address;
      stateView: Address;
      positionManager: Address;
      permit2: Address;
      extendedSwapParams?: boolean;
    };
  };
  walletAddChain?: {
    chainId: string;
    chainName: string;
    rpcUrls: string[];
    nativeCurrency: { name: string; symbol: string; decimals: number };
    blockExplorerUrls: string[];
  };
};
export const poolTuple =
  "(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)";
// Protocol interfaces only. Deployment ABIs are fetched from the manifest and hash-checked.
export const protocol = {
  quoter: parseAbi([
    `function quoteExactInputSingle((${poolTuple} poolKey, bool zeroForOne, uint128 exactAmount, bytes hookData) params) returns (uint256 amountOut, uint256 gasEstimate)`,
    "error NotEnoughLiquidity(bytes32 poolId)",
    "error UnexpectedRevertBytes(bytes revertData)",
  ]),
  router: parseAbi([
    "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable",
    "error ExecutionFailed(uint256 commandIndex, bytes message)",
    "error TransactionDeadlinePassed()",
  ]),
  state: parseAbi([
    "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
    "function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)",
  ]),
  permit: parseAbi([
    "function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)",
    "function approve(address token, address spender, uint160 amount, uint48 expiration)",
  ]),
};
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map(
          (k) =>
            JSON.stringify(k) +
            ":" +
            canonical((value as Record<string, unknown>)[k]),
        )
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export async function loadDeployment() {
  const response = await fetch("./imd-deployment.json", { cache: "no-store" });
  if (!response.ok)
    throw new Error(
      "Deployment configuration is unavailable. Reload this page.",
    );
  const config = (await response.json()) as Deployment;
  if (
    config.version !== 1 ||
    config.chainId !== config.network.chainId ||
    !config.poolKey ||
    !config.network.rpcUrls.length
  )
    throw new Error(
      "Deployment configuration is invalid. Transactions are disabled.",
    );
  const abis: Record<string, Abi> = {};
  for (const contract of config.contracts) {
    if (
      !/^[\w/-]+\.json$/.test(contract.abiPath) ||
      contract.abiPath.includes("..")
    )
      throw new Error("Unsafe ABI path.");
    const res = await fetch("./" + contract.abiPath);
    if (!res.ok) throw new Error("Contract ABI could not be loaded.");
    const abi = await res.json();
    if (
      !Array.isArray(abi) ||
      keccak256(toBytes(canonical(abi))).slice(2) !== contract.abiHash
    )
      throw new Error(
        "Contract ABI verification failed. Transactions are disabled.",
      );
    abis[contract.name] = abi;
  }
  const token = config.contracts.find((c) => c.name === "LaunchToken");
  if (
    !token ||
    ![config.poolKey.currency0, config.poolKey.currency1].some(
      (a) => a.toLowerCase() === token.address.toLowerCase(),
    )
  )
    throw new Error("The token is missing from the configured pool.");
  const chain = defineChain({
    id: config.chainId,
    name: config.network.name,
    nativeCurrency: config.network.nativeCurrency,
    rpcUrls: { default: { http: config.network.rpcUrls } },
  });
  const client = createPublicClient({
    chain,
    transport: fallback(
      config.network.rpcUrls.map((url) =>
        http(url, { timeout: 10000, retryCount: 0 }),
      ),
    ),
    batch: { multicall: false },
  });
  return { config, abis, token, chain, client };
}
export type Runtime = Awaited<ReturnType<typeof loadDeployment>>;
