import { evm, wallet, bn } from '@utils';
import { getNodeUrl } from 'utils/env';
import { deployments, getNamedAccounts, ethers } from 'hardhat';
import * as Type from '@typechained';
import { getContractFromFixture } from '@utils/contracts';
import forkBlockNumber from './fork-block-numbers';

import { Contract } from 'ethers';
import { RANDOM_CHAIN_ID } from '@utils/constants';
import { calculateSalt } from '@utils/misc';
import { TEST_FEE } from '../../utils/constants';
import { expect } from 'chai';

describe('@skip-on-coverage Fixture', () => {
  let deployer: string;
  let dataFeed: Type.DataFeed;
  let dataFeedKeeper: Type.DataFeedKeeper;
  let dataReceiver: Type.DataReceiver;
  let oracleFactory: Type.OracleFactory;
  let oracleSidechain: Type.OracleSidechain;
  let uniV3Pool: Type.IUniswapV3Pool;
  let uniV3Factory: Type.IUniswapV3Factory;
  let tokenA: Type.IERC20;
  let tokenB: Type.IERC20;

  let senderAdapter: Contract;
  let receiverAdapter: Contract;

  let poolSalt: string;

  before(async () => {
    ({ deployer } = await getNamedAccounts());

    await evm.reset({
      jsonRpcUrl: getNodeUrl('goerli'),
      blockNumber: forkBlockNumber.goerli,
    });
  });

  describe('test setup', () => {
    beforeEach(async () => {
      await deployments.fixture(['dummy-test-setup']);

      oracleFactory = (await getContractFromFixture('OracleFactory')) as Type.OracleFactory;
      dataFeed = (await getContractFromFixture('DataFeed')) as Type.DataFeed;
      dataFeedKeeper = (await getContractFromFixture('DataFeedKeeper')) as Type.DataFeedKeeper;
      dataReceiver = (await getContractFromFixture('DataReceiver')) as Type.DataReceiver;

      senderAdapter = await getContractFromFixture('DummyAdapterForTest');
      receiverAdapter = await getContractFromFixture('DummyAdapterForTest');
    });

    it('should set correct test settings', async () => {
      expect(await oracleFactory.dataReceiver()).to.eq(dataReceiver.address);
      expect(await dataReceiver.oracleFactory()).to.eq(oracleFactory.address);
      expect(await dataFeed.keeper()).to.eq(dataFeedKeeper.address);
      expect(await dataFeedKeeper.dataFeed()).to.eq(dataFeed.address);

      expect(await dataFeed.whitelistedAdapters(senderAdapter.address)).to.be.true;
      expect(await dataReceiver.whitelistedAdapters(receiverAdapter.address)).to.be.true;
    });

    describe('when pool is deployed', () => {
      beforeEach(async () => {
        await deployments.fixture(['create-pool'], { keepExistingDeployments: true });

        tokenA = (await getContractFromFixture('TokenA', 'ERC20ForTest')) as Type.IERC20;
        tokenB = (await getContractFromFixture('TokenB', 'ERC20ForTest')) as Type.IERC20;
        uniV3Pool = (await getContractFromFixture('UniV3Pool', 'IUniswapV3Pool')) as Type.IUniswapV3Pool;
        poolSalt = calculateSalt(tokenA.address, tokenB.address, TEST_FEE);
        await evm.advanceTimeAndBlock(86400 * 5); // avoids !OLD error
      });

      describe('when the job is setup', () => {
        beforeEach(async () => {
          await setupJob(dataFeedKeeper.address);
        });

        it('should be able to fetch observations', async () => {
          await expect(dataFeedKeeper['work(bytes32)'](poolSalt)).not.to.be.reverted;
        });

        it('should be able to send fetched observations', async () => {
          const tx = await dataFeedKeeper['work(bytes32)'](poolSalt);
          const txReceipt = await tx.wait();
          const fetchData = dataFeed.interface.decodeEventLog('PoolObserved', txReceipt.logs![1].data);

          await expect(
            dataFeedKeeper['work(uint16,bytes32,uint24,(uint32,int24)[])'](
              RANDOM_CHAIN_ID,
              poolSalt,
              fetchData._poolNonce,
              fetchData._observationsData
            )
          ).not.to.be.reverted;

          const oracleAddress = await oracleFactory.getPool(tokenA.address, tokenB.address, TEST_FEE);
          oracleSidechain = (await ethers.getContractAt('OracleSidechain', oracleAddress)) as Type.OracleSidechain;

          expect((await oracleSidechain.slot0()).observationCardinality).to.eq(144);
        });
      });
    });
  });

  describe('production setup', () => {
    beforeEach(async () => {
      await deployments.fixture(['receiver-stage-1']);
      await deployments.fixture(['sender-stage-1'], { keepExistingDeployments: true });
      await deployments.fixture(['receiver-stage-2'], { keepExistingDeployments: true });
      await deployments.fixture(['sender-stage-2'], { keepExistingDeployments: true });
      await deployments.fixture(['token-actions'], { keepExistingDeployments: true });

      dataFeedKeeper = (await getContractFromFixture('DataFeedKeeper')) as Type.DataFeedKeeper;

      await evm.advanceTimeAndBlock(86400 * 5); // avoids !OLD error
      await setupJob(dataFeedKeeper.address);
    });

    // NOTE: reverts at ConnextBridge: 0x6c9a905ab3f4495e2b47f5ca131ab71281e0546e
    it.skip('should work', async () => {
      await deployments.fixture(['send-observation'], { keepExistingDeployments: true });
    });
  });
});

/* HELPER FUNCTIONS */

const setupJob = async (jobAddress: string) => {
  const { deployer, keep3r, keep3rGovernance } = await getNamedAccounts();

  const keep3rContract = (await ethers.getContractAt('IKeep3r', keep3r)) as Type.IKeep3r;
  const erc20 = await (await ethers.getContractFactory('ERC20ForTest')).deploy('Token', 'TKN', deployer, 0);
  // registers signer as Keeper
  await keep3rContract.bond(erc20.address, 0);
  await evm.advanceTimeAndBlock(86400 * 3);
  await keep3rContract.activate(erc20.address);

  // registers job to Keep3r
  await keep3rContract.addJob(jobAddress);

  // force KP3R credits to job
  await wallet.setBalance(keep3rGovernance, bn.toUnit(10));
  const governor = await wallet.impersonate(keep3rGovernance);
  await keep3rContract.connect(governor).forceLiquidityCreditsToJob(jobAddress, bn.toUnit(10));
};
