import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { Keep3rJobForTest, Keep3rJobForTest__factory, IKeep3r } from '@typechained';
import { smock, MockContract, MockContractFactory, FakeContract } from '@defi-wonderland/smock';
import { evm, wallet } from '@utils';
import { KEEP3R } from '@utils/constants';
import chai, { expect } from 'chai';

chai.use(smock.matchers);

describe('Keep3rJob.sol', () => {
  let governor: SignerWithAddress;
  let keeper: SignerWithAddress;
  let keep3rJob: MockContract<Keep3rJobForTest>;
  let keep3rJobFactory: MockContractFactory<Keep3rJobForTest__factory>;
  let keep3r: FakeContract<IKeep3r>;
  let snapshotId: string;

  const randomAddress = wallet.generateRandomAddress();

  before(async () => {
    [, governor, keeper] = await ethers.getSigners();

    keep3r = await smock.fake('IKeep3r', { address: KEEP3R });
    keep3r.isKeeper.whenCalledWith(keeper.address).returns(true);

    keep3rJobFactory = await smock.mock('Keep3rJobForTest');
    keep3rJob = await keep3rJobFactory.deploy(governor.address);

    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('default values', () => {
    it('should return the default address for keep3r', async () => {
      expect(await keep3rJob.keep3r()).to.equal(KEEP3R);
    });
  });

  describe('setKeep3r(...)', () => {
    it('should set the keep3r', async () => {
      await keep3rJob.connect(governor).setKeep3r(randomAddress);
      expect(await keep3rJob.keep3r()).to.equal(randomAddress);
    });

    it('should emit event', async () => {
      await expect(keep3rJob.connect(governor).setKeep3r(randomAddress)).to.emit(keep3rJob, 'Keep3rSet').withArgs(randomAddress);
    });
  });

  // @notice I created an external function in the ForTest contract that calls _isValidKeeper to test it
  describe('_isValidKeeper(...)', () => {
    it('should call isKeeper with the correct arguments', async () => {
      await keep3rJob.internalIsValidKeeper(keeper.address);
      expect(keep3r.isKeeper).to.have.been.calledOnceWith(keeper.address);
    });

    it('should revert with the correct error', async () => {
      keep3r.isKeeper.whenCalledWith(randomAddress).returns(false);
      await expect(keep3rJob.internalIsValidKeeper(randomAddress)).to.be.revertedWith('KeeperNotValid()');
    });
  });
});
