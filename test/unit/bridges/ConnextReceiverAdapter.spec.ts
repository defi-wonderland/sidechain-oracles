import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
  ConnextReceiverAdapterForTest,
  ConnextReceiverAdapterForTest__factory,
  ExecutorForTest,
  ExecutorForTest__factory,
  IConnextHandler,
  IConnextSenderAdapter,
  IDataReceiver,
} from '@typechained';
import { smock, MockContract, MockContractFactory, FakeContract } from '@defi-wonderland/smock';
import { evm, wallet } from '@utils';
import { VALID_POOL_SALT } from '@utils/constants';
import { readArgFromEvent } from '@utils/event-utils';
import { getRandomBytes32 } from '@utils/misc';
import chai, { expect } from 'chai';

chai.use(smock.matchers);

describe('ConnextReceiverAdapter.sol', () => {
  let randomUser: SignerWithAddress;
  let connextReceiverAdapter: MockContract<ConnextReceiverAdapterForTest>;
  let connextReceiverAdapterFactory: MockContractFactory<ConnextReceiverAdapterForTest__factory>;
  let executor: MockContract<ExecutorForTest>;
  let executorFactory: MockContractFactory<ExecutorForTest__factory>;
  let connextHandler: FakeContract<IConnextHandler>;
  let connextSenderAdapter: FakeContract<IConnextSenderAdapter>;
  let dataReceiver: FakeContract<IDataReceiver>;
  let snapshotId: string;

  const randomOriginSender = wallet.generateRandomAddress();
  const randomOriginId = 3;
  const rinkebyOriginId = 1111;

  const randomSalt = VALID_POOL_SALT;

  before(async () => {
    [, randomUser] = await ethers.getSigners();
    connextHandler = await smock.fake('IConnextHandler');
    connextSenderAdapter = await smock.fake('IConnextHandler');
    dataReceiver = await smock.fake('IDataReceiver');

    executorFactory = await smock.mock('ExecutorForTest');
    executor = await executorFactory.deploy(connextHandler.address);

    connextHandler.executor.returns(executor.address);

    connextReceiverAdapterFactory = await smock.mock('ConnextReceiverAdapterForTest');
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

  describe('constructor(...)', () => {
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

  describe('addObservations(...)', async () => {
    let blockTimestamp1 = 1000000;
    let tick1 = 100;
    let observationData1 = [blockTimestamp1, tick1];
    let blockTimestamp2 = 3000000;
    let tick2 = 300;
    let observationData2 = [blockTimestamp2, tick2];
    let observationsData = [observationData1, observationData2];

    context('when the origin sender is not allowed', async () => {
      it('should revert', async () => {
        await expect(
          executor.permissionlessExecute(randomOriginSender, connextReceiverAdapter.address, rinkebyOriginId, observationsData, randomSalt)
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
            observationsData,
            randomSalt
          )
        ).to.be.revertedWith('UnauthorizedCaller()');
      });
    });

    context('when the caller is not the executor contract', async () => {
      it('should revert', async () => {
        await expect(connextReceiverAdapter.connect(randomUser).addObservations(observationsData, randomSalt)).to.be.revertedWith(
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
            observationsData,
            randomSalt
          )
        ).not.to.be.reverted;
      });

      it('should call data receiver with the correct arguments', async () => {
        dataReceiver.addObservations.reset();
        await connextReceiverAdapter.addPermissionlessObservations(observationsData, randomSalt);
        expect(dataReceiver.addObservations).to.have.been.calledOnceWith(observationsData, randomSalt);
      });

      it('should emit an event', async () => {
        let tx = await connextReceiverAdapter.addPermissionlessObservations(observationsData, randomSalt);
        let eventObservationsData = await readArgFromEvent(tx, 'DataSent', '_observationsData');
        let eventPoolSalt = await readArgFromEvent(tx, 'DataSent', '_poolSalt');
        expect(eventObservationsData).to.eql(observationsData);
        expect(eventPoolSalt).to.eq(randomSalt);
      });
    });
  });
});
