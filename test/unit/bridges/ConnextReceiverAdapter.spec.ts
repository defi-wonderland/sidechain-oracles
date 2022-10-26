import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
  ConnextReceiverAdapter,
  ConnextReceiverAdapter__factory,
  IConnextSenderAdapter,
  IDataReceiver,
  ConnextHandlerForTest,
} from '@typechained';
import { smock, MockContract, MockContractFactory, FakeContract } from '@defi-wonderland/smock';
import { evm, wallet, bn } from '@utils';
import { VALID_POOL_SALT, ZERO_ADDRESS, ZERO_BYTES_32 } from '@utils/constants';
import { readArgFromEvent } from '@utils/event-utils';
import chai, { expect } from 'chai';

chai.use(smock.matchers);

describe('ConnextReceiverAdapter.sol', () => {
  let randomUser: SignerWithAddress;
  let connextReceiverAdapterFactory: MockContractFactory<ConnextReceiverAdapter__factory>;
  let connextReceiverAdapter: MockContract<ConnextReceiverAdapter>;
  let connextHandler: FakeContract<ConnextHandlerForTest>;
  let connextSenderAdapter: FakeContract<IConnextSenderAdapter>;
  let dataReceiver: FakeContract<IDataReceiver>;
  let snapshotId: string;

  const rinkebyOriginId = 1111;

  const randomSalt = VALID_POOL_SALT;

  before(async () => {
    [, randomUser] = await ethers.getSigners();
    connextHandler = await smock.fake('ConnextHandlerForTest');
    connextSenderAdapter = await smock.fake('IConnextSenderAdapter');
    dataReceiver = await smock.fake('IDataReceiver');

    connextReceiverAdapterFactory = await smock.mock('ConnextReceiverAdapter');
    connextReceiverAdapter = await connextReceiverAdapterFactory.deploy(
      dataReceiver.address,
      connextSenderAdapter.address,
      rinkebyOriginId,
      connextHandler.address
    );

    await wallet.setBalance(connextHandler.address, bn.toUnit(1));

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
      expect(await connextReceiverAdapter.connext()).to.eq(connextHandler.address);
    });
    it('should initialize origin contract to the address passed to the constructor', async () => {
      expect(await connextReceiverAdapter.source()).to.eq(connextSenderAdapter.address);
    });
    it('should initialize origin domain id to the id passed to the constructor', async () => {
      expect(await connextReceiverAdapter.originDomain()).to.eq(rinkebyOriginId);
    });
  });

  describe('xReceive(...)', async () => {
    let blockTimestamp1 = 1000000;
    let tick1 = 100;
    let observationData1 = [blockTimestamp1, tick1];
    let blockTimestamp2 = 3000000;
    let tick2 = 300;
    let observationData2 = [blockTimestamp2, tick2];
    let observationsData = [observationData1, observationData2];
    let randomNonce = 420;
    let xReceiveParams: any[];

    xReceiveParams = [ZERO_BYTES_32, 0, ZERO_ADDRESS, ZERO_ADDRESS, rinkebyOriginId];
    let callData: string = ethers.utils.defaultAbiCoder.encode(
      ['(uint32,int24)[]', 'bytes32', 'uint24'],
      [observationsData, randomSalt, randomNonce]
    );

    beforeEach(async () => {
      dataReceiver.addObservations.reset();
    });

    context('when the origin sender is not allowed', async () => {
      it('should revert', async () => {
        await expect(connextReceiverAdapter.xReceive(...xReceiveParams, callData)).to.be.revertedWith('UnauthorizedCaller()');
      });
    });

    context('when the origin chain is not allowed', async () => {
      beforeEach(async () => {
        xReceiveParams = [ZERO_BYTES_32, 0, ZERO_ADDRESS, connextSenderAdapter.address, 0];
      });

      it('should revert', async () => {
        await expect(connextReceiverAdapter.xReceive(...xReceiveParams, callData)).to.be.revertedWith('UnauthorizedCaller()');
      });
    });

    context('when the executor is the caller and origin sender and domain are correct', async () => {
      beforeEach(async () => {
        xReceiveParams = [ZERO_BYTES_32, 0, ZERO_ADDRESS, connextSenderAdapter.address, rinkebyOriginId];
      });

      it('should revert if caller is not the executor contract', async () => {
        await expect(connextReceiverAdapter.connect(randomUser).xReceive(...xReceiveParams, callData)).to.be.revertedWith(
          'UnauthorizedCaller()'
        );
      });

      it('should call data receiver with the correct arguments', async () => {
        await connextReceiverAdapter.connect(connextHandler.wallet).xReceive(...xReceiveParams, callData);
        expect(dataReceiver.addObservations).to.have.been.calledOnceWith(observationsData, randomSalt, randomNonce);
      });

      it('should emit an event', async () => {
        const tx = await connextReceiverAdapter.connect(connextHandler.wallet).xReceive(...xReceiveParams, callData);
        let eventObservationsData = await readArgFromEvent(tx, 'DataSent', '_observationsData');
        let eventPoolSalt = await readArgFromEvent(tx, 'DataSent', '_poolSalt');

        expect(eventObservationsData).to.eql(observationsData);
        expect(eventPoolSalt).to.eq(randomSalt);
      });
    });
  });
});
