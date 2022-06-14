import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { FakeContract, MockContract, MockContractFactory, smock } from '@defi-wonderland/smock';
import { ConnextSenderAdapter, ConnextSenderAdapter__factory, IConnextHandler } from '@typechained';
import { evm, wallet } from '@utils';
import { ethers } from 'hardhat';
import chai, { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ZERO_ADDRESS } from '@utils/constants';
import { toBN } from '@utils/bn';

chai.use(smock.matchers);

describe('ConnextSenderAdapter', () => {
  let randomUser: SignerWithAddress;
  let connextSenderAdapter: MockContract<ConnextSenderAdapter>;
  let connextSenderAdapterFactory: MockContractFactory<ConnextSenderAdapter__factory>;
  let connextReceiver: FakeContract<IConnextHandler>;
  let snapshotId: string;

  const randomDataReceiverAddress = wallet.generateRandomAddress();
  const randomDestinationDomainId = 3;
  const randomOriginDomainId = 1;
  const tick = toBN(100);

  before(async () => {
    [, randomUser] = await ethers.getSigners();
    connextReceiver = await smock.fake('IConnextHandler');

    connextSenderAdapterFactory = await smock.mock<ConnextSenderAdapter__factory>('ConnextSenderAdapter');
    connextSenderAdapter = await connextSenderAdapterFactory.deploy(connextReceiver.address);

    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('constructor', () => {
    it('should initialize connext receiver to the address passed to the constructor', async () => {
      expect(await connextSenderAdapter.connext()).to.eq(connextReceiver.address);
    });
  });

  describe('bridgeManualObservation', () => {
    let blockTimestamp: number;

    before(async () => {
      blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp + 1;
    });

    it('should call xCall with the correct arguments', async () => {
      const xcallArgs = await prepareData(blockTimestamp);
      await connextSenderAdapter
        .connect(randomUser)
        .bridgeManualObservation(randomDataReceiverAddress, randomOriginDomainId, randomDestinationDomainId, blockTimestamp, tick);
      expect(connextReceiver.xcall).to.have.been.calledOnceWith(xcallArgs);
    });

    it('should emit an event', async () => {
      await expect(
        await connextSenderAdapter
          .connect(randomUser)
          .bridgeManualObservation(randomDataReceiverAddress, randomOriginDomainId, randomDestinationDomainId, blockTimestamp, tick)
      )
        .to.emit(connextSenderAdapter, 'DataSent')
        .withArgs(randomDataReceiverAddress, randomOriginDomainId, randomDestinationDomainId, blockTimestamp, tick);
    });
  });

  const prepareData = async (blockTimestamp: number) => {
    const ABI = ['function addObservation(uint32,int24)'];
    const helperInterface = new ethers.utils.Interface(ABI);
    const callData = helperInterface.encodeFunctionData('addObservation', [blockTimestamp, tick]);
    const callParams = {
      to: randomDataReceiverAddress,
      callData,
      originDomain: randomOriginDomainId,
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
