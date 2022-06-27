import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ConnextSenderAdapter, ConnextSenderAdapter__factory, IConnextHandler } from '@typechained';
import { smock, MockContract, MockContractFactory, FakeContract } from '@defi-wonderland/smock';
import { evm, wallet } from '@utils';
import { ZERO_ADDRESS } from '@utils/constants';
import { toBN } from '@utils/bn';
import { onlyDataFeed } from '@utils/behaviours';
import chai, { expect } from 'chai';

chai.use(smock.matchers);

describe('ConnextSenderAdapter.sol', () => {
  let randomUser: SignerWithAddress;
  let randomFeed: SignerWithAddress;
  let connextSenderAdapter: MockContract<ConnextSenderAdapter>;
  let connextSenderAdapterFactory: MockContractFactory<ConnextSenderAdapter__factory>;
  let connextReceiver: FakeContract<IConnextHandler>;
  let snapshotId: string;

  const randomDataReceiverAddress = wallet.generateRandomAddress();
  const randomDestinationDomainId = 3;
  const rinkebyOriginId = 1111;
  const arithmeticMeanTick = toBN(100);

  before(async () => {
    [, randomUser, randomFeed] = await ethers.getSigners();
    connextReceiver = await smock.fake('IConnextHandler');

    connextSenderAdapterFactory = await smock.mock('ConnextSenderAdapter');
    connextSenderAdapter = await connextSenderAdapterFactory.deploy(connextReceiver.address, randomFeed.address);

    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('constructor', () => {
    it('should initialize connext receiver to the address passed to the constructor', async () => {
      expect(await connextSenderAdapter.connext()).to.eq(connextReceiver.address);
    });
    it('should initialize data feed to the address passed to the constructor', async () => {
      expect(await connextSenderAdapter.dataFeed()).to.eq(randomFeed.address);
    });
  });

  describe('bridgeObservation', () => {
    let arithmeticMeanBlockTimestamp: number;

    before(async () => {
      arithmeticMeanBlockTimestamp = (await ethers.provider.getBlock('latest')).timestamp + 1;
    });

    it('should call xCall with the correct arguments', async () => {
      const xcallArgs = await prepareData(arithmeticMeanBlockTimestamp);
      await connextSenderAdapter
        .connect(randomFeed)
        .bridgeObservation(randomDataReceiverAddress, randomDestinationDomainId, arithmeticMeanBlockTimestamp, arithmeticMeanTick);
      expect(connextReceiver.xcall).to.have.been.calledOnceWith(xcallArgs);
    });

    it('should emit an event', async () => {
      await expect(
        await connextSenderAdapter
          .connect(randomFeed)
          .bridgeObservation(randomDataReceiverAddress, randomDestinationDomainId, arithmeticMeanBlockTimestamp, arithmeticMeanTick)
      )
        .to.emit(connextSenderAdapter, 'DataSent')
        .withArgs(randomDataReceiverAddress, rinkebyOriginId, randomDestinationDomainId, arithmeticMeanBlockTimestamp, arithmeticMeanTick);
    });

    onlyDataFeed(
      () => connextSenderAdapter,
      'bridgeObservation',
      () => randomFeed,
      () => [randomDataReceiverAddress, randomDestinationDomainId, arithmeticMeanBlockTimestamp, arithmeticMeanTick]
    );
  });

  const prepareData = async (arithmeticMeanBlockTimestamp: number) => {
    const ABI = ['function addObservation(uint32,int24)'];
    const helperInterface = new ethers.utils.Interface(ABI);
    const callData = helperInterface.encodeFunctionData('addObservation', [arithmeticMeanBlockTimestamp, arithmeticMeanTick]);
    const callParams = {
      to: randomDataReceiverAddress,
      callData,
      originDomain: rinkebyOriginId,
      destinationDomain: randomDestinationDomainId,
      recovery: randomDataReceiverAddress,
      callback: ZERO_ADDRESS,
      callbackFee: BigNumber.from(0),
      forceSlow: false,
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
