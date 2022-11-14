# Sidechain Oracles

## Background

### Scope

Sidechain Oracles is a mechanism to provide a Uniswap V3 Pool's price history to chains where the pair may not be available, or have a healthy liquidity to rely on.

The set of contracts is designed to update and broadcast the oracle information, every time some cooldown period has passed, or whenever twap has changed significally since last update.

### Contracts

**DataFeed**: source of truth on mainnet, queries the UniV3Pool and stores the result, also permisionless broadcasts data to bridges

**DataFeedStrategy**: defines whit which timestamps and when the history of a pool should be permisionless updated: cooldown period, twap difference<!-- TODO: avoid `!OLD` error -->

**StrategyJob**: adds a layer of rewards for calling the update of the strategy (when possible) or the broadcast transaction (when new information is fetched)

**IBridgeAdapter**: abstract and whitelisted, standarizes the message broadcast and deliver to DataReceiver

**DataReceiver**: receives the message broadcast by DataFeed, proxies it to the SidechainOracle, or triggers the factory to deploy one first

**OracleSidechain**: stores an extension of OracleLibrary and updates it with each data batch, uses a nonce to ensure consistency

**OracleFactory**: deploys a new instance of an oracle on a precomputed address for each `token0 token1 fee` combination

#### Permisionless execution

- When either time has passed since last update, or twap has changed since last observation, DataFeedStrategy allows any signer to trigger a data fetch
- On the strategy, the set of timestamps is defined and passed to the DataFeed
- The DataFeed queries the UniV3Pool at the set of timestamps and stores the keccak of the result
- The DataFeed allows the broadcast of any known datasets (validating the keccak) to other chains (whitelisted by pool & chain ID)

#### Rewarded execution

- When DataFeedStrategy allows a fetch, a keeper can work StrategyJob fetch method to trigger it and get rewarded for the gas spent
- When a new data batch is fetched, a keeper can work StrategyJob broadcast method to push the information to whitelisted chains, and get rewarded for the gas spent

#### Receiving execution

- On the sidechain, when a new data batch is received, the receiver pushes the information to the correspondant oracle
- The oracle updates the observation array looping through the `(twap,timestamp)[]` array
- If a data batch arrives and no oracle exists for that pair, the receiver will trigger the OracleFactory to deploy the oracle, and then write the batch
- If a data batch arrives with a nonce different than the oracle's next one, the transaction will revert

### On-chain Truth Mechanism

By using a UniswapV3Pool as a source of truth, it allows the bridging of its price history to a receiver contract, that replicates the OracleLibrary behaviour. Any contract on the receiving chain can choose to calculate a twap, the same way it would query the pool `observe([t,0])`, by addressing the query to a pre-computable address: the oracle. Contracts can also choose to query `slot0.sqrtPriceX96` or `slot0.tick`, and will get a time weigthed average of the last time period.

The pool is consulted at timestamps defined by the Strategy, and the DataFeed calculates the twap between those timestamps, and allows the bridging of the calculated oracle insertions, backfiling as if big swaps happened in those timestamps moving the tick to the correspondant twap for that period.

The DataFeed also stores in cache the last state of the pool observed, in order to fill in the gaps between sets of timestamps, or to overcome manually (permissioned) whenever the pool would return an `!OLD` error, and keep consistency of information.

### Math Representation

The UniV3Pool price is recorded on a `tickCumulative` variable, that can be represented as the primitive of `tick`, integrated since the first swap of the pool, until the consulted `t`. It is accessed through `observe(uint32[] secondsAgo)`, or accessing each observation by index `observations(uint256 index)`.

The mathematical mechanism aims to create a clone of the `tickCumulative` $C(t)$ curve, by understanding it as the primitive of `twap(t)`, and letting the OracleLibrary integrate the result into the $C'(t)$ of the oracle.

$$C = \int_0^t tick*dt$$

To calculate the time weighted average between any 2 timestamps, one should compare the tickCumulative and divide by the time difference.

$$twap_a^b = {{C(b)-C(a)}\over{t(b)-t(a)}} = {{C_a^b}\over{\Delta t_a^b}}$$

$$C(t) = twap_0^t * \Delta t_0^t$$

$$C_a^b = twap_a^b * \Delta t_a^b$$

In the pool contract, it is updated each time a swap makes the tick change, such that the value of $C(t)$ is always accesible, correct, and updated
$$C_n = C_{n-1} + slot0.tick * (now - t_{n-1})$$

By accepting $C$ as the primitive of $tick(t)$, one can also build another $C'$ function that replicates, at least exactly in a particular set of points, the behaviour of $C$, by using the time weighted averages between that set of points. On the oracle, it is stored in batches, every time data is received.

$${C'}_n = C_{n-1} + twap * (t_n - t_n-1)$$

$$slot0_n = twap_n$$

This implies that data after the last datapoint of the last received batch is extrapolated from the last twap.

$$C'(t) = tickCumulative(t_{n}) + slot0_n * \Delta t_n^t$$

Notice also that integrating a function into a primitive also brings a integration constant $K$, that equals in this case to the `tickCumulative` of the pool, at the time of the first oracle observation. Since $C$ in the pool integrates from the pool genesis, and $C'$ in the oracle integrates since oracle genesis.

$$C' = C + K$$

$$C(t) = C'(t) + C(t_{genesis})$$

But any difference of $C'$ should not be sensible to $K$, since it cancels out.

Given that the integration of a curve can be separated in the integration of its parts:
$$\int_A^Btick*dt = twap_A^B * \Delta t_A^B$$

$$C' = \int_a^ztick*dt = \int_a^bt*dt + \int_b^ct*dt + ... + \int_y^zt*dt$$

$$(twap_a^b * \Delta t_a^b) + twap_b^c * \Delta t_b^c + ...$$

On the pool $C$ as is exactly $tick(t) * \Delta t_{genesis}^t$ as it generates a new insertion each time `tick` changes. The resolution depends on the information, being at least 1s (if 2 consecutive 1s blocks have a tick moving swap). On the sidechain, the data from the last available datapoint will be optimistically extrapolated, and the resolution will depend on the `periodLength`, as it will be calculated as $\sum twap_a^b * \Delta t_a^b$, trying to make $\Delta t$s of an homogeneous length of `periodLenght`, in order to reduce the amount of consultations that the transaction must do to the pool.

This means that $C(t) \sim C'(t)$ (for any given $t$), but at least there exists points $a, b, c, ...$ such that `C(a) = C'(a) + K`, `C(b) = C'(b) + K`, ...

$$C_a^b = C(b)-C(a)$$

$${C'}_a^b = (C'(b)+K)-(C'(a)+K) = C'(b)-C'(a)$$

$$C_a^b = {C'}_a^b$$

All of the information that happens between those points $a, b, c, ...$ is reduced to an average between those points. Meaning that a change inside those periods is filtered out due to the low resolution of the oracle mechanism.

> $C(t)$
>
> - always accesible
> - always correct
> - always updated
>
> $C'(t)$
>
> - always accesible
> - only correct in $a, b, c, ...$
> - optimistically extrapolates last state

### Fetch Strategy

There are 3 parameters that define the maintenance of the strategy:

- `periodLength` is the target length of the bridged twap periods
- `strategyCooldown` time since last update required to trigger another update
- `twapPeriod` the target length of the twap calculated to compare pool and oracle, and trigger an update given a threshold
- `twapThreshold` amount of ticks of difference between oracle and pool twaps (with length of `twapPeriod`) to trigger an update of the oracle

### Twap trigger

Any twap (of a given length) can be queried from the pool as

$$ twap\_{mainnet} = {{C(now) - C(now-length)}\over{length}}$$

From mainnet (the chain that has the pool to consult), the tickCumulative observed at the sidechain, after the last observation, can be inferred as

$$C_{cache}(now) = cache.tickCumulative + cache.twap * (now - t_{cache})$$

$$ twap*{sidechain} = {{C*{cache}(now) - C(now-length)}\over{length}}$$

Having $C_{cache}$ and $C_{mainnet}$ the same integration constant K, because no transformation is made between them. Being able to use then $C$ to consult any timestamp prior to cache.

Any twap difference that surpases a certain threshold, allows any signer to trigger a pool history observation and update, prioritizing the chosing of `secondsAgo` in a way that uses a time length of `periodLength` as the last observation period (the one that gets extrapolated).

### Timestamps calculation

Timestamps should be chosen in a way that its result is indistinct from whenever someone chooses to update the oracle. Off by 1 second transactions should not generate two different results. Bringing also the latest posible timestamp is important for the precision of the extrapolation. As the information that builds a twap query is less guessed and more updated.

With those design constraints, given a length of time to query, an array is made such that the 1st item is allowed to be inferior than `periodLength`, and all the rest should be of length `periodLength`.

> Given a hypotetical time to cover of 3.14s (since t=10s) in periods of 1s, the array would be built such that `[0.14, 1, 1, 1]`, being `t = [10.14, 11.14, 12.14, 13.14]`, avoiding in such a way that the extrapolation in the oracle would be built with $twap_{13}^{13.14}$, using $twap_{12.14}^{13.14}$ of `1s` istead.
> In this way, should a signigicant tick change have happened in the seconds $t_{13}^{13.14}$, its effect will be less significant on the sidechain extrapolation, because it will be averaged with $t_{12.14}^{13.14}$.

When calculating twaps, its mostly important to calculate it referenced to `now`. Old information can have strong effects on $C'$, but is always diluted with $t$.

> In the example above, if a strong tick difference had happened at $t_{10}^{10.14}$, its effect would have strongly changed ${C'}_{10}^{10.14}$ (an existent time period).
>
> As twap is always calculated with `now`, in ${C'}_{10}^{13.14}$ it would have less of effect.

NOTE: A more gas-efficient array filling strategy can be built, by making longer periods on old datapoints and linearly or logarithmically shifting until most recent one has `periodLength`

## Setup

Clone the repo in your preferred way, and fill the `.env` file using the `.env.example` as reference. The environment is yet set to work with testnets, using Goerli to OP Goerli bridge as default.

For a dummy setup (without bridging) run:

```
yarn deploy:setup-dummy
yarn deploy:fetch
yarn deploy:bridge-dummy
```

For a cross-chain setup run:

```
yarn deploy:setup
yarn deploy:fetch
yarn deploy:bridge
```

For a Keep3r rewarded setup run:

```
yarn deploy:setup
yarn deploy:work
```

In `/utils/constants.ts` one can find the configuration of the strategies chosen by chain. The default for Goerli is set to refresh each 1/2 day, using periods of 1hr, and comparing a 2hr twap with 500 ticks (+-5%) threshold.
