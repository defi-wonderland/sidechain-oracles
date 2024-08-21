import { ContractTransaction } from 'ethers';
import { JsonRpcSigner } from '@ethersproject/providers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { DataReceiver, ConnextReceiverAdapter, OracleSidechain, OracleFactory, IOracleSidechain, IERC20 } from '@typechained';
import { evm, wallet } from '@utils';
import { readArgFromEvent } from '@utils/event-utils';
import { ZERO_ADDRESS } from '@utils/constants';
import { toUnit } from '@utils/bn';
import { calculateSalt } from '@utils/misc';
import { getNodeUrl } from 'utils/env';
import forkBlockNumber from './fork-block-numbers';
import { setupContracts, getEnvironment, getOracle } from './common';
import { expect } from 'chai';

describe('@skip-on-coverage DataReceiver.sol', () => {
  let deployer: SignerWithAddress;
  let governor: SignerWithAddress;
  let dataReceiver: DataReceiver;
  let connextReceiverAdapter: ConnextReceiverAdapter;
  let oracleFactory: OracleFactory;
  let oracleSidechain: OracleSidechain;
  let tokenA: IERC20;
  let tokenB: IERC20;
  let fee: number;
  let salt: string;
  let tx: ContractTransaction;
  let snapshotId: string;

  const nonce = 42;

  before(async () => {
    await evm.reset({
      jsonRpcUrl: getNodeUrl('ethereum'),
      blockNumber: forkBlockNumber.oracleSidechain,
    });

    ({ tokenA, tokenB, fee } = await getEnvironment());

    salt = calculateSalt(tokenA.address, tokenB.address, fee);

    ({ deployer, governor, dataReceiver, connextReceiverAdapter, oracleFactory } = await setupContracts());

    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
    await dataReceiver.connect(governor).whitelistAdapter(connextReceiverAdapter.address, true);
  });

  describe('adding observations', () => {
    let connextReceiverAdapterSigner: JsonRpcSigner;
    let dataReceiverSigner: JsonRpcSigner;
    let blockTimestamp1 = 1000000;
    let tick1 = 100;
    let observationData1 = [blockTimestamp1, tick1] as IOracleSidechain.ObservationDataStructOutput;
    let blockTimestamp2 = 3000000;
    let tick2 = 300;
    let observationData2 = [blockTimestamp2, tick2] as IOracleSidechain.ObservationDataStructOutput;
    let observationsData = [observationData1, observationData2];

    beforeEach(async () => {
      connextReceiverAdapterSigner = await wallet.impersonate(connextReceiverAdapter.address);
      dataReceiverSigner = await wallet.impersonate(dataReceiver.address);
      await wallet.setBalance(connextReceiverAdapter.address, toUnit(10));
      await wallet.setBalance(dataReceiver.address, toUnit(10));
      dataReceiver = dataReceiver.connect(connextReceiverAdapterSigner);
      oracleFactory = oracleFactory.connect(dataReceiverSigner);
    });

    context('when an oracle is registered', () => {
      let caller: string;

      beforeEach(async () => {
        caller = connextReceiverAdapter.address;
        await dataReceiver.addObservations([[0, 0]] as IOracleSidechain.ObservationDataStructOutput[], salt, nonce);
      });

      it('should add the observations', async () => {
        tx = await dataReceiver.addObservations(observationsData, salt, nonce + 1);

        ({ oracleSidechain } = await getOracle(oracleFactory.address, tokenA.address, tokenB.address, fee));
        const slot0 = await oracleSidechain.slot0();

        const SWAP_EVENT_ARGS = [ZERO_ADDRESS, ZERO_ADDRESS, 0, 0, slot0.sqrtPriceX96, 0, slot0.tick];
        await expect(tx)
          .to.emit(oracleSidechain, 'Swap')
          .withArgs(...SWAP_EVENT_ARGS);

        await expect(tx)
          .to.emit(dataReceiver, 'ObservationsAdded')
          .withArgs(salt, nonce + 1, caller);
      });

      it('should remember observations that arrived disordered', async () => {
        const obs1 = [[1, 100]] as IOracleSidechain.ObservationDataStructOutput[];
        const obs2 = [[2, 100]] as IOracleSidechain.ObservationDataStructOutput[];
        const obs3 = [[3, 100]] as IOracleSidechain.ObservationDataStructOutput[];
        const obs4 = [[4, 100]] as IOracleSidechain.ObservationDataStructOutput[];

        /*
        - Creates a setup in which an observation arrives (3) before the previous nonce (2) has been processed.
        - In this case, the observation should be cached and processed later (as long as the previous nonce is already processed).
        - In this setup, observations arrive in the order (1), (3), (2), (4) and expected to be processed in numerical order.
        - This will happen in the following way:
          - (1) is processed immediately.
          - then (3) is cached (current is 1).
          - (2) is processed immediately.
          - (4) is cached (current is 2).
            - (3) is processed.
            - (4) is processed (current is 3).
        */

        const tx1 = await dataReceiver.addObservations(obs1, salt, nonce + 1); // initial
        const tx2 = await dataReceiver.addObservations(obs3, salt, nonce + 3); // disordered (before 2)
        const tx3 = await dataReceiver.addObservations(obs2, salt, nonce + 2); // ordered (after 1)
        const tx4 = await dataReceiver.addObservations(obs4, salt, nonce + 4); // should include 3

        await expect(tx1)
          .to.emit(dataReceiver, 'ObservationsAdded')
          .withArgs(salt, nonce + 1, caller);
        await expect(tx2).to.emit(dataReceiver, 'ObservationsCached');
        await expect(tx2).not.to.emit(dataReceiver, 'ObservationsAdded');
        await expect(tx3)
          .to.emit(dataReceiver, 'ObservationsAdded')
          .withArgs(salt, nonce + 2, caller);
        await expect(tx4)
          .to.emit(dataReceiver, 'ObservationsAdded')
          .withArgs(salt, nonce + 3, caller);
        await expect(tx4)
          .to.emit(dataReceiver, 'ObservationsAdded')
          .withArgs(salt, nonce + 4, caller);
      });
    });

    context('when an oracle is not registered', () => {
      context('when an oracle already exists for a given pair', () => {
        beforeEach(async () => {
          await oracleFactory.deployOracle(salt, nonce);
        });

        it('should add the observations', async () => {
          tx = await dataReceiver.addObservations(observationsData, salt, nonce);

          ({ oracleSidechain } = await getOracle(oracleFactory.address, tokenA.address, tokenB.address, fee));

          await expect(tx).to.emit(dataReceiver, 'ObservationsAdded').withArgs(salt, nonce, connextReceiverAdapter.address);
        });
      });

      context('when an oracle does not exist for a given pair', () => {
        it('should deploy an oracle', async () => {
          tx = await dataReceiver.addObservations(observationsData, salt, nonce);

          ({ oracleSidechain } = await getOracle(oracleFactory.address, tokenA.address, tokenB.address, fee));

          await expect(tx).to.emit(oracleFactory, 'OracleDeployed').withArgs(salt, oracleSidechain.address, nonce);
        });

        it('should add the observations', async () => {
          tx = await dataReceiver.addObservations(observationsData, salt, nonce);

          ({ oracleSidechain } = await getOracle(oracleFactory.address, tokenA.address, tokenB.address, fee));

          await expect(tx).to.emit(dataReceiver, 'ObservationsAdded').withArgs(salt, nonce, connextReceiverAdapter.address);
        });
      });
    });
  });

  describe('syncing observations', () => {
    let connextReceiverAdapterSigner: JsonRpcSigner;
    let dataReceiverSigner: JsonRpcSigner;
    let blockTimestamp1 = 1000000;
    let tick1 = 100;
    let observationData1 = [blockTimestamp1, tick1] as IOracleSidechain.ObservationDataStructOutput;
    let blockTimestamp2 = 3000000;
    let tick2 = 300;
    let observationData2 = [blockTimestamp2, tick2] as IOracleSidechain.ObservationDataStructOutput;
    let observationsData = [observationData1, observationData2];

    beforeEach(async () => {
      connextReceiverAdapterSigner = await wallet.impersonate(connextReceiverAdapter.address);
      dataReceiverSigner = await wallet.impersonate(dataReceiver.address);
      await wallet.setBalance(connextReceiverAdapter.address, toUnit(10));
      await wallet.setBalance(dataReceiver.address, toUnit(10));
      dataReceiver = dataReceiver.connect(connextReceiverAdapterSigner);
      oracleFactory = oracleFactory.connect(dataReceiverSigner);
    });

    context('when an oracle is registered', () => {
      let caller: string;

      beforeEach(async () => {
        caller = connextReceiverAdapter.address;
        await dataReceiver.addObservations([[0, 0]] as IOracleSidechain.ObservationDataStructOutput[], salt, nonce - 2);
      });

      context('when the cache at pool nonce is empty', () => {
        it('should do nothing', async () => {
          await expect(dataReceiver.syncObservations(salt, 0)).to.be.revertedWith('ObservationsNotWritable()');
        });
      });

      context('when the cache is populated', () => {
        beforeEach(async () => {
          await dataReceiver.addObservations([[0, 0]] as IOracleSidechain.ObservationDataStructOutput[], salt, nonce + 2);
          await dataReceiver.addObservations([[1, 0]] as IOracleSidechain.ObservationDataStructOutput[], salt, nonce + 1);
          await dataReceiver.addObservations([[2, 0]] as IOracleSidechain.ObservationDataStructOutput[], salt, nonce);
          await dataReceiver.addObservations([[3, 0]] as IOracleSidechain.ObservationDataStructOutput[], salt, nonce - 1);
          // NOTE: dataReceiver should be at poolNonce == nonce by now (with nonce, nonce+1 & nonce+2 in cache)
        });

        it('should add all cached observations when called without max', async () => {
          tx = await dataReceiver.syncObservations(salt, 0);

          await expect(tx).to.emit(dataReceiver, 'ObservationsAdded').withArgs(salt, nonce, caller);
          await expect(tx)
            .to.emit(dataReceiver, 'ObservationsAdded')
            .withArgs(salt, nonce + 1, caller);
          await expect(tx)
            .to.emit(dataReceiver, 'ObservationsAdded')
            .withArgs(salt, nonce + 2, caller);
        });

        it('should add cached observations limited by max argument', async () => {
          tx = await dataReceiver.syncObservations(salt, 2);

          await expect(tx).to.emit(dataReceiver, 'ObservationsAdded').withArgs(salt, nonce, caller);
          await expect(tx)
            .to.emit(dataReceiver, 'ObservationsAdded')
            .withArgs(salt, nonce + 1, caller);
        });
      });
    });

    context('when an oracle is not registered', () => {
      it('should revert', async () => {
        await expect(dataReceiver.syncObservations(salt, 0)).to.be.revertedWith('ZeroAddress()');
      });
    });
  });
});
