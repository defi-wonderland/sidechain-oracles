# Sidechain Oracle

## How to deploy

Run the scripts in this order:

```
yarn deploy --network sender --tags sender
```

```
yarn deploy --network receiver --tags receiver
```

```
yarn deploy --network receiver --tags receiver-actions
```

```
yarn deploy --network sender --tags sender-actions
```

## Changing Sender and Receiver

To properly change sender and receiver:

- Change what network is sender and what network is receiver on `hardhat.config.ts`
- If it's a new network, make sure to add the right data to `chainIdData` in `utils/constants.ts`
