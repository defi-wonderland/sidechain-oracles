import { ethers, network } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { OracleFactory, OracleSidechain, DataReceiver } from '@typechained';
import { evm, wallet } from '@utils';
import { KP3R, WETH, FEE } from '@utils/constants';
import { toUnit } from '@utils/bn';
import { onlyDataReceiver, onlyGovernance } from '@utils/behaviours';
import { getNodeUrl } from 'utils/env';
import forkBlockNumber from './fork-block-numbers';
import { setupContracts } from './common';
import { expect } from 'chai';

describe('@skip-on-coverage OracleFactory.sol', () => {
  let governance: SignerWithAddress;
  let dataReceiverAdapterSigner: SignerWithAddress;
  let dataReceiver: DataReceiver;
  let oracleFactory: OracleFactory;
  let oracleSidechain: OracleSidechain;
  let oracleSidechainAddress: string;
  let snapshotId: string;

  const randomAddress = wallet.generateRandomAddress();

  before(async () => {
    await evm.reset({
      jsonRpcUrl: getNodeUrl('ethereum'),
      blockNumber: forkBlockNumber.oracleSidechain,
    });

    ({ governance, dataReceiver, oracleFactory, oracleSidechain } = await setupContracts());
    oracleSidechainAddress = oracleSidechain.address;

    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('deploying oracle', () => {
    beforeEach(async () => {
      await network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [dataReceiver.address],
      });
      await wallet.setBalance(dataReceiver.address, toUnit(10));
      dataReceiverAdapterSigner = await ethers.getSigner(dataReceiver.address);
    });

    onlyDataReceiver(
      () => oracleFactory,
      'deployOracle(address,address,uint24)',
      () => dataReceiverAdapterSigner,
      () => [KP3R, WETH, FEE]
    );

    context('when the caller is the data receiver', () => {
      it('should deploy an oracle', async () => {
        expect(await ethers.provider.getCode(oracleSidechainAddress)).to.eq('0x');
        await oracleFactory.connect(dataReceiverAdapterSigner).deployOracle(KP3R, WETH, FEE);
        expect((await ethers.provider.getCode(oracleSidechainAddress)).length).to.be.gt(100);
      });

      it('should add the deployed oracle to the getPool mapping with the sorted tokens and fee as keys', async () => {
        await oracleFactory.connect(dataReceiverAdapterSigner).deployOracle(KP3R, WETH, FEE);
        expect(await oracleFactory.getPool(KP3R, WETH, FEE)).to.eq(oracleSidechainAddress);
      });

      it('should add the deployed oracle to the getPool mapping with the unsorted tokens and fee as keys', async () => {
        await oracleFactory.connect(dataReceiverAdapterSigner).deployOracle(KP3R, WETH, FEE);
        expect(await oracleFactory.getPool(WETH, KP3R, FEE)).to.eq(oracleSidechainAddress);
      });

      it('should return the same address as the precalculated one', async () => {
        const trueOracleAddress = await oracleFactory.connect(dataReceiverAdapterSigner).callStatic.deployOracle(KP3R, WETH, FEE);
        expect(trueOracleAddress).to.be.eq(oracleSidechainAddress);
      });
    });
  });

  describe('setting data receiver', () => {
    onlyGovernance(
      () => oracleFactory,
      'setDataReceiver(address)',
      () => governance.address,
      () => [randomAddress]
    );
  });
});
