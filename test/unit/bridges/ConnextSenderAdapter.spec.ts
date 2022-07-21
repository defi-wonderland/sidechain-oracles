import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ConnextSenderAdapter, ConnextSenderAdapter__factory, IConnextHandler } from '@typechained';
import { smock, MockContract, MockContractFactory, FakeContract } from '@defi-wonderland/smock';
import { evm, wallet } from '@utils';
import { ZERO_ADDRESS } from '@utils/constants';
import { readArgFromEvent } from '@utils/event-utils';
import { onlyDataFeed } from '@utils/behaviours';
import chai, { expect } from 'chai';

chai.use(smock.matchers);

describe('ConnextSenderAdapter.sol', () => {
  let randomFeed: SignerWithAddress;
  let connextSenderAdapter: MockContract<ConnextSenderAdapter>;
  let connextSenderAdapterFactory: MockContractFactory<ConnextSenderAdapter__factory>;
  let connextHandler: FakeContract<IConnextHandler>;
  let snapshotId: string;

  const randomReceiverAdapterAddress = wallet.generateRandomAddress();
  const randomDestinationDomainId = 3;
  const rinkebyOriginId = 1111;

  const randomToken0 = wallet.generateRandomAddress();
  const randomToken1 = wallet.generateRandomAddress();
  const randomFee = 3000;

  before(async () => {
    [, randomFeed] = await ethers.getSigners();
    connextHandler = await smock.fake('IConnextHandler');

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

    it('should call xCall with the correct arguments', async () => {
      const xcallArgs = await prepareData(observationsData);
      await connextSenderAdapter
        .connect(randomFeed)
        .bridgeObservations(randomReceiverAdapterAddress, randomDestinationDomainId, observationsData, randomToken0, randomToken1, randomFee);
      expect(connextHandler.xcall).to.have.been.calledOnceWith(xcallArgs);
    });

    it('should emit an event', async () => {
      let tx = await connextSenderAdapter
        .connect(randomFeed)
        .bridgeObservations(randomReceiverAdapterAddress, randomDestinationDomainId, observationsData, randomToken0, randomToken1, randomFee);
      let eventTo = await readArgFromEvent(tx, 'DataSent', '_to');
      let eventOriginDomainId = await readArgFromEvent(tx, 'DataSent', '_originDomainId');
      let eventDestinationDomainId = await readArgFromEvent(tx, 'DataSent', '_destinationDomainId');
      let eventObservationsData = await readArgFromEvent(tx, 'DataSent', '_observationsData');
      let eventToken0 = await readArgFromEvent(tx, 'DataSent', '_token0');
      let eventToken1 = await readArgFromEvent(tx, 'DataSent', '_token1');
      let eventFee = await readArgFromEvent(tx, 'DataSent', '_fee');
      expect(eventTo).to.eq(randomReceiverAdapterAddress);
      expect(eventOriginDomainId).to.eq(rinkebyOriginId);
      expect(eventDestinationDomainId).to.eq(randomDestinationDomainId);
      expect(eventObservationsData).to.eql(observationsData);
      expect(eventToken0).to.eql(randomToken0);
      expect(eventToken1).to.eql(randomToken1);
      expect(eventFee).to.eql(randomFee);
    });

    onlyDataFeed(
      () => connextSenderAdapter,
      'bridgeObservations',
      () => randomFeed,
      () => [randomReceiverAdapterAddress, randomDestinationDomainId, observationsData, randomToken0, randomToken1, randomFee]
    );
  });

  const prepareData = async (observationsData: number[][]) => {
    const ABI = ['function addObservations((uint32,int24)[], address, address, uint24)'];
    const helperInterface = new ethers.utils.Interface(ABI);
    const callData = helperInterface.encodeFunctionData('addObservations', [observationsData, randomToken0, randomToken1, randomFee]);
    const callParams = {
      to: randomReceiverAdapterAddress,
      callData,
      originDomain: rinkebyOriginId,
      destinationDomain: randomDestinationDomainId,
      recovery: randomReceiverAdapterAddress,
      callback: ZERO_ADDRESS,
      callbackFee: BigNumber.from(0),
      forceSlow: true,
      receiveLocal: false,
    };
    const xcallArgs = {
      params: callParams,
      transactingAssetId: '0x3FFc03F05D1869f493c7dbf913E636C6280e0ff9',
      amount: BigNumber.from(0),
      relayerFee: BigNumber.from(0),
    };

    return xcallArgs;
  };
});
