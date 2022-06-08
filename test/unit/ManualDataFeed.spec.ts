import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ManualDataFeed, ManualDataFeed__factory, IOracleSidechain } from '@typechained';
import { smock, MockContract, MockContractFactory, FakeContract } from '@defi-wonderland/smock';
import { evm, bn } from '@utils';
import chai, { expect } from 'chai';

chai.use(smock.matchers);

describe('ManualDataFeed.sol - unit testing', () => {
  let deployer: SignerWithAddress;
  let randomUser: SignerWithAddress;
  let manualDataFeed: MockContract<ManualDataFeed>;
  let manualDataFeedFactory: MockContractFactory<ManualDataFeed__factory>;
  let oracleSidechain: FakeContract<IOracleSidechain>;
  let snapshotId: string;

  before(async () => {
    [, deployer, randomUser] = await ethers.getSigners();
    oracleSidechain = await smock.fake('IOracleSidechain');
    manualDataFeedFactory = await smock.mock('ManualDataFeed');
    manualDataFeed = await manualDataFeedFactory.connect(deployer).deploy(oracleSidechain.address);
    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('constructor(...)', () => {
    it('should initialize the oracleSidechain interface', async () => {
      let oracleSidechainInterface = await manualDataFeed.oracleSidechain();
      expect(oracleSidechainInterface).to.eq(oracleSidechain.address);
    });
  });

  describe('addObservation(...)', () => {
    let writeTimestamp: number;
    let tick = bn.toBN(100);
    let liquidity = bn.toBN(500);

    beforeEach(async () => {
      writeTimestamp = (await ethers.provider.getBlock('latest')).timestamp + 1;
      oracleSidechain.write.whenCalledWith(writeTimestamp, tick, liquidity).returns(true);
    });

    it('should revert if the observation is not writable', async () => {
      oracleSidechain.write.whenCalledWith(writeTimestamp, tick, liquidity).returns(false);
      await expect(manualDataFeed.addObservation(writeTimestamp, tick, liquidity)).to.be.revertedWith(
        `ObservationNotWritable(${writeTimestamp})`
      );
    });

    it('should emit ObservationAdded', async () => {
      await expect(manualDataFeed.connect(randomUser).addObservation(writeTimestamp, tick, liquidity))
        .to.emit(manualDataFeed, 'ObservationAdded')
        .withArgs(randomUser.address, writeTimestamp, tick, liquidity);
    });
  });
});
