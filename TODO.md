# todo / notes

scratch file, mostly for me. tracking what's done and what's left.

## done

- [x] switched the staking asset from QUSDC to native QIE. staking QUSDC made no
      sense on QIE, there's nothing to earn with it. native QIE -> wrap to WQIE ->
      LP on QIEDex. had to redo the whole vault for this.
- [x] yield was getting milked. v1 vault used a shared pool + an apy rate, so a
      big late staker could stake right before a harvest and skim it. moved to a
      masterchef accumulator (accYieldPerShare). only earn what's distributed
      after you join now.
- [x] unstake kept reverting when it had to pull from the LP
      (INSUFFICIENT_LIQUIDITY_BURNED). the pair half loses the 0.3% swap fee on
      the way back so you recover slightly less than requested. made withdraw pay
      what it actually got instead of reverting.
- [x] price oracle: pull ETH/USD from coingecko, binance as a backup feed. only
      push on chain when it drifts >0.5% or goes stale past an hour. never push a
      guessed price if both feeds are down.
- [x] reputation: QIEPass KYC (+200) gate + reclaim zk credit-bureau proofs.
      masterchef-style supplier yield on the lending side too.
- [x] credit-bureau score wasn't applying (+0). reclaim returned the score under
      a key i wasn't checking, so delta came out 0. made the parser fall back to
      any score-looking field + added a re-sync path for already-committed proofs.
- [x] navbar hydration mismatch (wagmi reconnects only on the client). gated the
      wallet UI behind a mounted flag.

## todo

- [ ] borrow/repay still not tested end to end on mainnet, couldn't get test WETH
      in time. logic + guards are in, just no live smoke test.
- [ ] keeper runs as a github action cron right now (price sync every 10 min).
      fine for the demo, but move it to pm2 on a small box / railway for real
      24/7. price-keeper is the one that actually matters.
- [ ] harvest only realises actual LP fees, which is basically nothing at low
      volume. ok for now, maybe top up base apy during launch.
- [ ] move admin role to a multisig before any real money. single EOA right now.
- [ ] telecom reclaim provider not wired yet, it's "coming soon" in the UI.
- [ ] anti-whale caps (50k / 75k QIE) are guesses, recalibrate once we know real
      QIE price and TVL.
- [ ] clean up the test score i set on the deployer wallet while debugging.

## maybe later

- protocol-owned liquidity so unstakes never have to touch the swap fee
- QIE validator staking as a second yield source (phase 2)
- pull credit-bureau coverage beyond IN/US/CA/UK
