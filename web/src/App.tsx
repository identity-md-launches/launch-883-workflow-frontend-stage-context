import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  getAddress,
  zeroAddress,
  formatUnits,
  type Address,
  type Hex,
} from "viem";
import { loadDeployment, protocol, type Runtime } from "./config";
import {
  address,
  amount,
  checkWallet,
  display,
  errorText,
  getAllowances,
  poolId,
  readLive,
  short,
  swapInput,
  switchChain,
  transact,
  verifyCode,
  type Call,
  type Live,
  type Provider,
} from "./chain";

type Wallet = { provider: Provider; account: Address; chainId: number };
type Tx = { action: string; phase: string; hash?: Hex; error?: string };
type Run = (action: string, call: Call) => Promise<boolean>;
const repository =
  "https://github.com/identity-md-launches/launch-881-hsxwesxkaamsb0token";
function External({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
      <span aria-hidden="true"> ↗</span>
    </a>
  );
}
function AddressRow({
  label,
  value,
  r,
}: {
  label: string;
  value: string;
  r: Runtime;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  return (
    <div className="address-row">
      <span>{label}</span>
      <div>
        <External href={`${r.config.network.explorer}/address/${value}`}>
          <code>{getAddress(value)}</code>
        </External>
        <button
          className="mini"
          aria-label={`Copy ${label} address`}
          onClick={() =>
            navigator.clipboard
              .writeText(getAddress(value))
              .then(() => {
                setCopied(true);
                setCopyError("");
              })
              .catch(() => setCopyError("Select the address to copy it."))
          }
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {copyError && <small role="status">{copyError}</small>}
    </div>
  );
}
function Motion() {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  // Motion starts paused for everyone; reduced-motion visitors never receive autoplay.
  return (
    <figure className="motion">
      <video
        ref={ref}
        src="./media/identity.mp4"
        poster="./media/identity-poster.jpg"
        muted
        loop
        playsInline
        preload="none"
        aria-label="Generated HX motion identity"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => setFailed(true)}
      />
      <figcaption>
        <span>01 / Generated identity</span>
        <button
          className="media-button"
          onClick={() => {
            if (playing) ref.current?.pause();
            else ref.current?.play().catch(() => setFailed(true));
          }}
        >
          {playing ? "Pause motion Ⅱ" : "Play motion ▷"}
        </button>
      </figcaption>
      {failed && (
        <p role="alert">Motion could not play. The identity still is shown.</p>
      )}
    </figure>
  );
}
export function App() {
  const [r, setRuntime] = useState<Runtime>();
  const [configError, setConfigError] = useState("");
  const [live, setLive] = useState<Live>();
  const [readError, setReadError] = useState("");
  const [verified, setVerified] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [wallet, setWallet] = useState<Wallet>();
  const walletRef = useRef(wallet);
  walletRef.current = wallet;
  const [walletError, setWalletError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [tx, setTx] = useState<Tx>();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [providers, setProviders] = useState<
    { name: string; provider: Provider }[]
  >([]);
  const [providerIndex, setProviderIndex] = useState(0);
  const refreshId = useRef(0);
  const codeChecked = useRef(false);
  useEffect(() => {
    let active = true;
    loadDeployment()
      .then((v) => {
        if (active) setRuntime(v);
      })
      .catch((e) => {
        if (active) setConfigError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    function discover(event: Event) {
      const d = (
        event as CustomEvent<{ info: { name: string }; provider: Provider }>
      ).detail;
      if (d?.provider)
        setProviders((p) =>
          p.some((x) => x.provider === d.provider)
            ? p
            : [...p, { name: d.info.name, provider: d.provider }],
        );
    }
    window.addEventListener("eip6963:announceProvider", discover);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    if (window.ethereum)
      setProviders((p) =>
        p.some((x) => x.provider === window.ethereum)
          ? p
          : [...p, { name: "Browser wallet", provider: window.ethereum! }],
      );
    return () =>
      window.removeEventListener("eip6963:announceProvider", discover);
  }, []);
  const refresh = useCallback(async () => {
    if (!r) return;
    const id = ++refreshId.current;
    setRefreshing(true);
    try {
      if (!codeChecked.current) {
        await verifyCode(r);
        codeChecked.current = true;
      }
      const state = await readLive(
        r,
        wallet?.chainId === r.config.chainId ? wallet.account : undefined,
      );
      if (id !== refreshId.current) return;
      setLive(state);
      setVerified(true);
      setReadError("");
    } catch (e) {
      if (id === refreshId.current) {
        codeChecked.current = false;
        setReadError(errorText(e));
        setVerified(false);
        setLive(undefined);
      }
    } finally {
      if (id === refreshId.current) setRefreshing(false);
    }
  }, [r, wallet?.account, wallet?.chainId]);
  useEffect(() => {
    setVerified(false);
    setLive(undefined);
    void refresh();
    const interval = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 15000);
    return () => {
      clearInterval(interval);
      refreshId.current++;
    };
  }, [refresh]);
  useEffect(() => {
    const p = wallet?.provider;
    if (!p) return;
    const changed = () => {
      walletRef.current = undefined;
      setWallet(undefined);
      setWalletError(
        "Wallet changed. Reconnect to load the current account and network.",
      );
      refreshId.current++;
      setLive(undefined);
      setVerified(false);
    };
    p.on?.("accountsChanged", changed);
    p.on?.("chainChanged", changed);
    p.on?.("disconnect", changed);
    return () => {
      p.removeListener?.("accountsChanged", changed);
      p.removeListener?.("chainChanged", changed);
      p.removeListener?.("disconnect", changed);
    };
  }, [wallet?.provider]);
  async function connect() {
    if (connecting || !r) return;
    const p = providers[providerIndex]?.provider ?? window.ethereum;
    if (!p) {
      setWalletError(
        "No browser wallet found. Install a browser wallet or open this page in your wallet’s browser, then reload.",
      );
      return;
    }
    setConnecting(true);
    setWalletError("");
    try {
      const accounts = await p.request({ method: "eth_requestAccounts" });
      const chainId = Number(await p.request({ method: "eth_chainId" }));
      if (!accounts.length)
        throw new Error(
          "No account was shared. Choose an account in your wallet and try again.",
        );
      setWallet({ provider: p, account: getAddress(accounts[0]), chainId });
    } catch (e) {
      setWalletError(errorText(e));
    } finally {
      setConnecting(false);
    }
  }
  async function switchNetwork() {
    if (!wallet || !r || connecting) return;
    setConnecting(true);
    setWalletError("");
    try {
      await switchChain(r, wallet.provider);
      const accounts = await wallet.provider.request({
        method: "eth_accounts",
      });
      const chainId = Number(
        await wallet.provider.request({ method: "eth_chainId" }),
      );
      if (!accounts[0]) throw new Error("Reconnect your wallet to continue.");
      setWallet({ ...wallet, account: getAddress(accounts[0]), chainId });
    } catch (e) {
      setWalletError(errorText(e));
    } finally {
      setConnecting(false);
    }
  }
  const ready = !!(
    wallet &&
    r &&
    wallet.chainId === r.config.chainId &&
    verified &&
    live &&
    Date.now() - live.updated < 60000
  );
  const run: Run = async (action, call) => {
    if (!ready || !wallet || !r || lock.current || walletRef.current !== wallet)
      return false;
    lock.current = true;
    setBusy(true);
    setTx({ action, phase: "Simulating, then waiting for your wallet…" });
    let hash: Hex | undefined;
    try {
      await transact(r, wallet.provider, wallet.account, call, (h) => {
        hash = h;
        setTx({
          action,
          phase: "Submitted. Waiting for Ethereum confirmation…",
          hash: h,
        });
      });
      setTx({ action, phase: "Confirmed on Ethereum.", hash });
      await refresh();
      return true;
    } catch (e) {
      setTx({
        action,
        phase: hash
          ? "Confirmation needs attention. Check the transaction before retrying."
          : "Action did not complete.",
        hash,
        error: errorText(e),
      });
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <a className="brand" href="#main" aria-label="HX home">
          <img src="./mark.svg" alt="" width="36" height="36" />{" "}
          <span>
            HX<span className="brand-sub"> An agent company</span>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#about">About</a>
          <a href="#trade">Trade</a>
          <a href="#deployment">Onchain</a>
        </nav>
        <div className="wallet-nav">
          {wallet ? (
            <>
              <span className="account" title={wallet.account}>
                {short(wallet.account)}
              </span>
              <button
                className="quiet"
                disabled={busy}
                onClick={() => {
                  walletRef.current = undefined;
                  setWallet(undefined);
                  setWalletError("");
                }}
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              className="quiet"
              onClick={connect}
              disabled={!r || connecting}
            >
              {connecting ? "Connecting…" : "Connect wallet"}
            </button>
          )}
        </div>
      </header>
      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="status-dot" /> Ethereum / Agent 001
            </div>
            <h1 id="hero-title">
              An identity
              <br />
              in <em>motion.</em>
            </h1>
            <p className="intro">
              Meet HS XWesXkAAMSB0.
              <br />
              An AI agent company with a public identity
              <br className="desktop-break" /> and a token on Ethereum.
            </p>
            <a className="primary link-button" href="#trade">
              Explore HX <span aria-hidden="true">↗</span>
            </a>
            <div className="hero-foot">
              <span>Fixed supply.</span>
              <span>Open source.</span>
              <span>Onchain.</span>
            </div>
          </div>
          <Motion />
        </section>
        <section className="stats" aria-label="Token overview">
          <div>
            <span>Token</span>
            <strong>
              HX <small>/ ERC-20</small>
            </strong>
          </div>
          <div>
            <span>Fixed total supply</span>
            <strong>
              {live ? display(live.supply, live.decimals) : "1,000,000,000"}{" "}
              <small>HX</small>
            </strong>
          </div>
          <div>
            <span>Pool pairing</span>
            <strong>
              ETH <span className="muted">/</span> HX
            </strong>
          </div>
          <div>
            <span>Launch pool allocation</span>
            <strong>
              88<small>% of supply</small>
            </strong>
            <small>Approved launch allocation</small>
          </div>
        </section>
        <section id="about" className="about section-grid">
          <div>
            <p className="eyebrow">The company</p>
            <h2>
              A public identity.
              <br />A shared starting point.
            </h2>
          </div>
          <div className="about-copy">
            <p>
              HS XWesXkAAMSB0 is an AI agent company built around a consistent
              generated motion identity, a public token, and a website connected
              to its Ethereum deployment.
            </p>
            <p className="muted">
              HX has a fixed supply of one billion tokens. The deployed token
              has no owner powers, later minting, pause, upgrade, or transfer
              tax.
            </p>
            <External href={repository}>Explore the source on GitHub</External>
          </div>
        </section>
        <section id="trade" className="trade-section section-grid">
          <div className="trade-intro">
            <p className="eyebrow">The token</p>
            <h2>Meet the market.</h2>
            <p>
              Swap ETH and HX through the
              <br />
              attested Uniswap v4 pool.
            </p>
            <div className="network-note">
              <span className="status-dot" />
              <span>
                Ethereum mainnet
                <br />
                <small>Real assets · Network fees apply</small>
              </span>
            </div>
            <div className="live-status">
              <span className="eyebrow">Deployment status</span>
              <p>
                {configError
                  ? "Configuration unavailable"
                  : !r
                    ? "Loading deployment…"
                    : readError
                      ? "Live verification unavailable"
                      : !live
                        ? "Checking Ethereum…"
                        : live.sqrtPrice > 0n
                          ? live.liquidity > 0n
                            ? "Pool initialized · Active liquidity"
                            : "Pool initialized · At liquidity boundary"
                          : "Pool not initialized"}
              </p>
              <small>
                {live
                  ? `Read at block ${live.block.toLocaleString()}. Updates every 15 seconds.`
                  : "The deployment handoff is supplied. Live pool status is checked separately."}
              </small>
              {r && (
                <button
                  className="text-button"
                  onClick={refresh}
                  disabled={refreshing || busy}
                >
                  {refreshing ? "Refreshing…" : "Refresh onchain state"}
                </button>
              )}
              {readError && (
                <p className="error" role="alert">
                  {readError}
                </p>
              )}
              {configError && (
                <p className="error" role="alert">
                  {configError}
                </p>
              )}
            </div>
          </div>
          <div className="trade-card">
            <div className="card-title">
              <h3>Swap</h3>
              <span className="badge">Uniswap v4</span>
            </div>
            {wallet && r && wallet.chainId !== r.config.chainId && (
              <p className="notice">
                Wrong network. Switch to {r.config.network.name} to continue.
              </p>
            )}
            {wallet && r && (
              <div className="connected">
                <AddressRow
                  label="Connected wallet"
                  value={wallet.account}
                  r={r}
                />
              </div>
            )}
            {!wallet && providers.length > 1 && (
              <label className="wallet-select">
                Wallet
                <select
                  value={providerIndex}
                  onChange={(e) => setProviderIndex(Number(e.target.value))}
                >
                  {providers.map((p, i) => (
                    <option key={i} value={i}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {r && (
              <Swap
                key={`${wallet?.account ?? ""}:${wallet?.chainId ?? ""}`}
                r={r}
                live={live}
                wallet={wallet}
                ready={ready}
                busy={busy}
                run={run}
                connect={connect}
                switchNetwork={switchNetwork}
                connecting={connecting}
              />
            )}
            {!r && (
              <p>
                {configError ||
                  "Loading the verified deployment configuration…"}
              </p>
            )}
            {walletError && (
              <p className="error" role="alert">
                {walletError}
              </p>
            )}
            <p className="fine-print">
              USD pricing is unavailable. Amounts are shown in ETH and HX.
              Quotes include pool fees; network fees are additional.
            </p>
          </div>
        </section>
        {tx && r && (
          <section className="transaction" aria-label="Transaction status">
            <p role="status">
              <strong>{tx.action}</strong> · {tx.phase}
            </p>
            {tx.error && (
              <p role="alert" className="error">
                {tx.error}
              </p>
            )}
            {tx.hash && (
              <External href={`${r.config.network.explorer}/tx/${tx.hash}`}>
                View transaction {short(tx.hash)}
              </External>
            )}
          </section>
        )}
        {r && (
          <TokenTools
            key={wallet?.account ?? "none"}
            r={r}
            live={live}
            wallet={wallet}
            ready={ready}
            busy={busy}
            run={run}
          />
        )}
        <section id="deployment" className="deployment">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Built in the open</p>
              <h2>Follow the contracts.</h2>
            </div>
            <span className="badge">
              {verified
                ? "RPC chain & code verified"
                : "Awaiting live verification"}
            </span>
          </div>
          <p className="muted">
            Addresses are bound to the supplied deployment handoff. Live checks
            confirm the RPC chain and nonempty code, not a bytecode audit. A v4
            pool is identified by its key inside PoolManager; it has no
            standalone contract address.
          </p>
          {r && (
            <>
              <AddressRow label="HX token" value={r.token.address} r={r} />
              <AddressRow
                label="PoolManager"
                value={r.config.network.uniswapV4.poolManager}
                r={r}
              />
              <AddressRow
                label="Initialization hook"
                value={r.config.poolKey.hooks}
                r={r}
              />
              <details>
                <summary>Pool key, routing contracts & provenance</summary>
                <div className="detail-body">
                  <p>
                    Pool ID <code className="wrap">{poolId(r)}</code>
                  </p>
                  <p>
                    Fee: {r.config.poolKey.fee / 10000}% · Tick spacing:{" "}
                    {r.config.poolKey.tickSpacing}
                    {live &&
                      ` · Live LP fee: ${live.lpFee / 10000}% · Protocol fee (packed): ${live.protocolFee}`}
                  </p>
                  <p>
                    Currency 0: <code>{r.config.poolKey.currency0}</code>
                    <br />
                    Currency 1: <code>{r.config.poolKey.currency1}</code>
                  </p>
                  {Object.entries(r.config.network.uniswapV4)
                    .filter(([, value]) => typeof value === "string")
                    .map(([name, value]) => (
                      <AddressRow
                        key={name}
                        label={name}
                        value={value as string}
                        r={r}
                      />
                    ))}
                  <p>
                    Source commit:{" "}
                    <External
                      href={`${repository}/tree/${r.config.sourceCommit}`}
                    >
                      <code>{r.config.sourceCommit}</code>
                    </External>
                  </p>
                  <p>
                    Attestation:{" "}
                    <code className="wrap">{r.config.attestationHash}</code>
                  </p>
                  <p>
                    Launch: <code>{r.config.launchId}</code>
                  </p>
                  <p>
                    Token ABI Keccak:{" "}
                    <code className="wrap">{r.token.abiHash}</code>
                  </p>
                  <p>
                    <a href="./imd-deployment.json">View deployment manifest</a>{" "}
                    ·{" "}
                    <a href={"./" + r.token.abiPath}>View implementation ABI</a>
                  </p>
                </div>
              </details>
            </>
          )}
        </section>
      </main>
      <footer>
        <a className="brand" href="#main">
          HX <span className="brand-sub">An identity in motion.</span>
        </a>
        <span>Ethereum mainnet · Open source</span>
        <External href={repository}>GitHub</External>
      </footer>
    </>
  );
}

type SwapProps = {
  r: Runtime;
  live?: Live;
  wallet?: Wallet;
  ready: boolean;
  busy: boolean;
  run: Run;
  connect: () => void;
  switchNetwork: () => void;
  connecting: boolean;
};
function Swap({
  r,
  live,
  wallet,
  ready,
  busy,
  run,
  connect,
  switchNetwork,
  connecting,
}: SwapProps) {
  const [buy, setBuy] = useState(true);
  const [value, setValue] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [quote, setQuote] = useState<{
    input: bigint;
    output: bigint;
    minimum: bigint;
    time: number;
    allowances: Awaited<ReturnType<typeof getAllowances>>;
  }>();
  const [quoting, setQuoting] = useState(false);
  const [acting, setActing] = useState(false);
  const actionLock = useRef(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const request = useRef(0);
  const valueRef = useRef<HTMLInputElement>(null);
  const slipRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(i);
      request.current++;
    };
  }, []);
  const invalidate = () => {
    request.current++;
    setQuote(undefined);
    setError("");
    setQuoting(false);
  };
  const symbol = buy ? "ETH" : "HX";
  const output = buy ? "HX" : "ETH";
  const fresh = !!quote && now - quote.time < 30000;
  const balance = buy ? live?.ethBalance : live?.tokenBalance;
  const poolReady = !!live && live.sqrtPrice > 0n;
  const stage =
    !quote || !fresh
      ? "quote"
      : !buy && quote.allowances.erc20 < quote.input
        ? "token"
        : !buy &&
            (quote.allowances.permit < quote.input ||
              quote.allowances.expiration < Math.floor(now / 1000) + 300)
          ? "permit"
          : "swap";
  async function getQuote() {
    const id = ++request.current;
    setQuoting(true);
    setError("");
    setQuote(undefined);
    try {
      if (!wallet || !ready || !poolReady || !live)
        throw new Error(
          "Connect on Ethereum and wait for live verification before quoting.",
        );
      let input: bigint;
      try {
        input = amount(value, buy ? 18 : live.decimals);
      } catch (e) {
        valueRef.current?.focus();
        throw e;
      }
      if (
        balance === undefined ||
        input > balance ||
        (buy && input === balance)
      ) {
        valueRef.current?.focus();
        throw new Error(
          `Insufficient ${symbol} balance. Leave ETH available for the network fee.`,
        );
      }
      const bps = Math.round(Number(slippage) * 100);
      if (
        !/^\d+(\.\d{1,2})?$/.test(slippage) ||
        !Number.isInteger(bps) ||
        bps < 10 ||
        bps > 500
      ) {
        slipRef.current?.focus();
        throw new Error(
          "Set slippage between 0.1% and 5%, with at most two decimal places.",
        );
      }
      await checkWallet(r, wallet.provider, wallet.account);
      const zeroForOne =
        r.config.poolKey.currency0.toLowerCase() ===
        (buy ? zeroAddress : r.token.address).toLowerCase();
      const result = await r.client.simulateContract({
        address: r.config.network.uniswapV4.quoter,
        abi: protocol.quoter,
        functionName: "quoteExactInputSingle",
        args: [
          {
            poolKey: r.config.poolKey,
            zeroForOne,
            exactAmount: input,
            hookData: "0x",
          },
        ],
        account: wallet.account,
      });
      const output = result.result[0];
      const minimum = (output * BigInt(10000 - bps)) / 10000n;
      if (minimum <= 0n || minimum > (1n << 128n) - 1n)
        throw new Error(
          "No usable quote for this amount. Try a different amount.",
        );
      const allowances = buy
        ? { erc20: 0n, permit: 0n, expiration: 0 }
        : await getAllowances(r, wallet.account);
      if (id === request.current) {
        setNow(Date.now());
        setQuote({ input, output, minimum, time: Date.now(), allowances });
      }
    } catch (e) {
      if (id === request.current) setError(errorText(e));
    } finally {
      if (id === request.current) setQuoting(false);
    }
  }
  async function act(e: FormEvent) {
    e.preventDefault();
    if (!wallet) return connect();
    if (wallet.chainId !== r.config.chainId) return switchNetwork();
    if (!ready || busy || quoting || !poolReady || actionLock.current) return;
    if (stage === "quote" || !quote) return getQuote();
    setError("");
    setActing(true);
    actionLock.current = true;
    try {
      // Recheck allowances immediately before progressing; no local-only approval assumptions.
      const a = buy ? quote.allowances : await getAllowances(r, wallet.account);
      const { permit2, universalRouter } = r.config.network.uniswapV4;
      if (!buy && a.erc20 < quote.input) {
        const ok = await run("Approve HX to Permit2", {
          address: r.token.address,
          abi: r.abis[r.token.name],
          functionName: "approve",
          args: [permit2, quote.input],
        });
        if (ok) await getQuote();
        return;
      }
      if (
        !buy &&
        (a.permit < quote.input ||
          a.expiration < Math.floor(Date.now() / 1000) + 300)
      ) {
        const ok = await run("Approve HX for the router", {
          address: permit2,
          abi: protocol.permit,
          functionName: "approve",
          args: [
            r.token.address,
            universalRouter,
            quote.input,
            Math.floor(Date.now() / 1000) + 1800,
          ],
        });
        if (ok) await getQuote();
        return;
      }
      if (Date.now() - quote.time >= 30000) {
        setQuote(undefined);
        throw new Error("Quote expired. Get a fresh quote before swapping.");
      }
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
      const ok = await run(`Swap ${value} ${symbol} for ${output}`, {
        address: universalRouter,
        abi: protocol.router,
        functionName: "execute",
        args: [
          "0x10",
          [swapInput(r, buy, quote.input, quote.minimum)],
          deadline,
        ],
        value: buy ? quote.input : 0n,
      });
      if (ok) {
        setQuote(undefined);
        setValue("");
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setActing(false);
      actionLock.current = false;
    }
  }
  const label = !wallet
    ? "Connect wallet to swap"
    : wallet.chainId !== r.config.chainId
      ? "Switch to Ethereum"
      : !ready
        ? "Waiting for live verification"
        : !poolReady
          ? "Pool unavailable"
          : quoting
            ? "Getting quote…"
            : busy
              ? "Transaction in progress…"
              : acting
                ? "Preparing transaction…"
                : stage === "token"
                  ? "1. Approve HX to Permit2"
                  : stage === "permit"
                    ? "2. Approve HX for router"
                    : stage === "swap"
                      ? `Confirm swap · ${symbol} → ${output}`
                      : "Get quote";
  return (
    <form onSubmit={act}>
      <div className="direction" role="group" aria-label="Swap direction">
        <button
          type="button"
          aria-pressed={buy}
          disabled={busy || acting}
          onClick={() => {
            invalidate();
            setBuy(true);
            setValue("");
          }}
        >
          Buy HX
        </button>
        <button
          type="button"
          aria-pressed={!buy}
          disabled={busy || acting}
          onClick={() => {
            invalidate();
            setBuy(false);
            setValue("");
          }}
        >
          Sell HX
        </button>
      </div>
      <div className="amount-box">
        <label htmlFor="swap-amount">You pay</label>
        <div className="amount-line">
          <input
            id="swap-amount"
            ref={valueRef}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={value}
            disabled={busy || acting}
            aria-describedby="swap-error swap-balance"
            aria-invalid={!!error}
            onChange={(e) => {
              invalidate();
              setValue(e.target.value);
            }}
          />
          <span className="token">
            <span className="coin" aria-hidden="true">
              {buy ? "Ξ" : "H"}
            </span>
            {symbol}
          </span>
        </div>
        <small id="swap-balance">
          Balance:{" "}
          {balance === undefined
            ? "Connect wallet"
            : `${display(balance, buy ? 18 : live?.decimals)} ${symbol}`}
        </small>
      </div>
      <div className="swap-arrow" aria-hidden="true">
        ↓
      </div>
      <div className="amount-box receive">
        <span>
          You receive <small>(estimated)</small>
        </span>
        <div className="amount-line">
          <output>
            {quote && fresh
              ? display(quote.output, buy ? live?.decimals : 18)
              : "—"}
          </output>
          <span className="token">
            <span className="coin" aria-hidden="true">
              {buy ? "H" : "Ξ"}
            </span>
            {output}
          </span>
        </div>
      </div>
      <div className="slippage">
        <label htmlFor="slippage">Slippage tolerance</label>
        <div>
          <input
            id="slippage"
            ref={slipRef}
            inputMode="decimal"
            value={slippage}
            disabled={busy || acting}
            aria-describedby="swap-error"
            onChange={(e) => {
              invalidate();
              setSlippage(e.target.value);
            }}
          />
          <span>%</span>
        </div>
      </div>
      {quote && fresh && (
        <div className="quote-detail" role="status">
          <div>
            <span>Minimum received</span>
            <strong>
              {formatUnits(quote.minimum, buy ? live!.decimals : 18)} {output}
            </strong>
          </div>
          <div>
            <span>Rate</span>
            <span>
              1 {symbol} ≈{" "}
              {(
                Number(formatUnits(quote.output, buy ? live!.decimals : 18)) /
                Number(value)
              ).toLocaleString("en-US", { maximumSignificantDigits: 6 })}{" "}
              {output}
            </span>
          </div>
          <div>
            <span>Quote expires in</span>
            <span>
              {Math.max(0, Math.ceil((30000 - now + quote.time) / 1000))}{" "}
              seconds
            </span>
          </div>
          <p>
            {stage === "token"
              ? `Allow Permit2 to spend exactly ${value} HX. This is a separate transaction.`
              : stage === "permit"
                ? `Allow the router to spend exactly ${value} HX through Permit2 for 30 minutes.`
                : `Swap ${value} ${symbol}. Minimum output is protected; the transaction expires after 5 minutes.`}
          </p>
        </div>
      )}
      {quote && !fresh && (
        <p className="notice">Quote expired. Get a fresh quote to continue.</p>
      )}
      <p id="swap-error" className="error" role="alert">
        {error}
      </p>
      <button
        className="primary full"
        disabled={
          connecting ||
          busy ||
          quoting ||
          acting ||
          (!!wallet &&
            wallet.chainId === r.config.chainId &&
            (!ready || !poolReady))
        }
      >
        {connecting ? "Waiting for wallet…" : label}
        <span aria-hidden="true">↗</span>
      </button>
      {live?.sqrtPrice && live.liquidity === 0n ? (
        <p className="fine-print">
          The pool is at a liquidity boundary. Available trades depend on
          direction; request a quote to check.
        </p>
      ) : null}
      <p className="route-note">
        ETH / HX · {r.config.poolKey.fee / 10000}% pool fee
      </p>
    </form>
  );
}

function TokenTools({
  r,
  live,
  wallet,
  ready,
  busy,
  run,
}: Pick<SwapProps, "r" | "live" | "wallet" | "ready" | "busy" | "run">) {
  const [mode, setMode] = useState("transfer");
  const [to, setTo] = useState("");
  const [from, setFrom] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [review, setReview] = useState<{ call: Call; text: string }>();
  const [allowance, setAllowance] = useState<string>();
  const [reading, setReading] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const revision = useRef(0);
  function reset() {
    revision.current++;
    setReview(undefined);
    setError("");
    setAllowance(undefined);
  }
  async function inspectAllowance() {
    if (!wallet || !ready) return;
    setReading(true);
    setError("");
    const id = revision.current;
    try {
      const owner = mode === "transferFrom" ? address(from) : wallet.account;
      const spender = mode === "transferFrom" ? wallet.account : address(to);
      const result = (await r.client.readContract({
        address: r.token.address,
        abi: r.abis[r.token.name],
        functionName: "allowance",
        args: [owner, spender],
      })) as bigint;
      if (id === revision.current)
        setAllowance(`${formatUnits(result, live!.decimals)} HX`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setReading(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready || busy || !wallet || !live) return;
    const currentRevision = revision.current;
    setError("");
    try {
      if (review) {
        if (
          await run(
            mode === "approve" ? "Update token approval" : "Transfer HX",
            review.call,
          )
        ) {
          reset();
          setValue("");
        }
        return;
      }
      let target: Address;
      try {
        target = address(to);
      } catch (e) {
        form.current?.querySelector<HTMLInputElement>("#token-to")?.focus();
        throw e;
      }
      let input: bigint;
      try {
        input = amount(value, live.decimals, mode === "approve");
      } catch (e) {
        form.current?.querySelector<HTMLInputElement>("#token-value")?.focus();
        throw e;
      }
      let args: readonly unknown[] = [target, input];
      if (mode === "transfer" && input > (live.tokenBalance ?? 0n))
        throw new Error("Insufficient HX balance. Reduce the amount.");
      if (mode === "transferFrom") {
        let owner: Address;
        try {
          owner = address(from);
        } catch (e) {
          form.current?.querySelector<HTMLInputElement>("#token-from")?.focus();
          throw e;
        }
        args = [owner, target, input];
        const [allowed, balance] = await Promise.all(
          ["allowance", "balanceOf"].map(
            (fn) =>
              r.client.readContract({
                address: r.token.address,
                abi: r.abis[r.token.name],
                functionName: fn,
                args: fn === "allowance" ? [owner, wallet.account] : [owner],
              }) as Promise<bigint>,
          ),
        );
        if (allowed < input || balance < input)
          throw new Error(
            "The source balance or your allowance is too low. Check with the token owner.",
          );
      }
      if (currentRevision !== revision.current) return;
      const text =
        mode === "approve"
          ? `Set the spending allowance for ${target} to ${value} HX. ${input === 0n ? "This revokes token spending permission." : "This address will be able to spend your HX up to this amount."}`
          : `Transfer ${value} HX ${mode === "transferFrom" ? "from " + from + " " : ""}to ${target}. Transfers cannot be undone.`;
      setReview({
        call: {
          address: r.token.address,
          abi: r.abis[r.token.name],
          functionName: mode,
          args,
        },
        text,
      });
    } catch (e) {
      setError(errorText(e));
    }
  }
  return (
    <section className="tools">
      <details>
        <summary>
          Token tools{" "}
          <span>Transfer HX, manage approvals, or transfer with allowance</span>
        </summary>
        <div className="tools-inner">
          <h2>Manage HX</h2>
          <p>
            Balance:{" "}
            {live?.tokenBalance !== undefined
              ? `${formatUnits(live.tokenBalance, live.decimals)} HX`
              : "Connect a wallet on Ethereum to load your balance."}
          </p>
          <form ref={form} onSubmit={submit}>
            <fieldset disabled={busy}>
              <label htmlFor="token-action">Action</label>
              <select
                id="token-action"
                value={mode}
                onChange={(e) => {
                  reset();
                  setMode(e.target.value);
                }}
              >
                <option value="transfer">Transfer HX</option>
                <option value="approve">Set or revoke approval</option>
                <option value="transferFrom">Transfer with allowance</option>
              </select>
              {mode === "transferFrom" && (
                <>
                  <label htmlFor="token-from">Token owner address</label>
                  <input
                    id="token-from"
                    value={from}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="0x…"
                    onChange={(e) => {
                      reset();
                      setFrom(e.target.value);
                    }}
                    aria-describedby="token-error"
                    aria-invalid={!!error}
                  />
                </>
              )}
              <label htmlFor="token-to">
                {mode === "approve" ? "Spender address" : "Recipient address"}
              </label>
              <input
                id="token-to"
                value={to}
                autoComplete="off"
                spellCheck={false}
                placeholder="0x…"
                onChange={(e) => {
                  reset();
                  setTo(e.target.value);
                }}
                aria-describedby="token-error"
                aria-invalid={!!error}
              />
              <label htmlFor="token-value">
                Amount (HX){mode === "approve" ? " · Use 0 to revoke" : ""}
              </label>
              <input
                id="token-value"
                value={value}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                onChange={(e) => {
                  reset();
                  setValue(e.target.value);
                }}
                aria-describedby="token-error"
                aria-invalid={!!error}
              />
              {mode !== "transfer" && (
                <>
                  <button
                    type="button"
                    className="quiet"
                    disabled={!ready || reading}
                    onClick={inspectAllowance}
                  >
                    {reading ? "Reading allowance…" : "Read current allowance"}
                  </button>
                  <p role="status">
                    {allowance && `Current allowance: ${allowance}`}
                  </p>
                </>
              )}
              {review && (
                <div className="notice">
                  <p>{review.text}</p>
                  <p>
                    Ethereum network fees apply. The action is simulated before
                    your wallet opens.
                  </p>
                  <button type="button" onClick={() => setReview(undefined)}>
                    Cancel review
                  </button>
                </div>
              )}
              <p role="alert" id="token-error" className="error">
                {error}
              </p>
              <button className="quiet" disabled={!ready}>
                {busy
                  ? "Transaction in progress…"
                  : review
                    ? mode === "approve"
                      ? "Confirm approval in wallet"
                      : "Confirm transfer in wallet"
                    : "Review token action"}
              </button>
              {!ready && (
                <p className="muted">
                  Connect a wallet on Ethereum and wait for live verification to
                  use token tools.
                </p>
              )}
            </fieldset>
          </form>
        </div>
      </details>
    </section>
  );
}
