import { chromium, expect } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import {
  parseAbi,
  decodeFunctionData,
  encodeFunctionResult,
  encodeErrorResult,
  decodeAbiParameters,
  parseAbiParameters,
  toHex,
  zeroAddress,
} from "viem";
const root = fileURLToPath(new URL("../../", import.meta.url));
const dist = resolve(root, "dist");
const out = resolve(root, "docs/frontend");
await mkdir(out, { recursive: true });
const manifest = JSON.parse(
  await readFile(resolve(dist, "imd-deployment.json")),
);
const token = manifest.contracts[0];
const abi = JSON.parse(await readFile(resolve(dist, token.abiPath)));
const poolTuple =
  "(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)";
const quoteAbi = parseAbi([
  `function quoteExactInputSingle((${poolTuple} poolKey, bool zeroForOne, uint128 exactAmount, bytes hookData) params) returns (uint256 amountOut, uint256 gasEstimate)`,
  "error NotEnoughLiquidity(bytes32 poolId)",
]);
const routerAbi = parseAbi([
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable",
]);
const stateAbi = parseAbi([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)",
]);
const permitAbi = parseAbi([
  "function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)",
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
]);
const account = "0x1111111111111111111111111111111111111111";
const recipient = "0x2222222222222222222222222222222222222222";
const hash = "0x" + "ab".repeat(32);
const blockHash = "0x" + "cd".repeat(32);
const unit = 10n ** 18n;
const results = [];
const consoleErrors = [];
const resourceErrors = [];
let state;
const freshState = () => ({
  chain: "0x1",
  rejectConnect: false,
  rejectSend: false,
  unknownChain: false,
  erc20: 0n,
  permit: 0n,
  expiration: 0,
  sends: [],
  requests: [],
  calls: [],
  code: "0x60006000",
  liquidity: 1000000n,
  sqrtPrice: 2n ** 96n,
  failQuote: false,
  failSimulate: false,
  blocks: 0,
  pending: false,
  receiptRevert: false,
  blockReceipt: false,
});
function contractAbi(to) {
  const n = manifest.network.uniswapV4;
  if (to.toLowerCase() === token.address.toLowerCase()) return abi;
  if (to.toLowerCase() === n.quoter.toLowerCase()) return quoteAbi;
  if (to.toLowerCase() === n.stateView.toLowerCase()) return stateAbi;
  if (to.toLowerCase() === n.permit2.toLowerCase()) return permitAbi;
  if (to.toLowerCase() === n.universalRouter.toLowerCase()) return routerAbi;
  throw Error(`Unexpected contract ${to}`);
}
async function rpc(body) {
  const { method, params = [] } = body;
  state.requests.push(method);
  switch (method) {
    case "eth_chainId":
      return state.chain;
    case "eth_requestAccounts":
      if (state.rejectConnect) throw { code: 4001, message: "User rejected" };
      return [account];
    case "eth_accounts":
      return [account];
    case "wallet_switchEthereumChain":
      if (state.unknownChain) throw { code: 4902, message: "Unknown chain" };
      state.chain = params[0].chainId;
      return null;
    case "wallet_addEthereumChain":
      assert.deepEqual(params[0], manifest.walletAddChain);
      state.unknownChain = false;
      return null;
    case "eth_getCode":
      return state.code;
    case "eth_blockNumber":
      return toHex(0x18f0000 + state.blocks++);
    case "eth_getBalance":
      return toHex(10n * unit);
    case "eth_call": {
      const call = params[0];
      const interfaceAbi = contractAbi(call.to);
      const decoded = decodeFunctionData({
        abi: interfaceAbi,
        data: call.data,
      });
      const { functionName: fn, args } = decoded;
      state.calls.push({ to: call.to, fn, args, value: call.value });
      let result;
      if (fn === "name") result = "HS XWesXkAAMSB0";
      else if (fn === "symbol") result = "HX";
      else if (fn === "decimals") result = 18;
      else if (fn === "totalSupply") result = 1000000000n * unit;
      else if (fn === "balanceOf") result = 10000n * unit;
      else if (fn === "getSlot0") result = [state.sqrtPrice, 0, 0, 12500];
      else if (fn === "getLiquidity") result = state.liquidity;
      else if (fn === "allowance")
        result =
          interfaceAbi === permitAbi
            ? [state.permit, state.expiration, 0]
            : state.erc20;
      else if (fn === "quoteExactInputSingle") {
        if (state.failQuote)
          throw {
            code: 3,
            message: "execution reverted",
            data: encodeErrorResult({
              abi: quoteAbi,
              errorName: "NotEnoughLiquidity",
              args: ["0x" + "00".repeat(32)],
            }),
          };
        const actual = Object.fromEntries(
          Object.entries(args[0].poolKey).map(([k, v]) => [
            k,
            typeof v === "string" ? v.toLowerCase() : v,
          ]),
        );
        assert.deepEqual(actual, manifest.poolKey);
        result = [
          args[0].zeroForOne
            ? args[0].exactAmount * 1000n
            : args[0].exactAmount / 1000n,
          130000n,
        ];
      } else if (
        ["approve", "transfer", "transferFrom", "execute"].includes(fn)
      ) {
        if (state.failSimulate)
          throw {
            code: 3,
            message: "execution reverted: Insufficient balance",
            data: encodeErrorResult({
              abi,
              errorName: "ERC20InsufficientBalance",
              args: [account, 0n, unit],
            }),
          };
        result =
          fn === "execute" || interfaceAbi === permitAbi ? undefined : true;
      } else throw Error(`Unhandled function ${fn}`);
      return encodeFunctionResult({
        abi: interfaceAbi,
        functionName: fn,
        result,
      });
    }
    case "eth_sendTransaction": {
      if (state.rejectSend)
        throw { code: 4001, message: "User rejected request" };
      const call = params[0];
      const interfaceAbi = contractAbi(call.to);
      const decoded = decodeFunctionData({
        abi: interfaceAbi,
        data: call.data,
      });
      assert.ok(
        state.calls.some(
          (c) =>
            c.fn === decoded.functionName &&
            c.to.toLowerCase() === call.to.toLowerCase(),
        ),
        "Every write simulated",
      );
      state.sends.push({ ...call, decoded });
      if (decoded.functionName === "approve") {
        if (interfaceAbi === abi) state.erc20 = decoded.args[1];
        else {
          state.permit = decoded.args[2];
          state.expiration = decoded.args[3];
        }
      }
      return hash;
    }
    case "eth_getTransactionReceipt":
      if (state.blockReceipt) return null;
      return {
        transactionHash: hash,
        transactionIndex: "0x0",
        blockHash,
        blockNumber: "0x18f0000",
        from: account,
        to: state.sends.at(-1)?.to ?? token.address,
        cumulativeGasUsed: "0x5208",
        gasUsed: "0x5208",
        contractAddress: null,
        logs: [],
        logsBloom: "0x" + "00".repeat(256),
        status: state.receiptRevert ? "0x0" : "0x1",
        effectiveGasPrice: "0x1",
        type: "0x2",
      };
    case "eth_getTransactionByHash":
      return {
        hash,
        nonce: "0x0",
        blockHash,
        blockNumber: "0x18f0000",
        transactionIndex: "0x0",
        from: account,
        to: token.address,
        value: "0x0",
        gas: "0x5208",
        gasPrice: "0x1",
        input: "0x",
        v: "0x1",
        r: "0x1",
        s: "0x1",
        type: "0x0",
      };
    case "eth_getBlockByNumber":
      return {
        hash: blockHash,
        number: "0x18f0000",
        timestamp: toHex(Math.floor(Date.now() / 1000)),
        gasLimit: "0x1c9c380",
        gasUsed: "0x1",
        baseFeePerGas: "0x1",
        transactions: [],
        parentHash: blockHash,
        sha3Uncles: blockHash,
        logsBloom: "0x" + "00".repeat(256),
        transactionsRoot: blockHash,
        stateRoot: blockHash,
        receiptsRoot: blockHash,
        miner: account,
        difficulty: "0x0",
        totalDifficulty: "0x0",
        extraData: "0x",
        size: "0x1",
        nonce: "0x0000000000000000",
        mixHash: blockHash,
        uncles: [],
      };
    default:
      throw Error(`Unhandled RPC ${method}`);
  }
}
const mime = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".mp4": "video/mp4",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/preview/")) {
      res.writeHead(404).end();
      return;
    }
    const file = resolve(
      dist,
      decodeURIComponent(url.pathname.slice("/preview/".length)) ||
        "index.html",
    );
    if (!file.startsWith(dist + "/")) throw Error("Invalid path");
    const data = await readFile(file);
    res.writeHead(200, {
      "Content-Type": mime[extname(file)] ?? "application/octet-stream",
    });
    res.end(data);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/preview/`;
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || "/opt/google/chrome/chrome",
  headless: true,
  args: ["--no-sandbox"],
});
let context, page;
async function start({
  wallet = true,
  chain = "0x1",
  corruptAbi = false,
  ...overrides
} = {}) {
  if (context) await context.close();
  state = { ...freshState(), chain, ...overrides };
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  await context.route(
    /^https:\/\/(ethereum-rpc\.publicnode\.com|eth\.drpc\.org)/,
    async (route) => {
      const body = route.request().postDataJSON();
      const response = async (b) => {
        try {
          // Public RPC always stays on mainnet; wallet chain varies independently.
          const result =
            b.method === "eth_chainId"
              ? (state.rpcChain ?? "0x1")
              : await rpc(b);
          return { jsonrpc: "2.0", id: b.id, result };
        } catch (e) {
          return {
            jsonrpc: "2.0",
            id: b.id,
            error: { code: e.code ?? -32603, message: e.message, data: e.data },
          };
        }
      };
      await route.fulfill({
        json: Array.isArray(body)
          ? await Promise.all(body.map(response))
          : await response(body),
      });
    },
  );
  if (corruptAbi)
    await context.route("**/abi/LaunchToken.json", (route) =>
      route.fulfill({ json: [] }),
    );
  page = await context.newPage();
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  page.on("response", (r) => {
    if (r.url().startsWith(url) && r.status() >= 400)
      resourceErrors.push(r.url());
  });
  if (wallet) {
    await page.exposeFunction("mockWalletRequest", async (b) => {
      try {
        return { result: await rpc(b) };
      } catch (e) {
        return { error: { code: e.code, message: e.message } };
      }
    });
    await page.addInitScript(() => {
      const listeners = {};
      window.ethereum = {
        request: async (args) => {
          const r = await window.mockWalletRequest(args);
          if (r.error) throw r.error;
          return r.result;
        },
        on: (event, fn) => (listeners[event] ??= []).push(fn),
        removeListener: (event, fn) => {
          listeners[event] = listeners[event]?.filter((x) => x !== fn);
        },
      };
      window.emitWallet = (event, args) =>
        listeners[event]?.forEach((fn) => fn(args));
    });
  }
  await page.goto(url);
  await page
    .locator(".live-status")
    .filter({
      hasText:
        /Pool initialized|Pool not initialized|Live verification unavailable|Configuration unavailable/,
    })
    .waitFor({ timeout: 15000 });
}
const expectText = async (text) =>
  page.getByText(text, { exact: false }).first().waitFor({ timeout: 12000 });
const connect = async () => {
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await expectText("0x1111111111111111111111111111111111111111");
  await page.getByRole("button", { name: "Get quote", exact: true }).waitFor();
};
const quote = async (v = "0.1") => {
  await page.getByLabel("You pay", { exact: true }).fill(v);
  await page.getByRole("button", { name: "Get quote", exact: true }).click();
  await expectText("Minimum received");
};
async function test(name, fn) {
  await fn();
  results.push({ name, status: "passed" });
  console.log("PASS", name);
}
try {
  await test("Static subpath, missing wallet, keyboard focus, paused motion and responsive layouts", async () => {
    await start({ wallet: false });
    assert.equal(await page.locator("video").evaluate((v) => v.paused), true);
    await page.keyboard.press("Tab");
    assert.equal(await page.locator(":focus").textContent(), "Skip to content");
    await page.screenshot({
      path: resolve(out, "keyboard.webp"),
      type: "webp",
    });
    await page.locator("h1").click();
    await page.screenshot({
      path: resolve(out, "desktop.webp"),
      type: "webp",
      fullPage: true,
    });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        `No overflow at ${width}`,
      );
      if (width === 390)
        await page.screenshot({
          path: resolve(out, "mobile.webp"),
          type: "webp",
          fullPage: true,
        });
    }
    await page.setViewportSize({ width: 768, height: 900 });
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "32px"),
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      "200% text enlargement",
    );
    await page.evaluate(() => (document.documentElement.style.fontSize = ""));
    await page
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    await expectText("No browser wallet found");
    assert.equal(state.sends.length, 0);
  });
  await test("Wallet rejection is recoverable", async () => {
    await start({ rejectConnect: true });
    await page
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    await expectText("Request rejected in your wallet");
    state.rejectConnect = false;
    await connect();
  });
  await test("Wrong-chain action, unknown-chain add then switch, live balances", async () => {
    await start({ chain: "0xa", unknownChain: true });
    await page
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    await expectText("Wrong network");
    assert.equal(state.sends.length, 0);
    await page.getByRole("button", { name: "Switch to Ethereum" }).click();
    await page
      .getByRole("button", { name: "Get quote", exact: true })
      .waitFor();
    await expectText("Balance: 10 ETH");
    assert.ok(state.requests.includes("wallet_addEthereumChain"));
    assert.equal(
      state.requests.filter((x) => x === "wallet_switchEthereumChain").length,
      2,
    );
  });
  await test("Native buy quote and simulated router swap, exact pool key, minimum, commands, value", async () => {
    await start();
    await connect();
    await quote();
    await page.getByRole("button", { name: "Confirm swap" }).click();
    await expectText("Confirmed on Ethereum.");
    assert.equal(state.sends.length, 1);
    const tx = state.sends[0];
    assert.equal(
      tx.to.toLowerCase(),
      manifest.network.uniswapV4.universalRouter,
    );
    assert.equal(BigInt(tx.value), unit / 10n);
    const [commands, inputs] = tx.decoded.args;
    assert.equal(commands, "0x10");
    const [actions, params] = decodeAbiParameters(
      parseAbiParameters("bytes, bytes[]"),
      inputs[0],
    );
    assert.equal(actions, "0x060c0f");
    const [swap] = decodeAbiParameters(
      parseAbiParameters(
        `(${poolTuple} poolKey, bool zeroForOne, uint128 amountIn, uint128 amountOutMinimum, bytes hookData)`,
      ),
      params[0],
    );
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(swap.poolKey).map(([k, v]) => [
          k,
          typeof v === "string" ? v.toLowerCase() : v,
        ]),
      ),
      manifest.poolKey,
    );
    assert.equal(swap.amountOutMinimum, (995n * unit) / 10n);
    assert.equal(swap.hookData, "0x");
    assert.equal(swap.zeroForOne, true);
    assert.deepEqual(
      decodeAbiParameters(parseAbiParameters("address,uint256"), params[1]).map(
        (v) => (typeof v === "string" ? v.toLowerCase() : v),
      ),
      [zeroAddress, unit / 10n],
    );
  });
  await test("Token sale requires two exact approvals, mined receipts, then zero-value swap", async () => {
    await start();
    await connect();
    await page.getByRole("button", { name: "Sell HX", exact: true }).click();
    await quote("10");
    await page
      .getByRole("button", { name: "1. Approve HX to Permit2" })
      .click();
    await page
      .getByRole("button", { name: "2. Approve HX for router" })
      .waitFor();
    await page
      .getByRole("button", { name: "2. Approve HX for router" })
      .click();
    await page.getByRole("button", { name: "Confirm swap" }).waitFor();
    await page.getByRole("button", { name: "Confirm swap" }).click();
    await expectText("Confirmed on Ethereum.");
    await expect.poll(() => state.sends.length).toBe(3);
    assert.equal(
      state.sends[0].decoded.args[0].toLowerCase(),
      manifest.network.uniswapV4.permit2,
    );
    assert.equal(state.sends[0].decoded.args[1], 10n * unit);
    assert.equal(
      state.sends[1].to.toLowerCase(),
      manifest.network.uniswapV4.permit2,
    );
    assert.equal(
      state.sends[1].decoded.args[1].toLowerCase(),
      manifest.network.uniswapV4.universalRouter,
    );
    assert.equal(BigInt(state.sends[2].value ?? "0x0"), 0n);
  });
  await test("Sufficient fresh allowances skip approvals", async () => {
    await start({
      erc20: 100n * unit,
      permit: 100n * unit,
      expiration: Math.floor(Date.now() / 1000) + 3600,
    });
    await connect();
    await page.getByRole("button", { name: "Sell HX", exact: true }).click();
    await quote("1");
    await page.getByRole("button", { name: "Confirm swap" }).waitFor();
    assert.equal(state.sends.length, 0);
  });
  await test("Invalid amounts/slippage, quote error, field edit invalidates quote", async () => {
    await start();
    await connect();
    await page
      .getByLabel("You pay", { exact: true })
      .fill("0.0000000000000000001");
    await page.getByRole("button", { name: "Get quote", exact: true }).click();
    await expectText("up to 18 decimal places");
    await page.getByLabel("You pay", { exact: true }).fill("0.1");
    await page.getByLabel("Slippage tolerance").fill("10");
    await page.getByRole("button", { name: "Get quote", exact: true }).click();
    await expectText("Set slippage between");
    await page.getByLabel("Slippage tolerance").fill("0.5");
    state.failQuote = true;
    await page.getByRole("button", { name: "Get quote", exact: true }).click();
    await page
      .locator("#swap-error")
      .filter({ hasText: /Not enough liquidity/i })
      .waitFor();
    state.failQuote = false;
    await quote();
    await page.getByLabel("You pay", { exact: true }).fill("0.2");
    assert.equal(
      await page.getByRole("button", { name: "Confirm swap" }).count(),
      0,
    );
    assert.equal(state.sends.length, 0);
  });
  await test("Quote expiry blocks execution", async () => {
    await start();
    await connect();
    await page.clock.install();
    await quote();
    await page.clock.fastForward(31000);
    await expectText("Quote expired.");
    assert.equal(
      await page.getByRole("button", { name: "Confirm swap" }).count(),
      0,
    );
    assert.equal(state.sends.length, 0);
  });
  await test("Simulation failure prevents wallet send; rejection unlocks action", async () => {
    await start();
    await connect();
    await quote();
    state.failSimulate = true;
    await page.getByRole("button", { name: "Confirm swap" }).click();
    await expectText("Insufficient token balance");
    assert.equal(state.sends.length, 0);
    state.failSimulate = false;
    state.rejectSend = true;
    await page.getByRole("button", { name: "Confirm swap" }).click();
    await expectText("Request rejected in your wallet");
    assert.equal(state.sends.length, 0);
    assert.equal(
      await page.getByRole("button", { name: "Confirm swap" }).isEnabled(),
      true,
    );
  });
  await test("Pending receipt disables actions and guards duplicate transactions", async () => {
    await start({ blockReceipt: true });
    await connect();
    await quote();
    await page.getByRole("button", { name: "Confirm swap" }).click();
    await expectText("Waiting for Ethereum confirmation");
    assert.equal(
      await page
        .getByRole("button", { name: "Transaction in progress…", exact: true })
        .first()
        .isDisabled(),
      true,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Sell HX", exact: true })
        .isDisabled(),
      true,
    );
    assert.equal(state.sends.length, 1);
    state.blockReceipt = false;
    await expectText("Confirmed on Ethereum.");
  });
  await test("Account/network changes invalidate wallet and quote", async () => {
    await start();
    await connect();
    await quote();
    await page.evaluate(() => window.emitWallet("accountsChanged", []));
    await expectText("Wallet changed.");
    assert.equal(
      await page.getByRole("button", { name: "Confirm swap" }).count(),
      0,
    );
    assert.equal(state.sends.length, 0);
  });
  await test("Token transfer, approval revoke, allowance read and delegated transfer", async () => {
    await start();
    await connect();
    await page.getByText("Token tools", { exact: false }).first().click();
    await page.getByLabel("Recipient address", { exact: true }).fill("bad");
    await page.getByLabel("Amount (HX)", { exact: false }).fill("1");
    await page.getByRole("button", { name: "Review token action" }).click();
    await expectText("valid nonzero Ethereum address");
    await page.getByLabel("Recipient address", { exact: true }).fill(recipient);
    await page.getByRole("button", { name: "Review token action" }).click();
    await expectText("Transfers cannot be undone");
    assert.equal(state.sends.length, 0);
    await page
      .getByRole("button", { name: "Confirm transfer in wallet" })
      .click();
    await expectText("Confirmed on Ethereum.");
    await expect.poll(() => state.sends.length).toBe(1);
    assert.equal(state.sends[0].decoded.functionName, "transfer");
    await page.getByLabel("Action", { exact: true }).selectOption("approve");
    await page.getByLabel("Spender address").fill(recipient);
    await page.getByLabel("Amount (HX)", { exact: false }).fill("0");
    await page.getByRole("button", { name: "Read current allowance" }).click();
    await expectText("Current allowance: 0 HX");
    await page.getByRole("button", { name: "Review token action" }).click();
    await expectText("revokes token spending permission");
    await page
      .getByRole("button", { name: "Confirm approval in wallet" })
      .click();
    await expectText("Confirmed on Ethereum.");
    await expect.poll(() => state.sends.length).toBe(2);
    assert.equal(state.sends.at(-1).decoded.args[1], 0n);
    state.erc20 = 10n * unit;
    await page
      .getByLabel("Action", { exact: true })
      .selectOption("transferFrom");
    await page.getByLabel("Token owner address").fill(account);
    await page.getByLabel("Recipient address", { exact: true }).fill(recipient);
    await page.getByLabel("Amount (HX)", { exact: false }).fill("1");
    await page.getByRole("button", { name: "Review token action" }).click();
    await page
      .getByRole("button", { name: "Confirm transfer in wallet" })
      .click();
    await expectText("Confirmed on Ethereum.");
    await expect.poll(() => state.sends.length).toBe(3);
    assert.equal(state.sends.at(-1).decoded.functionName, "transferFrom");
  });
  await test("Missing code and unavailable pool fail closed", async () => {
    await start({ code: "0x" });
    await page
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    await expectText("No deployed code");
    assert.equal(
      await page
        .getByRole("button", { name: "Waiting for live verification" })
        .isDisabled(),
      true,
    );
    await start({ sqrtPrice: 0n });
    await page
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    await page.getByRole("button", { name: "Pool unavailable" }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Pool unavailable" }).isDisabled(),
      true,
    );
  });
  await test("Zero active liquidity at an initialized boundary still allows quotes", async () => {
    await start({ liquidity: 0n });
    await connect();
    await quote();
    await page.getByRole("button", { name: "Confirm swap" }).waitFor();
    assert.equal(state.sends.length, 0);
  });
  await test("Tampered ABI and wrong RPC chain disable writes", async () => {
    await start({ corruptAbi: true });
    await expectText("Contract ABI verification failed");
    assert.equal(
      await page
        .getByRole("button", { name: "Connect wallet", exact: true })
        .isDisabled(),
      true,
    );
    await start({ rpcChain: "0xa" });
    await page
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    await expectText("RPC network verification failed");
    assert.equal(
      await page
        .getByRole("button", { name: "Waiting for live verification" })
        .isDisabled(),
      true,
    );
    assert.equal(state.sends.length, 0);
  });
  await test("Reverted receipt is reported as failure", async () => {
    await start({ receiptRevert: true });
    await connect();
    await quote();
    await page.getByRole("button", { name: "Confirm swap" }).click();
    await expectText("Transaction reverted on Ethereum");
    assert.equal(
      await page.getByText("Confirmed on Ethereum.", { exact: false }).count(),
      0,
    );
  });
  await test("Connected quote and expanded tools reflow and accessibility", async () => {
    await start();
    await connect();
    await quote();
    await page
      .locator(".trade-section")
      .screenshot({ path: resolve(out, "swap-review.webp"), type: "webp" });
    await page.getByText("Token tools", { exact: false }).first().click();
    await page.setViewportSize({ width: 320, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    await writeFile(
      resolve(out, "accessibility-connected.json"),
      JSON.stringify(
        {
          violations: scan.violations,
          incomplete: scan.incomplete.map((x) => x.id),
          passes: scan.passes.map((x) => x.id),
        },
        null,
        2,
      ),
    );
    assert.equal(
      scan.violations.length,
      0,
      JSON.stringify(scan.violations.map((x) => x.id)),
    );
  });
  await test("Axe scan and rendered token contrast", async () => {
    await start();
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    await writeFile(
      resolve(out, "accessibility.json"),
      JSON.stringify(
        {
          violations: scan.violations,
          incomplete: scan.incomplete.map((x) => ({
            id: x.id,
            description: x.description,
          })),
          passes: scan.passes.map((x) => x.id),
        },
        null,
        2,
      ),
    );
    assert.equal(
      scan.violations.length,
      0,
      JSON.stringify(
        scan.violations.map((x) => ({
          id: x.id,
          nodes: x.nodes.map((n) => n.target),
        })),
      ),
    );
    const colors = await page.evaluate(() =>
      ["body", ".intro", ".primary", ".badge", ".amount-box>label"].map(
        (selector) => {
          const el = document.querySelector(selector);
          const c = getComputedStyle(el);
          let parent = el;
          let bg = c.backgroundColor;
          while (bg === "rgba(0, 0, 0, 0)" && parent.parentElement) {
            parent = parent.parentElement;
            bg = getComputedStyle(parent).backgroundColor;
          }
          return { selector, foreground: c.color, background: bg };
        },
      ),
    );
    const luminance = (color) => {
      const v = color
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number)
        .map((x) => {
          x /= 255;
          return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
        });
      return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    };
    const contrast = colors.map((c) => {
      const a = luminance(c.foreground),
        b = luminance(c.background);
      return { ...c, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
    });
    assert.ok(contrast.every((c) => c.ratio >= 4.5));
    await writeFile(
      resolve(out, "contrast.json"),
      JSON.stringify(contrast, null, 2),
    );
  });
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(resourceErrors, []);
  await writeFile(
    resolve(out, "interactions.json"),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        mode: "Production export, mocked wallet and RPC; no broadcast",
        results,
        consoleErrors,
        resourceErrors,
      },
      null,
      2,
    ),
  );
} catch (e) {
  await page?.screenshot({
    path: resolve(root, "test/scratch/failure.png"),
    fullPage: true,
  });
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
