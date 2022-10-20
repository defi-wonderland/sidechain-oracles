import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ConnextSenderAdapter, ConnextSenderAdapter__factory, ConnextHandlerForTest } from '@typechained';
import { smock, MockContract, MockContractFactory, FakeContract } from '@defi-wonderland/smock';
import { evm, wallet } from '@utils';
import { ZERO_ADDRESS, VALID_POOL_SALT } from '@utils/constants';
import { toBN } from '@utils/bn';
import { readArgFromEvent } from '@utils/event-utils';
import { onlyDataFeed } from '@utils/behaviours';
import chai, { expect } from 'chai';

chai.use(smock.matchers);

describe('ConnextSenderAdapter.sol', () => {
  let randomFeed: SignerWithAddress;
  let connextSenderAdapter: MockContract<ConnextSenderAdapter>;
  let connextSenderAdapterFactory: MockContractFactory<ConnextSenderAdapter__factory>;
  let connextHandler: FakeContract<ConnextHandlerForTest>;
  let snapshotId: string;

  const randomReceiverAdapterAddress = wallet.generateRandomAddress();
  const randomDestinationDomainId = 3;
  const rinkebyOriginId = 1111;

  const randomSalt = VALID_POOL_SALT;
  const randomNonce = 420;

  before(async () => {
    [, randomFeed] = await ethers.getSigners();
    connextHandler = await smock.fake('ConnextHandlerForTest');

    connextSenderAdapterFactory = await smock.mock('ConnextSenderAdapter');
    connextSenderAdapter = await connextSenderAdapterFactory.deploy(connextHandler.address, randomFeed.address);

    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('constructor(...)', () => {
    it('should initialize connext receiver to the address passed to the constructor', async () => {
      expect(await connextSenderAdapter.connext()).to.eq(connextHandler.address);
    });
    it('should initialize data feed to the address passed to the constructor', async () => {
      expect(await connextSenderAdapter.dataFeed()).to.eq(randomFeed.address);
    });
  });

  describe('bridgeObservations(...)', () => {
    let blockTimestamp1 = 1000000;
    let arithmeticMeanTick1 = 100;
    let observationData1 = [blockTimestamp1, arithmeticMeanTick1];
    let blockTimestamp2 = 3000000;
    let arithmeticMeanTick2 = 300;
    let observationData2 = [blockTimestamp2, arithmeticMeanTick2];
    let observationsData = [observationData1, observationData2];

    beforeEach(async () => {
      connextHandler.xcall.reset();
    });

    it('should call xCall with the correct arguments', async () => {
      const xcallArgs = await prepareData(observationsData);
      await connextSenderAdapter
        .connect(randomFeed)
        .bridgeObservations(randomReceiverAdapterAddress, randomDestinationDomainId, observationsData, randomSalt, randomNonce);

      expect(connextHandler.xcall).to.have.been.calledOnceWith(...xcallArgs);
    });

    // TODO: review event emission
    it.skip('should emit an event', async () => {
      const tx = await connextSenderAdapter
        .connect(randomFeed)
        .bridgeObservations(randomReceiverAdapterAddress, randomDestinationDomainId, observationsData, randomSalt, randomNonce);
      let eventTo = await readArgFromEvent(tx, 'DataSent', '_to');
      let eventOriginDomainId = await readArgFromEvent(tx, 'DataSent', '_originDomainId');
      let eventDestinationDomainId = await readArgFromEvent(tx, 'DataSent', '_destinationDomainId');
      let eventObservationsData = await readArgFromEvent(tx, 'DataSent', '_observationsData');
      let eventPoolSalt = await readArgFromEvent(tx, 'DataSent', '_poolSalt');

      expect(eventTo).to.eq(randomReceiverAdapterAddress);
      expect(eventOriginDomainId).to.eq(rinkebyOriginId);
      expect(eventDestinationDomainId).to.eq(randomDestinationDomainId);
      expect(eventObservationsData).to.eql(observationsData);
      expect(eventPoolSalt).to.eq(randomSalt);
    });

    onlyDataFeed(
      () => connextSenderAdapter,
      'bridgeObservations',
      () => randomFeed,
      () => [randomReceiverAdapterAddress, randomDestinationDomainId, observationsData, randomSalt, randomNonce]
    );
  });

  const prepareData = async (observationsData: number[][]) => {
    const callData = ethers.utils.defaultAbiCoder.encode(['(uint32,int24)[]', 'bytes32', 'uint24'], [observationsData, randomSalt, randomNonce]);
    const callParams = [
      // _destination:
      randomDestinationDomainId,
      // _to:
      randomReceiverAdapterAddress,
      // _asset:
      '0x7ea6eA49B0b0Ae9c5db7907d139D9Cd3439862a1',
      // _delegate:
      ZERO_ADDRESS,
      // _amount:
      toBN(0),
      // _slippage:
      toBN(0),
      // _callData:
      callData,
    ];

    return callParams;
  };
});
