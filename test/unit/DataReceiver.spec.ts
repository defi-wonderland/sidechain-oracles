import { ethers, network } from 'hardhat';
import { BigNumber } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { DataReceiver, DataReceiver__factory, IOracleSidechain } from '@typechained';
import { smock, MockContract, MockContractFactory, FakeContract } from '@defi-wonderland/smock';
import { evm } from '@utils';
import { toBN } from '@utils/bn';
import chai, { expect } from 'chai';

chai.use(smock.matchers);

describe('DataReceiver.sol', () => {
  let deployer: SignerWithAddress;
  let randomUser: SignerWithAddress;
  let dataReceiver: MockContract<DataReceiver>;
  let dataReceiverFactory: MockContractFactory<DataReceiver__factory>;
  let oracleSidechain: FakeContract<IOracleSidechain>;
  let snapshotId: string;

  before(async () => {
    [, deployer, randomUser] = await ethers.getSigners();
    oracleSidechain = await smock.fake('IOracleSidechain');
    dataReceiverFactory = await smock.mock('DataReceiver');
    dataReceiver = await dataReceiverFactory.connect(deployer).deploy(oracleSidechain.address);
    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('constructor(...)', () => {
    it('should initialize the oracleSidechain interface', async () => {
      let oracleSidechainInterface = await dataReceiver.oracleSidechain();
      expect(oracleSidechainInterface).to.eq(oracleSidechain.address);
    });
  });

  describe('addObservation(...)', () => {
    let writeTimestamp: number;
    let tick = 100;

    beforeEach(async () => {
      writeTimestamp = toBN((await network.provider.send('eth_getBlockByNumber', ['pending', false])).timestamp).toNumber();
      oracleSidechain.write.whenCalledWith(writeTimestamp, tick).returns(true);
    });

    it('should revert if the observation is not writable', async () => {
      oracleSidechain.write.whenCalledWith(writeTimestamp, tick).returns(false);
      await expect(dataReceiver.addObservation(writeTimestamp, tick)).to.be.revertedWith(`ObservationNotWritable(${writeTimestamp})`);
    });

    it('should emit ObservationAdded', async () => {
      await expect(dataReceiver.connect(randomUser).addObservation(writeTimestamp, tick))
        .to.emit(dataReceiver, 'ObservationAdded')
        .withArgs(randomUser.address, writeTimestamp, tick);
    });
  });
});
