import { ethers, deployments, getNamedAccounts } from 'hardhat';
import { Contract } from 'ethers';
import * as Type from '@typechained';
import { evm, wallet } from '@utils';
import { toUnit } from '@utils/bn';
import { getContractFromFixture } from '@utils/contracts';
import { calculateSalt } from '@utils/misc';
import { TEST_FEE } from 'utils/constants';
import { getNodeUrl } from 'utils/env';
import forkBlockNumber from './fork-block-numbers';
import { expect } from 'chai';

describe.skip('@skip-on-coverage Fixture', () => {
  let deployer: string;
  let dataFeed: Type.DataFeed;
  let dataFeedStrategy: Type.DataFeedStrategy;
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

  const NONE_TRIGGER = 0;
  const TIME_TRIGGER = 1;
  const TWAP_TRIGGER = 2;

  beforeEach(async () => {
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
      dataReceiver = (await getContractFromFixture('DataReceiver')) as Type.DataReceiver;

      senderAdapter = await getContractFromFixture('DummyAdapterForTest');
      receiverAdapter = await getContractFromFixture('DummyAdapterForTest');
    });

    it('should set correct test settings', async () => {
      expect(await oracleFactory.dataReceiver()).to.eq(dataReceiver.address);
      expect(await dataReceiver.oracleFactory()).to.eq(oracleFactory.address);
      expect(await dataFeed.keeper()).to.eq(deployer);

      expect(await dataFeed.whitelistedAdapters(senderAdapter.address)).to.be.true;
      expect(await dataReceiver.whitelistedAdapters(receiverAdapter.address)).to.be.true;
    });

    describe('when pool is deployed', () => {
      beforeEach(async () => {
        await deployments.fixture(['save-tokens'], { keepExistingDeployments: true });
        await deployments.fixture(['pool-whitelisting'], { keepExistingDeployments: true });

        tokenA = (await getContractFromFixture('TokenA', 'ERC20ForTest')) as Type.IERC20;
        tokenB = (await getContractFromFixture('TokenB', 'ERC20ForTest')) as Type.IERC20;
        uniV3Pool = (await getContractFromFixture('UniV3Pool', 'IUniswapV3Pool')) as Type.IUniswapV3Pool;
        poolSalt = calculateSalt(tokenA.address, tokenB.address, TEST_FEE);
        await evm.advanceTimeAndBlock(86400 * 5); // avoids !OLD error
      });

      it('should work with manual-send-test-observation fixture', async () => {
        await deployments.fixture(['manual-send-test-observation'], { keepExistingDeployments: true });
      });

      describe('when the job is setup', () => {
        beforeEach(async () => {
          await deployments.fixture(['setup-data-feed-keeper'], { keepExistingDeployments: true });
          await deployments.fixture(['setup-keeper'], { keepExistingDeployments: true });
          dataFeedStrategy = (await getContractFromFixture('DataFeedStrategy')) as Type.DataFeedStrategy;
          await addCreditsToJob(dataFeedStrategy.address);
        });

        it('should set correct test settings', async () => {
          expect(await dataFeed.keeper()).to.eq(dataFeedStrategy.address);
          expect(await dataFeedStrategy.dataFeed()).to.eq(dataFeed.address);
        });

        it('should be able to fetch observations', async () => {
          await expect(dataFeedStrategy['work(bytes32,uint8)'](poolSalt, TIME_TRIGGER)).not.to.be.reverted;
        });

        context('when dummy adapter is setup', () => {
          beforeEach(async () => {
            await deployments.fixture(['dummy-keeper-setup'], { keepExistingDeployments: true });
            await addCreditsToJob(dataFeedStrategy.address);
          });

          it('should be able to fetch and send observations', async () => {
            const tx = await dataFeedStrategy['work(bytes32,uint8)'](poolSalt, TIME_TRIGGER);
            const txReceipt = await tx.wait();
            const fetchData = dataFeed.interface.decodeEventLog('PoolObserved', txReceipt.logs![1].data);

            const RANDOM_CHAIN_ID = 5;

            await expect(
              dataFeedStrategy['work(uint16,bytes32,uint24,(uint32,int24)[])'](
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

          it('should work with send-test-observation fixture', async () => {
            await deployments.fixture(['send-test-observation'], { keepExistingDeployments: true });
          });
        });
      });
    });
  });

  describe('production setup', () => {
    beforeEach(async () => {
      await deployments.fixture(['base-contracts']);
      await deployments.fixture(['setup-keeper', 'connext-setup'], { keepExistingDeployments: true });

      dataFeedStrategy = (await getContractFromFixture('DataFeedStrategy')) as Type.DataFeedStrategy;

      await evm.advanceTimeAndBlock(86400 * 5); // avoids !OLD error
      await addCreditsToJob(dataFeedStrategy.address);
    });

    it('should work with send-observation', async () => {
      await deployments.fixture(['send-observation'], { keepExistingDeployments: true });
    });

    it('should work with force-fetch-observation', async () => {
      await deployments.fixture(['force-fetch-observation'], { keepExistingDeployments: true });
    });
  });
});

/* HELPER FUNCTIONS */

const addCreditsToJob = async (jobAddress: string) => {
  const { keep3rGovernance } = await getNamedAccounts();

  const keep3rContract = await getContractFromFixture('Keep3r', 'IKeep3r');

  // force KP3R credits to job
  // TODO:
  // - add IGovernable to IKeep3r interface
  // - set rewardPeriodTime = 1 days
  // const keep3rGovernance = await keep3rContract.governor()
  await wallet.setBalance(keep3rGovernance, toUnit(10));
  const governor = await wallet.impersonate(keep3rGovernance);
  await keep3rContract.connect(governor).forceLiquidityCreditsToJob(jobAddress, toUnit(100));
};
