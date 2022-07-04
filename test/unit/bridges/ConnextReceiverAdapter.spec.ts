import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { FakeContract, MockContract, MockContractFactory, smock } from '@defi-wonderland/smock';
import {
  ConnextReceiverAdapterForTest,
  ConnextReceiverAdapterForTest__factory,
  ExecutorForTest,
  ExecutorForTest__factory,
  IConnextHandler,
  IConnextSenderAdapter,
  IDataReceiver,
  IExecutor,
} from '@typechained';
import { evm, wallet } from '@utils';
import { ethers } from 'hardhat';
import chai, { expect } from 'chai';
import { toBN } from '@utils/bn';

chai.use(smock.matchers);

describe('ConnextReceiverAdapter.sol', () => {
  let randomUser: SignerWithAddress;
  let connextReceiverAdapter: MockContract<ConnextReceiverAdapterForTest>;
  let connextReceiverAdapterFactory: MockContractFactory<ConnextReceiverAdapterForTest__factory>;
  let executor: MockContract<ExecutorForTest>;
  let executorFactory: MockContractFactory<ExecutorForTest__factory>;
  let dataReceiver: FakeContract<IDataReceiver>;
  let connextHandler: FakeContract<IConnextHandler>;
  let connextSenderAdapter: FakeContract<IConnextSenderAdapter>;
  let snapshotId: string;

  const rinkebyOriginId = 1111;
  const randomTick = toBN(100);
  const randomTimestamp = 160000000;
  const randomOriginSender = wallet.generateRandomAddress();
  const randomOriginId = 3;

  before(async () => {
    [, randomUser] = await ethers.getSigners();
    dataReceiver = await smock.fake('IDataReceiver');
    connextHandler = await smock.fake('IConnextHandler');
    connextSenderAdapter = await smock.fake('IConnextHandler');

    executorFactory = await smock.mock<ExecutorForTest__factory>('ExecutorForTest');
    executor = await executorFactory.deploy(connextHandler.address);

    connextHandler.executor.returns(executor.address);

    connextReceiverAdapterFactory = await smock.mock<ConnextReceiverAdapterForTest__factory>('ConnextReceiverAdapterForTest');
    connextReceiverAdapter = await connextReceiverAdapterFactory.deploy(
      dataReceiver.address,
      connextSenderAdapter.address,
      rinkebyOriginId,
      connextHandler.address
    );

    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('constructor', () => {
    it('should initialize data receiver to the address passed to the constructor', async () => {
      expect(await connextReceiverAdapter.dataReceiver()).to.eq(dataReceiver.address);
    });
    it('should initialize executor to the address passed to the constructor', async () => {
      expect(await connextReceiverAdapter.executor()).to.eq(executor.address);
    });
    it('should initialize origin contract to the address passed to the constructor', async () => {
      expect(await connextReceiverAdapter.originContract()).to.eq(connextSenderAdapter.address);
    });
    it('should initialize origin domain id to the id passed to the constructor', async () => {
      expect(await connextReceiverAdapter.originDomain()).to.eq(rinkebyOriginId);
    });
  });

  describe('addObservation', async () => {
    context('when the origin sender is not allowed', async () => {
      it('should revert', async () => {
        await expect(
          executor.permissionlessExecute(randomOriginSender, connextReceiverAdapter.address, rinkebyOriginId, randomTimestamp, randomTick)
        ).to.be.revertedWith('UnauthorizedCaller()');
      });
    });

    context('when the origin contract is not allowed', async () => {
      it('should revert', async () => {
        await expect(
          executor.permissionlessExecute(
            connextSenderAdapter.address,
            connextReceiverAdapter.address,
            randomOriginId,
            randomTimestamp,
            randomTick
          )
        ).to.be.revertedWith('UnauthorizedCaller()');
      });
    });

    context('when the caller is not the executor contract', async () => {
      it('should revert', async () => {
        await expect(connextReceiverAdapter.connect(randomUser).addObservation(randomTimestamp, randomTick)).to.be.revertedWith(
          'UnauthorizedCaller()'
        );
      });
    });

    context('when the executor is the caller and origin sender and domain are correct', async () => {
      it('should complete the call successfully', async () => {
        await expect(
          executor.permissionlessExecute(
            connextSenderAdapter.address,
            connextReceiverAdapter.address,
            rinkebyOriginId,
            randomTimestamp,
            randomTick
          )
        ).not.to.be.reverted;
      });

      it('should call data receiver with the correct arguments', async () => {
        connextReceiverAdapter.addObservation.reset();
        dataReceiver.addObservation.reset();

        await connextReceiverAdapter.addPermissionlessObservation(randomTimestamp, randomTick);
        expect(dataReceiver.addObservation).to.have.been.calledOnceWith(randomTimestamp, randomTick);
      });

      it('should emit an event', async () => {
        await expect(await connextReceiverAdapter.addPermissionlessObservation(randomTimestamp, randomTick))
          .to.emit(connextReceiverAdapter, 'ObservationSent')
          .withArgs(randomTimestamp, randomTick);
      });
    });
  });
});
