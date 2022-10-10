import { JsonRpcSigner } from '@ethersproject/providers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { DataReceiver, ConnextReceiverAdapter, OracleSidechain, OracleFactory, IOracleSidechain, ERC20 } from '@typechained';
import { evm, wallet } from '@utils';
import { ORACLE_SIDECHAIN_CREATION_CODE } from '@utils/constants';
import { toUnit } from '@utils/bn';
import { readArgFromEvent } from '@utils/event-utils';
import { onlyWhitelistedAdapter } from '@utils/behaviours';
import { calculateSalt, getInitCodeHash } from '@utils/misc';
import { getNodeUrl } from 'utils/env';
import forkBlockNumber from './fork-block-numbers';
import { setupContracts, getEnvironment, getOracle } from './common';
import { expect } from 'chai';

describe('@skip-on-coverage DataReceiver.sol', () => {
  let deployer: SignerWithAddress;
  let governor: SignerWithAddress;
  let dataReceiver: DataReceiver;
  let connextReceiverAdapter: ConnextReceiverAdapter;
  let oracleSidechain: OracleSidechain;
  let oracleFactory: OracleFactory;
  let snapshotId: string;
  let tokenA: ERC20;
  let tokenB: ERC20;
  let fee: number;
  let salt: string;

  let nonce = 1;

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

  describe('salt code hash', () => {
    it('should be correctly set', async () => {
      let ORACLE_INIT_CODE_HASH = await dataReceiver.ORACLE_INIT_CODE_HASH();
      expect(ORACLE_INIT_CODE_HASH).to.eq(getInitCodeHash(ORACLE_SIDECHAIN_CREATION_CODE));
    });
  });

  describe('adding observations', () => {
    let connextReceiverAdapterSigner: JsonRpcSigner;
    let blockTimestamp1 = 1000000;
    let tick1 = 100;
    let observationData1 = [blockTimestamp1, tick1] as IOracleSidechain.ObservationDataStructOutput;
    let blockTimestamp2 = 3000000;
    let tick2 = 300;
    let observationData2 = [blockTimestamp2, tick2] as IOracleSidechain.ObservationDataStructOutput;
    let observationsData = [observationData1, observationData2];

    beforeEach(async () => {
      connextReceiverAdapterSigner = await wallet.impersonate(connextReceiverAdapter.address);
      await wallet.setBalance(connextReceiverAdapter.address, toUnit(10));
      dataReceiver = dataReceiver.connect(connextReceiverAdapterSigner);
    });

    onlyWhitelistedAdapter(
      () => dataReceiver,
      'addObservations',
      () => connextReceiverAdapterSigner,
      () => [observationsData, salt, nonce]
    );

    context('when the observations are writable', () => {
      it('should add the observations', async () => {
        let tx = await dataReceiver.addObservations(observationsData, salt, nonce);

        ({ oracleSidechain } = await getOracle(oracleFactory.address, tokenA.address, tokenB.address, fee));

        await expect(tx).to.emit(oracleSidechain, 'ObservationWritten').withArgs(dataReceiver.address, observationData1);
        await expect(tx).to.emit(oracleSidechain, 'ObservationWritten').withArgs(dataReceiver.address, observationData2);
      });

      it('should emit ObservationsAdded', async () => {
        let tx = await dataReceiver.addObservations(observationsData, salt, nonce);
        let eventUser = await readArgFromEvent(tx, 'ObservationsAdded', '_user');
        let eventObservationsData = await readArgFromEvent(tx, 'ObservationsAdded', '_observationsData');
        expect(eventUser).to.eq(connextReceiverAdapter.address);
        expect(eventObservationsData).to.eql(observationsData);
      });
    });

    context('when the observations are not writable', () => {
      let blockTimestamp2Before = blockTimestamp2 - 1;
      let observationData2Before = [blockTimestamp2Before, tick2] as IOracleSidechain.ObservationDataStructOutput;
      let oldObservationsData = [observationData2Before, observationData2];

      beforeEach(async () => {
        await dataReceiver.addObservations(observationsData, salt, nonce);
      });

      // reverts with WrongNonce()
      it('should revert the tx', async () => {
        await expect(dataReceiver.addObservations(oldObservationsData, salt, nonce)).to.be.revertedWith('ObservationsNotWritable()');
      });
    });

    after(async () => {
      dataReceiver = dataReceiver.connect(deployer);
    });
  });
});
