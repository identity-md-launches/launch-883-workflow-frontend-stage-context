import { readFile, writeFile } from "node:fs/promises";
import {
  createPublicClient,
  http,
  encodeAbiParameters,
  parseAbiParameters,
  keccak256,
  parseAbi,
} from "viem";
const manifest = JSON.parse(
  await readFile(new URL("../../dist/imd-deployment.json", import.meta.url)),
);
const abi = JSON.parse(
  await readFile(
    new URL("../../dist/" + manifest.contracts[0].abiPath, import.meta.url),
  ),
);
const report = {
  date: new Date().toISOString(),
  kind: "Read-only public RPC validation. No transaction sent.",
  endpoints: [],
};
for (const url of manifest.network.rpcUrls) {
  const item = { url };
  report.endpoints.push(item);
  try {
    const c = createPublicClient({
      transport: http(url, { timeout: 10000, retryCount: 0 }),
    });
    item.chainId = await c.getChainId();
    if (item.chainId !== manifest.chainId) throw Error("Wrong RPC chain");
    item.block = String(await c.getBlockNumber());
    item.code = [];
    for (const [name, address] of [
      ...manifest.contracts.map((c) => [c.name, c.address]),
      ...Object.entries(manifest.network.uniswapV4).filter(
        ([, a]) => typeof a === "string",
      ),
      ["poolHook", manifest.poolKey.hooks],
    ]) {
      const code = await c.getCode({ address });
      item.code.push({
        name,
        address,
        bytes: code ? (code.length - 2) / 2 : 0,
      });
    }
    item.token = {};
    for (const functionName of ["name", "symbol", "decimals", "totalSupply"])
      item.token[functionName] = String(
        await c.readContract({
          address: manifest.contracts[0].address,
          abi,
          functionName,
        }),
      );
    const id = keccak256(
      encodeAbiParameters(
        parseAbiParameters(
          "(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)",
        ),
        [manifest.poolKey],
      ),
    );
    const state = parseAbi([
      "function getSlot0(bytes32) view returns (uint160,int24,uint24,uint24)",
      "function getLiquidity(bytes32) view returns (uint128)",
    ]);
    item.pool = {
      id,
      slot0: (
        await c.readContract({
          address: manifest.network.uniswapV4.stateView,
          abi: state,
          functionName: "getSlot0",
          args: [id],
        })
      ).map(String),
      liquidity: String(
        await c.readContract({
          address: manifest.network.uniswapV4.stateView,
          abi: state,
          functionName: "getLiquidity",
          args: [id],
        }),
      ),
    };
    const quoteAbi = parseAbi([
      "function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256,uint256)",
      "error UnexpectedRevertBytes(bytes revertData)",
      "error NotEnoughLiquidity(bytes32 poolId)",
    ]);
    item.quotes = [];
    for (const [direction, zeroForOne, exactAmount] of [
      ["ETH to HX", true, 100000000000000n],
      ["HX to ETH", false, 100000000000000000000n],
    ]) {
      try {
        const q = await c.simulateContract({
          address: manifest.network.uniswapV4.quoter,
          abi: quoteAbi,
          functionName: "quoteExactInputSingle",
          args: [
            {
              poolKey: manifest.poolKey,
              zeroForOne,
              exactAmount,
              hookData: "0x",
            },
          ],
        });
        item.quotes.push({
          direction,
          inputBaseUnits: String(exactAmount),
          outputBaseUnits: String(q.result[0]),
          gasEstimate: String(q.result[1]),
          success: true,
        });
      } catch (e) {
        item.quotes.push({
          direction,
          inputBaseUnits: String(exactAmount),
          success: false,
          error: e.shortMessage,
        });
      }
    }
    item.success = item.code.every((c) => c.bytes > 0);
  } catch (e) {
    item.success = false;
    item.error = e.shortMessage ?? e.message;
  }
}
await writeFile(
  new URL("../../docs/frontend/live-read.json", import.meta.url),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
