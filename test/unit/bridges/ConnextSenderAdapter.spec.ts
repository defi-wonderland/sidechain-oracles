import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ConnextSenderAdapter, ConnextSenderAdapter__factory, ConnextHandlerForTest } from '@typechained';
import { smock, MockContract, MockContractFactory, FakeContract } from '@defi-wonderland/smock';
import { evm, wallet } from '@utils';
import { ZERO_ADDRESS, VALID_POOL_SALT } from '@utils/constants';
import { toBN } from '@utils/bn';
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
    it('should revert if connext is set to the zero address', async () => {
      await expect(connextSenderAdapterFactory.deploy(ZERO_ADDRESS, randomFeed.address)).to.be.revertedWith('ZeroAddress()');
    });

    it('should revert if dataFeed is set to the zero address', async () => {
      await expect(connextSenderAdapterFactory.deploy(connextHandler.address, ZERO_ADDRESS)).to.be.revertedWith('ZeroAddress()');
    });

    it('should initialize connext interface', async () => {
      expect(await connextSenderAdapter.connext()).to.eq(connextHandler.address);
    });
    it('should initialize dataFeed interface', async () => {
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
      ZERO_ADDRESS,
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
