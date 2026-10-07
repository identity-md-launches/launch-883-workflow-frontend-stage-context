import {
  encodeFunctionData,
  encodeAbiParameters,
  parseAbiParameters,
  keccak256,
  zeroAddress,
  parseUnits,
  formatUnits,
  getAddress,
  isAddress,
  type Address,
  type Hex,
  type Abi,
  type EIP1193Provider,
  createWalletClient,
  custom,
} from "viem";
import { protocol, poolTuple, type Runtime } from "./config";
export type Provider = EIP1193Provider & {
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (
    event: string,
    handler: (...args: unknown[]) => void,
  ) => void;
};
declare global {
  interface Window {
    ethereum?: Provider;
  }
}
export const poolId = (r: Runtime) =>
  keccak256(
    encodeAbiParameters(parseAbiParameters(poolTuple), [r.config.poolKey]),
  );
export const display = (n: bigint, decimals = 18) => {
  const raw = formatUnits(n, decimals);
  if (n > 0n && Number(raw) < 0.000001) return raw;
  const [i, f] = raw.split(".");
  return Number(i).toLocaleString("en-US") + (f ? "." + f.slice(0, 6) : "");
};
export const short = (s: string) => s.slice(0, 6) + "…" + s.slice(-4);
export function amount(value: string, decimals: number, allowZero = false) {
  if (
    !/^(0|[1-9]\d*)(\.\d+)?$/.test(value) ||
    (value.split(".")[1]?.length ?? 0) > decimals
  )
    throw new Error(`Enter a number with up to ${decimals} decimal places.`);
  const result = parseUnits(value, decimals);
  if ((!allowZero && result === 0n) || result > (1n << 128n) - 1n)
    throw new Error(
      "Enter an amount greater than zero and within the supported range.",
    );
  return result;
}
export function address(value: string): Address {
  const a = value.trim();
  if (!isAddress(a) || a.toLowerCase() === zeroAddress)
    throw new Error("Enter a valid nonzero Ethereum address.");
  return getAddress(a);
}
export function errorText(error: unknown): string {
  const e = error as {
    code?: number;
    shortMessage?: string;
    message?: string;
    cause?: unknown;
    data?: { errorName?: string };
  };
  if (e?.code === 4001 || /rejected|denied/i.test(e?.message ?? ""))
    return "Request rejected in your wallet. You can try again.";
  const name = e?.data?.errorName ?? "";
  if (/InsufficientBalance/.test(name + e?.message))
    return "Insufficient token balance. Reduce the amount and try again.";
  if (/InsufficientAllowance/.test(name + e?.message))
    return "The spending allowance is too low. Update the approval and try again.";
  if (/insufficient funds/i.test(e?.message ?? ""))
    return "Insufficient ETH for the amount and network fee. Add ETH or reduce the amount.";
  if (/InvalidReceiver|InvalidSpender|InvalidSender/.test(name + e?.message))
    return "The contract rejected this address. Check it and try again.";
  if (/NotEnoughLiquidity/.test(name + e?.message))
    return "Not enough liquidity for this trade direction or amount. Reduce the amount or try the other direction.";
  if (/TransactionDeadlinePassed/.test(name + e?.message))
    return "The swap deadline passed. Get a fresh quote and try again.";
  if (/UnexpectedRevertBytes/.test(name + e?.message))
    return "Quote simulation reverted. This direction or amount may lack liquidity. Try a smaller amount or the other direction.";
  if (/ExecutionFailed/.test(name + e?.message))
    return "The router simulation rejected this swap. Refresh the quote and allowances, then try a smaller amount.";
  if (/following signature|0x[0-9a-f]{8}/i.test(e?.shortMessage ?? ""))
    return "The contract rejected this request without a readable reason. Refresh the quote, check the amount and try again.";
  if (e?.shortMessage)
    return e.shortMessage.slice(0, 250) + " Check the details and try again.";
  if (e?.message) return e.message.slice(0, 250);
  return "Unable to complete this request. Check your connection and try again.";
}
export async function switchChain(r: Runtime, p: Provider) {
  const chainId = `0x${r.config.chainId.toString(16)}`;
  try {
    await p.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  } catch (error) {
    const e = error as {
      code?: number;
      message?: string;
      data?: { originalError?: { code?: number } };
    };
    if (
      (e.code === 4902 ||
        e.data?.originalError?.code === 4902 ||
        /unknown chain|unrecognized chain|not added/i.test(e.message ?? "")) &&
      r.config.walletAddChain
    ) {
      await p.request({
        method: "wallet_addEthereumChain",
        params: [r.config.walletAddChain],
      });
      await p.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId }],
      });
    } else throw error;
  }
}
export async function checkWallet(r: Runtime, p: Provider, account: Address) {
  const [chain, accounts] = await Promise.all([
    p.request({ method: "eth_chainId" }),
    p.request({ method: "eth_accounts" }),
  ]);
  if (
    Number(chain) !== r.config.chainId ||
    accounts[0]?.toLowerCase() !== account.toLowerCase()
  )
    throw new Error(
      "Wallet account or network changed. Reconnect and review the action again.",
    );
}
export async function verifyCode(r: Runtime) {
  if ((await r.client.getChainId()) !== r.config.chainId)
    throw new Error(
      "RPC network verification failed. Transactions are disabled.",
    );
  const addresses = [
    ...r.config.contracts.map((c) => c.address),
    ...Object.values(r.config.network.uniswapV4).filter(
      (x): x is Address => typeof x === "string",
    ),
    r.config.poolKey.hooks,
  ].filter((a) => a !== zeroAddress);
  for (const a of new Set(addresses)) {
    const code = await r.client.getCode({ address: a });
    if (!code || code === "0x")
      throw new Error(
        `No deployed code at ${short(a)}. Transactions are disabled.`,
      );
  }
}
export type Live = {
  name: string;
  symbol: string;
  decimals: number;
  supply: bigint;
  tokenBalance?: bigint;
  ethBalance?: bigint;
  sqrtPrice: bigint;
  liquidity: bigint;
  lpFee: number;
  protocolFee: number;
  block: bigint;
  updated: number;
};
export async function readLive(r: Runtime, account?: Address): Promise<Live> {
  const token = { address: r.token.address, abi: r.abis[r.token.name] };
  const block = await r.client.getBlockNumber();
  const read = (functionName: string, args?: readonly unknown[]) =>
    r.client.readContract({ ...token, functionName, args, blockNumber: block });
  const [
    name,
    symbol,
    decimals,
    supply,
    slot,
    liquidity,
    tokenBalance,
    ethBalance,
  ] = await Promise.all([
    read("name"),
    read("symbol"),
    read("decimals"),
    read("totalSupply"),
    r.client.readContract({
      address: r.config.network.uniswapV4.stateView,
      abi: protocol.state,
      functionName: "getSlot0",
      args: [poolId(r)],
      blockNumber: block,
    }),
    r.client.readContract({
      address: r.config.network.uniswapV4.stateView,
      abi: protocol.state,
      functionName: "getLiquidity",
      args: [poolId(r)],
      blockNumber: block,
    }),
    account ? read("balanceOf", [account]) : undefined,
    account
      ? r.client.getBalance({ address: account, blockNumber: block })
      : undefined,
  ]);
  return {
    name: name as string,
    symbol: symbol as string,
    decimals: decimals as number,
    supply: supply as bigint,
    sqrtPrice: slot[0],
    protocolFee: slot[2],
    lpFee: slot[3],
    liquidity,
    tokenBalance: tokenBalance as bigint | undefined,
    ethBalance,
    block,
    updated: Date.now(),
  };
}
export async function getAllowances(r: Runtime, account: Address) {
  const { permit2, universalRouter } = r.config.network.uniswapV4;
  const [erc20, permit] = await Promise.all([
    r.client.readContract({
      address: r.token.address,
      abi: r.abis[r.token.name],
      functionName: "allowance",
      args: [account, permit2],
    }) as Promise<bigint>,
    r.client.readContract({
      address: permit2,
      abi: protocol.permit,
      functionName: "allowance",
      args: [account, r.token.address, universalRouter],
    }),
  ]);
  return { erc20, permit: permit[0], expiration: permit[1] };
}
export function swapInput(
  r: Runtime,
  buy: boolean,
  input: bigint,
  minimum: bigint,
) {
  const key = r.config.poolKey;
  const inputCurrency = buy ? zeroAddress : r.token.address;
  const outputCurrency = buy ? r.token.address : zeroAddress;
  if (![key.currency0, key.currency1].includes(zeroAddress))
    throw new Error("This interface supports the assigned ETH pair only.");
  const zeroForOne =
    key.currency0.toLowerCase() === inputCurrency.toLowerCase();
  const extended = r.config.network.uniswapV4.extendedSwapParams;
  const tuple = `(${poolTuple} poolKey, bool zeroForOne, uint128 amountIn, uint128 amountOutMinimum, ${extended ? "uint256 minHopPriceX36, " : ""}bytes hookData)`;
  const params = [
    encodeAbiParameters(parseAbiParameters(tuple), [
      {
        poolKey: key,
        zeroForOne,
        amountIn: input,
        amountOutMinimum: minimum,
        ...(extended ? { minHopPriceX36: 0n } : {}),
        hookData: "0x",
      },
    ]),
    encodeAbiParameters(parseAbiParameters("address, uint256"), [
      inputCurrency,
      input,
    ]),
    encodeAbiParameters(parseAbiParameters("address, uint256"), [
      outputCurrency,
      minimum,
    ]),
  ];
  return encodeAbiParameters(parseAbiParameters("bytes, bytes[]"), [
    "0x060c0f",
    params,
  ]);
}
export type Call = {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
  value?: bigint;
};
export async function transact(
  r: Runtime,
  p: Provider,
  account: Address,
  call: Call,
  onHash: (hash: Hex) => void,
) {
  await checkWallet(r, p, account);
  await verifyCode(r);
  await r.client.simulateContract({
    ...call,
    abi: [
      ...call.abi,
      ...r.abis[r.token.name].filter((item) => item.type === "error"),
    ],
    account,
  });
  await checkWallet(r, p, account);
  const wallet = createWalletClient({
    account,
    chain: r.chain,
    transport: custom(p),
  });
  const hash = await wallet.sendTransaction({
    to: call.address,
    data: encodeFunctionData(call),
    value: call.value ?? 0n,
  });
  onHash(hash);
  const receipt = await r.client.waitForTransactionReceipt({
    hash,
    confirmations: 1,
    timeout: 180000,
  });
  if (receipt.status !== "success")
    throw new Error(
      "Transaction reverted on Ethereum. No action completed; network fees may still apply.",
    );
  return hash;
}
