import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { GovernableForTest, GovernableForTest__factory } from '@typechained';
import { smock, MockContract, MockContractFactory } from '@defi-wonderland/smock';
import { evm } from '@utils';
import { ZERO_ADDRESS } from '@utils/constants';
import { onlyGovernor, onlyPendingGovernor } from '@utils/behaviours';
import chai, { expect } from 'chai';

chai.use(smock.matchers);

describe('Governable.sol', () => {
  let governor: SignerWithAddress;
  let pendingGovernor: SignerWithAddress;
  let governable: MockContract<GovernableForTest>;
  let governableFactory: MockContractFactory<GovernableForTest__factory>;
  let snapshotId: string;

  before(async () => {
    [, governor, pendingGovernor] = await ethers.getSigners();

    governableFactory = await smock.mock('GovernableForTest');
    governable = await governableFactory.deploy(governor.address);

    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('constructor(...)', () => {
    it('should revert when given zero address', async () => {
      await expect(governableFactory.deploy(ZERO_ADDRESS)).to.be.revertedWith('ZeroAddress()');
    });

    it('should set governor', async () => {
      expect(await governable.governor()).to.eq(governor.address);
    });
  });

  describe('setPendingGovernor(...)', () => {
    onlyGovernor(
      () => governable,
      'setPendingGovernor',
      () => governor,
      () => [pendingGovernor.address]
    );

    it('should revert when given zero address', async () => {
      await expect(governable.connect(governor).setPendingGovernor(ZERO_ADDRESS)).to.be.revertedWith('ZeroAddress()');
    });

    it('should save given governor', async () => {
      await governable.connect(governor).setPendingGovernor(pendingGovernor.address);
      expect(await governable.pendingGovernor()).to.eq(pendingGovernor.address);
    });

    it('should emit event', async () => {
      await expect(governable.connect(governor).setPendingGovernor(pendingGovernor.address))
        .to.emit(governable, 'PendingGovernorSet')
        .withArgs(governor.address, pendingGovernor.address);
    });
  });

  describe('acceptPendingGovernor()', () => {
    beforeEach(async () => {
      await governable.setVariable('pendingGovernor', pendingGovernor.address);
    });

    onlyPendingGovernor(
      () => governable,
      'acceptPendingGovernor',
      () => pendingGovernor,
      []
    );

    it('should set pending governor as governor', async () => {
      await governable.connect(pendingGovernor).acceptPendingGovernor();
      expect(await governable.governor()).to.eq(pendingGovernor.address);
    });

    it('should reset pending governor', async () => {
      await governable.connect(pendingGovernor).acceptPendingGovernor();
      expect(await governable.pendingGovernor()).to.eq(ZERO_ADDRESS);
    });

    it('should emit event', async () => {
      await expect(governable.connect(pendingGovernor).acceptPendingGovernor())
        .to.emit(governable, 'PendingGovernorAccepted')
        .withArgs(pendingGovernor.address);
    });
  });
});
