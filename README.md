# Sidechain Oracle

## How to deploy

Deploy all required contracts in both chains and bridge data

```
yarn deploy:all
```

Make a swap and bridge data

```
yarn deploy:send
```

Deploy dummy contracts in receiver chain and send observations (w/o bridging)

```
yarn deploy:test
```

### Verifying Contracts

In the `.env` file, if you need to verify your contracts when they're deployed set the field `TEST=` to false

### Changing Sender and Receiver

To properly change sender and receiver:

- Change what network is sender and what network is receiver on `hardhat.config.ts`
- If it's a new network, make sure to add the right data to `chainIdData` in `utils/constants.ts`
