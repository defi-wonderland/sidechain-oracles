import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ManualDataFeed, ManualDataFeed__factory, IConnextSenderAdapter } from '@typechained';
import { smock, MockContract, MockContractFactory, FakeContract } from '@defi-wonderland/smock';
import { evm, wallet } from '@utils';
import { toBN } from '@utils/bn';
import chai, { expect } from 'chai';

chai.use(smock.matchers);

describe('ManualDataFeed', () => {
  let randomUser: SignerWithAddress;
  let manualDataFeed: MockContract<ManualDataFeed>;
  let manualDataFeedFactory: MockContractFactory<ManualDataFeed__factory>;
  let connextSenderAdapter: FakeContract<IConnextSenderAdapter>;
  let snapshotId: string;

  const randomDataReceiverAddress = wallet.generateRandomAddress();
  const randomDestinationDomainId = 3;
  const randomOriginDomainId = 1;
  const tick = toBN(100);

  before(async () => {
    [, randomUser] = await ethers.getSigners();
    connextSenderAdapter = await smock.fake('IConnextSenderAdapter');

    manualDataFeedFactory = await smock.mock<ManualDataFeed__factory>('ManualDataFeed');
    manualDataFeed = await manualDataFeedFactory.deploy(connextSenderAdapter.address);

    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('constructor', () => {
    it('should initialize connext sender to the address passed to the constructor', async () => {
      expect(await manualDataFeed.connextSender()).to.eq(connextSenderAdapter.address);
    });
  });

  describe('sendObservation', () => {
    let blockTimestamp: number;

    before(async () => {
      blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp + 1;
    });

    it('should call bridgeManualObservation with the correct arguments', async () => {
      await manualDataFeed.connect(randomUser).sendObservation(randomDataReceiverAddress, randomOriginDomainId, randomDestinationDomainId, tick);
      expect(connextSenderAdapter.bridgeManualObservation).to.have.been.calledOnceWith(
        randomDataReceiverAddress,
        randomOriginDomainId,
        randomDestinationDomainId,
        blockTimestamp,
        tick
      );
    });

    it('should emit an event', async () => {
      await expect(
        await manualDataFeed
          .connect(randomUser)
          .sendObservation(randomDataReceiverAddress, randomOriginDomainId, randomDestinationDomainId, tick)
      )
        .to.emit(manualDataFeed, 'DataSent')
        .withArgs(randomDataReceiverAddress, randomOriginDomainId, randomDestinationDomainId, blockTimestamp, tick);
    });
  });
});
