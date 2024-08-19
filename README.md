# Sidechain Oracles

- [Scope](#scope)
- [Contracts](#contracts)
  - [Permissionless execution](#permissionless-execution)
  - [Rewarded execution](#rewarded-execution)
  - [Receiving execution](#receiving-execution)
- [On-chain Truth Mechanism](#on-chain-truth-mechanism)
- [Math Representation](#math-representation)
- [Fetch Strategy](#fetch-strategy)
  - [Twap trigger](#twap-trigger)
  - [Timestamps calculation](#timestamps-calculation)
- [Setup](#setup)
- [Address Registry](#address-registry)
  - [Testnet](#testnet)
    - [Sepolia (sender and _receiver_)](#sepolia-sender-and-receiver)
    - [OP Sepolia (_receiver_)](#op-sepolia-receiver)
    - [Mumbai (manual sender)](#sepolia-manual-sender)
    - [Whitelisted pipelines](#whitelisted-pipelines)

## Scope

Sidechain Oracles is a mechanism to provide a Uniswap V3 Pool's price history to chains where the pair may not be available or doesn't have a healthy liquidity to rely on.

The set of contracts is designed to update and broadcast the oracle information every time some cooldown period has expired, or whenever the twap has changed significantly since the last update.

## Contracts

**DataFeed**: source of truth on mainnet, queries the UniV3Pool and stores the result, also permissionless broadcasts data to bridges

**DataFeedStrategy**: defines with which timestamps and when the history of a pool should be permissionless updated: by cooldown period, or twap difference

**StrategyJob**: adds a layer of rewards for calling the update of the strategy (when possible) or the broadcast transaction (when new information is fetched)

**IBridgeAdapter**: abstract and allowlisted, standardizes the message broadcast and delivers to DataReceiver, the bridge provider should instantiate both a Sender and a Receiver

**DataReceiver**: receives the message broadcast by DataFeed, proxies it to the SidechainOracle, or triggers the factory to deploy one first

**OracleSidechain**: stores an extension of OracleLibrary and updates it with each data batch, uses a nonce to ensure consistency

**OracleFactory**: deploys a new instance of an oracle on a precomputed address for each `token0 token1 fee` combination

#### Permissionless execution

- When either time has passed since the last update, or twap has changed since the last observation, DataFeedStrategy allows any signer to trigger a data fetch
- On the strategy, the set of timestamps is defined and passed to the DataFeed
- The DataFeed queries the UniV3Pool at the set of timestamps and stores the keccak of the result
- The DataFeed allows the broadcast of any known datasets (validating the keccak) to other chains (allowlisted by pool & chain ID)

#### Rewarded execution

- When DataFeedStrategy allows a fetch, a keeper can work StrategyJob fetch method to trigger it and get rewarded for the gas spent
- When a new data batch is fetched, a keeper can work the StrategyJob broadcast method to push the information to allowlisted chains, and get rewarded for the gas spent

#### Receiving execution

- On the sidechain, when a new data batch is received, the receiver pushes the information to the corresponding oracle
- The oracle updates the observation array looping through the `(twap,timestamp)[]` array
- If a data batch arrives and no oracle exists for that pair, the receiver will trigger the OracleFactory to deploy the oracle, and then write the batch
- If a data batch arrives with a nonce different than the oracle's next one, the transaction will revert

## On-chain Truth Mechanism

Using a UniswapV3Pool as a source of truth allows the bridging of its price history to a receiver contract, replicating the OracleLibrary behavior. Any contract on the receiving chain can choose to calculate a twap, the same way it would query the pool `observe([t,0])`, by addressing the query to a pre-computable address: the oracle. Contracts can also query `slot0.sqrtPriceX96` or `slot0.tick`, and will get a time-weighted average of the last time-period.

The pool is consulted at timestamps defined by the strategy, and the DataFeed calculates the twap between those timestamps, and allows the bridging of the calculated oracle insertions, backfilling as if big swaps happened in those timestamps moving the tick to the correspondent twap for that period.

The DataFeed also stores in the cache the last state of the pool observed to fill in the gaps between sets of timestamps, or to overcome manually (permissioned) whenever the pool returns an `!OLD` error, and keep the consistency of information.

## Math Representation

The UniV3Pool price is recorded on a `tickCumulative` variable, that can be represented as the primitive of `tick`, integrated from the first swap of the pool, until the consulted `t`. It is accessed through `observe(uint32[] secondsAgo)`, or accessing each observation by index `observations(uint256 index)`.

The mathematical mechanism aims to create a clone of the `tickCumulative` $C(t)$ curve by understanding it as the primitive of `twap(t)`, and letting the OracleLibrary integrate the result into the $C'(t)$ of the oracle.

$$C = \int_0^t tick*dt$$

To calculate the time-weighted average between any two timestamps, one should compare the tickCumulative and divide by the time difference.

$$twap_a^b = {{C(b)-C(a)}\over{t(b)-t(a)}} = {{C_a^b}\over{\Delta t_a^b}}$$

$$C(t) = twap_0^t * \Delta t_0^t$$

$$C_a^b = twap_a^b * \Delta t_a^b$$

In the pool contract, it is updated each time a swap makes the tick change, such that the value of $C(t)$ is always accessible, correct, and updated
$$C_n = C_{n-1} + slot0.tick * (now - t_{n-1})$$

By accepting $C$ as the primitive of $tick(t)$, one can also build another $C'$ function that replicates, at least exactly in a particular set of points, the behavior of $C$, by using the time-weighted averages between that set of points. On the oracle, it is stored in batches every time data is received.

$${C'}_ {n} = C_{n-1} + twap * (t_n - t_{n-1})$$

$$slot0_n = twap_n$$

This implies that data after the last datapoint of the last received batch is extrapolated from the last twap.

$$C'(t) = tickCumulative(t_{n}) + slot0_n * \Delta t_n^t$$

Notice also, that integrating a function into a primitive also adds the integration constant $K$, that equals, in this case, to the `tickCumulative` of the pool, at the time of the first oracle observation. Since $C$ in the pool integrates from the pool genesis, and $C'$ in the oracle integrates since oracle genesis. But any difference of $C'$ should not be sensible to $K$, since it cancels out.

$$C' = C + K$$

$$C(t) = C'(t) + C(t_{genesis})$$

Given that the integration of a curve can be separated in the integration of its parts, and each integration can be calculated with the twap:
$$\int_A^Btick*dt = twap_A^B * \Delta t_A^B$$

$$C' = \int_a^ztick*dt = \int_a^bt*dt + \int_b^ct*dt + ... + \int_y^zt*dt$$

$$(twap_a^b * \Delta t_a^b) + twap_b^c * \Delta t_b^c + ...$$

On the pool $C$ is exactly $tick(t) * \Delta t_{genesis}^t$ , as it generates a new insertion each time `tick` changes. The resolution of the pool depends on the information, being at least 1s (if two consecutive 1s blocks have a tick-moving swap). On the sidechain, the twap calculation will both optimistically interpolate information between datapoints, and optimistically extrapolate the data from the last available datapoint. The resolution will depend on the `periodLength` set by the Strategy, as it will be calculated as $\sum twap_a^b * \Delta t_a^b$ , trying to make $\Delta t$ of a homogeneous length. This setting should be set considering the resolution obtained, and the required consultations to the pool's binarySearch required to provide such resolution.

All of the information that exists between bridged points $a, b, c, ...$ is reduced to an average between those points, which means that any twap change inside those periods is filtered by the sensitivity of the strategy resolution.

> $C(t)$ UniV3Pool `observe()`
>
> - always accessible
> - always correct
> - always updated
>
> $C'(t)$ SirechainOracle `observe()`
>
> - always accessible
> - only correct in $a, b, c, ...$
> - optimistically extrapolates the last state

## Fetch Strategy

There are three parameters that define the maintenance of the strategy:

- `periodLength` is the target length of the bridged twap periods
- `strategyCooldown` time since the last update required to trigger another update
- `twapPeriod` the target length of the twap calculated to compare pool and oracle, and trigger an update given a threshold
- `twapThreshold` amount of ticks of difference between oracle and pool twaps (with a length of `twapPeriod`) to trigger an update of the oracle

### Twap trigger

Any twap (of a given length) can be queried from the pool as

$$ twap\_{mainnet} = {{C(now) - C(now-length)}\over{length}}$$

From mainnet (the chain that has the pool to consult), the tickCumulative observed at the sidechain, after the last observation can be inferred as

$$C_{cache}(now) = cache.tickCumulative + cache.twap * (now - t_{cache})$$

$$ twap*{sidechain} = {{C*{cache}(now) - C(now-length)}\over{length}}$$

Having $C_{cache}$ and $C_{mainnet}$ the same integration constant K, because no transformation is made between them. Being able to use then $C$ to consult any timestamp prior to cache.

Any twap difference that surpasses a certain threshold allows any signer to trigger a pool history observation and update, prioritizing the choosing of `secondsAgo` in a way that uses a time length of `periodLength` as the last observation period (the one that gets extrapolated).

### Timestamps calculation

Timestamps should be chosen in a way that their result is indistinct from whenever someone chooses to update the oracle. Off-by-1-second transactions should not generate two different results. Bringing also the latest possible timestamp is important for the precision of the extrapolation. As the information that builds a twap query is less guessed and more updated.

With those design constraints, given a length of time to query, an array is made such that only the 1st item is allowed to be inferior to `periodLength`, while all the rest should be of length `periodLength`.

> Given a hypothetical time to cover of 3.14s (since t=10s) in periods of 1s, the array `[0.14, 1, 1, 1]` will be built, being `t = [10.14, 11.14, 12.14, 13.14]`. Avoiding in such way, that the oracle extrapolation would be built with $twap_{13}^{13.14}$, using $twap_{12.14}^{13.14}$ of `1s` instead.
> In this way, should a significant tick change have happened in the seconds $t_{13}^{13.14}$, its effect will be less significant on the sidechain extrapolation because it will be averaged with $t_{12.14}^{13.14}$.

When calculating twaps, it's mainly important to calculate it referenced to `now`. Old information can strongly affect $C'$, but is always diluted with $t$.

> In the example above, if a strong tick difference had happened at $t_{10}^{10.14}$, its effect would have strongly changed ${C'}_{10}^{10.14}$ (an existent time period).
>
> As twap is always calculated with `now`, in ${C'}_{10}^{13.14}$ it would have less of an effect.

NOTE: A more gas-efficient array-filling strategy can be built by making more extended periods on old datapoints and linearly or logarithmically shifting until most recent one has `periodLength`

## Setup

Clone the repo in your preferred way, and fill the `.env` file using the `.env.example` as a reference. The environment is yet set to work with testnets, using Sepolia to OP Sepolia bridge as default.

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

For 1 tag manual-deployment and bridging
`yarn deploy --network sepolia --tags manual-send-test-observation`

In `/utils/constants.ts`, one can find the configuration of the strategies chosen by chain. The default for Sepolia is set to refresh each 1/2 day, using periods of 1hr, and comparing a 2hr twap with 500 ticks (+-5%) threshold.

## Address Registry

#### Testnet

##### Sepolia (sender and _receiver_)

| Contract                  | Address                                      |
| ------------------------- | -------------------------------------------- |
| DataFeed                  | `0x8Fb68E83831c7e8622e10C154CC0d24856440809` |
| DataFeedStrategy          | `0x606e25c67B8d6550075C8085083c763769Cfe2BE` |
| StrategyJob               | `0x606e25c67B8d6550075C8085083c763769Cfe2BE` |
| Connext SenderAdapter     | `0xF73E6BC8ca4Fec5e9773C4f22E8EBEEEd12733d6` |
| _Connext ReceiverAdapter_ | `0x05a6CEF3f938E8E9b3112CB44e8B9771638989Ed` |
| _DataReceiver_            | `0xa09683377E5cE0bB7eEa90D2b64e3644f7eA1B8a` |
| _OracleFactory_           | `0x0594Dc74043b93Bdb371f01187704C98D45bd4E6` |

##### OP Sepolia (_receiver_)

| Contract                  | Address                                      |
| ------------------------- | -------------------------------------------- |
| _Connext ReceiverAdapter_ | `0x4D81A5C9F7706377df368D1716460da03faEcBcb` |
| _DataReceiver_            | `0x768c227320165A71A4001fE23A0C38CD6B5585c0` |
| _OracleFactory_           | `0xB8aD440Ad7A3298C73258b1Fc202A081Db9107cb` |

##### Mumbai (manual sender)

| Contract              | Address                                      |
| --------------------- | -------------------------------------------- |
| DataFeed              | `0x1c9Bc091f070A10E23B2a90eA543AD38AA3De1EE` |
| Connext SenderAdapter | `0x4C8589e7D1d91e454F5f30C3e1bb3e197B5Bf368` |

##### Whitelisted pipelines:

| Chain - Pool                                           | Chain - OracleSidechain                                   |
| ------------------------------------------------------ | --------------------------------------------------------- |
| Sepolia - `0x317ceCd3eB02158f97DF0B67B788edCda4E066e5` | OP Sepolia - `0x4ECFF2c532d47D7be3D957E4a332AB134cad1fd9` |
| Mumbai - `0xd69f1635dc28a11E05841AE25Fd1572FD0EF1eF4`  | Sepolia - `0x050BBA5E4abde750Ea5610D8412cD46171C665e7`    |
| Sepolia - `0x317ceCd3eB02158f97DF0B67B788edCda4E066e5` | Sepolia - `0xED7f635EE962537b4DB13a1e1c3922EC65366fE2`    |
