import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { DataFeed, DataFeed__factory, IConnextSenderAdapter, IUniswapV3Pool } from '@typechained';
import { smock, MockContract, MockContractFactory, FakeContract } from '@defi-wonderland/smock';
import { evm, wallet } from '@utils';
import chai, { expect } from 'chai';

chai.use(smock.matchers);

describe('DataFeed.sol', () => {
  let randomUser: SignerWithAddress;
  let dataFeed: MockContract<DataFeed>;
  let dataFeedFactory: MockContractFactory<DataFeed__factory>;
  let connextSenderAdapter: FakeContract<IConnextSenderAdapter>;
  let uniswapV3K3PR: FakeContract<IUniswapV3Pool>;
  let snapshotId: string;

  const randomDataReceiverAddress = wallet.generateRandomAddress();
  const randomDestinationDomainId = 3;
  const randomOriginDomainId = 1;

  before(async () => {
    [, randomUser] = await ethers.getSigners();

    connextSenderAdapter = await smock.fake('IConnextSenderAdapter');
    uniswapV3K3PR = await smock.fake('IUniswapV3Pool');

    dataFeedFactory = await smock.mock<DataFeed__factory>('DataFeed');
    dataFeed = await dataFeedFactory.deploy(connextSenderAdapter.address);

    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('constructor(...)', () => {
    it('should initialize connext sender to the address passed to the constructor', async () => {
      expect(await dataFeed.connextSender()).to.eq(connextSenderAdapter.address);
    });
  });

  describe('sendObservation(...)', () => {
    let blockTimestamp: number;
    let tick: number;

    before(async () => {
      let observationIndex = 0;
      let observationCardinality = 3;
      let blockTimestampsDelta = 2;
      blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp + 1;
      let blockTimestampBefore = blockTimestamp - blockTimestampsDelta;
      let tickCumulativesDelta = 2000;
      let tickCumulative = 3000;
      let tickCumulativeBefore = tickCumulative - tickCumulativesDelta;
      tick = tickCumulativesDelta / blockTimestampsDelta;
      uniswapV3K3PR.slot0.returns([0, 0, observationIndex, observationCardinality, 0, 0, 0]);
      uniswapV3K3PR.observations.whenCalledWith(observationIndex).returns([blockTimestamp, tickCumulative, 0, 0]);
      uniswapV3K3PR.observations.whenCalledWith(observationCardinality - 1).returns([blockTimestampBefore, tickCumulativeBefore, 0, 0]);
    });

    it('should call bridgeObservation with the correct arguments', async () => {
      await dataFeed.sendObservation(randomDataReceiverAddress, randomOriginDomainId, randomDestinationDomainId, uniswapV3K3PR.address);
      expect(connextSenderAdapter.bridgeObservation).to.have.been.calledOnceWith(
        randomDataReceiverAddress,
        randomOriginDomainId,
        randomDestinationDomainId,
        blockTimestamp,
        tick
      );
    });

    it('should emit an event', async () => {
      await expect(
        await dataFeed.sendObservation(randomDataReceiverAddress, randomOriginDomainId, randomDestinationDomainId, uniswapV3K3PR.address)
      )
        .to.emit(dataFeed, 'DataSent')
        .withArgs(randomDataReceiverAddress, randomOriginDomainId, randomDestinationDomainId, blockTimestamp, tick);
    });
  });

  describe('fetchLatestObservation(...)', () => {
    let expectedBlockTimestamp: number;
    let expectedTick: number;

    before(async () => {
      let observationIndex = 0;
      let observationCardinality = 3;
      let blockTimestampsDelta = 2;
      expectedBlockTimestamp = (await ethers.provider.getBlock('latest')).timestamp + 1;
      let blockTimestampBefore = expectedBlockTimestamp - blockTimestampsDelta;
      let tickCumulativesDelta = 2000;
      let tickCumulative = 3000;
      let tickCumulativeBefore = tickCumulative - tickCumulativesDelta;
      expectedTick = tickCumulativesDelta / blockTimestampsDelta;
      uniswapV3K3PR.slot0.returns([0, 0, observationIndex, observationCardinality, 0, 0, 0]);
      uniswapV3K3PR.observations.whenCalledWith(observationIndex).returns([expectedBlockTimestamp, tickCumulative, 0, 0]);
      uniswapV3K3PR.observations.whenCalledWith(observationCardinality - 1).returns([blockTimestampBefore, tickCumulativeBefore, 0, 0]);
    });

    it('should return the latest observation', async () => {
      let [blockTimestamp, tick] = await dataFeed.fetchLatestObservation(uniswapV3K3PR.address);
      expect(blockTimestamp).to.eq(expectedBlockTimestamp);
      expect(tick).to.eq(expectedTick);
    });
  });
});
