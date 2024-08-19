import { ethers, deployments, getNamedAccounts } from 'hardhat';
import { Contract } from 'ethers';
import * as Type from '@typechained';
import { evm, wallet } from '@utils';
import { toUnit } from '@utils/bn';
import { getContractFromFixture, getFixtureChainId } from '@utils/contracts';
import { calculateSalt } from '@utils/misc';
import { TEST_FEE } from 'utils/constants';
import { getNodeUrl } from 'utils/env';
import forkBlockNumber from './fork-block-numbers';
import { expect } from 'chai';

describe('@skip-on-coverage Fixture', () => {
  let deployer: string;
  let dataFeed: Type.DataFeed;
  let dataFeedStrategy: Type.DataFeedStrategy;
  let strategyJob: Type.StrategyJob;
  let dataReceiver: Type.DataReceiver;
  let oracleFactory: Type.OracleFactory;
  let oracleSidechain: Type.OracleSidechain;
  let uniswapV3Factory: Type.IUniswapV3Factory;
  let uniswapV3Pool: Type.IUniswapV3Pool;
  let tokenA: Type.IERC20;
  let tokenB: Type.IERC20;

  let senderAdapter: Contract;
  let receiverAdapter: Contract;

  let poolSalt: string;

  const NONE_TRIGGER = 0;
  const TIME_TRIGGER = 1;
  const TWAP_TRIGGER = 2;
  const OLD_TRIGGER = 3;

  beforeEach(async () => {
    ({ deployer } = await getNamedAccounts());

    await evm.reset({
      jsonRpcUrl: getNodeUrl('sepolia'),
      blockNumber: forkBlockNumber.sepolia,
    });
  });

  describe('deployments', () => {
    it('should deploy base contracts', async () => {
      await deployments.fixture(['oracle-factory']);
    });
  });

  describe('cascade test setup', () => {
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
      expect(await dataFeed.strategy()).to.eq(deployer);

      expect(await dataFeed.whitelistedAdapters(senderAdapter.address)).to.be.true;
      expect(await dataReceiver.whitelistedAdapters(receiverAdapter.address)).to.be.true;
    });

    describe('when pool is deployed', () => {
      beforeEach(async () => {
        await deployments.fixture(['save-tokens', 'pool-whitelisting'], { keepExistingDeployments: true });

        tokenA = (await getContractFromFixture('TokenA', 'IERC20')) as Type.IERC20;
        tokenB = (await getContractFromFixture('TokenB', 'IERC20')) as Type.IERC20;
        uniswapV3Pool = (await getContractFromFixture('UniswapV3Pool', 'IUniswapV3Pool')) as Type.IUniswapV3Pool;
        poolSalt = calculateSalt(tokenA.address, tokenB.address, TEST_FEE);
        await evm.advanceTimeAndBlock(86400 * 5); // avoids !OLD error
      });

      it('should work with manual-fetch-observation fixture', async () => {
        await deployments.fixture(['manual-fetch-observation'], { keepExistingDeployments: true });
      });

      it('should work with manual-send-test-observation fixture', async () => {
        await deployments.fixture(['manual-send-test-observation'], { keepExistingDeployments: true });
      });

      describe('when the strategy is setup', () => {
        beforeEach(async () => {
          await deployments.fixture(['setup-strategy'], { keepExistingDeployments: true });
        });

        it('should work with fetch-observation', async () => {
          await deployments.fixture(['fetch-observation'], { keepExistingDeployments: true });
        });

        describe('when an observation was fetched', () => {
          beforeEach(async () => {
            await deployments.fixture(['fetch-observation'], { keepExistingDeployments: true });
          });

          it('should work with dummy-bridge-observation', async () => {
            await deployments.fixture(['dummy-bridge-observation'], { keepExistingDeployments: true });
          });
        });

        describe('when the job is setup', () => {
          beforeEach(async () => {
            await deployments.fixture(['setup-keeper'], { keepExistingDeployments: true });
            dataFeedStrategy = (await getContractFromFixture('DataFeedStrategy')) as Type.DataFeedStrategy;
            strategyJob = (await getContractFromFixture('StrategyJob')) as Type.StrategyJob;
            await addCreditsToJob(strategyJob.address);
          });

          it('should set correct test settings', async () => {
            expect(await dataFeed.strategy()).to.eq(dataFeedStrategy.address);
            expect(await dataFeedStrategy.dataFeed()).to.eq(dataFeed.address);
          });

          it('should be able to work-fetch observations', async () => {
            await expect(strategyJob['work(bytes32,uint8)'](poolSalt, TIME_TRIGGER)).not.to.be.reverted;
          });

          describe('when dummy adapter is default', () => {
            beforeEach(async () => {
              await deployments.fixture(['setup-dummy-default'], { keepExistingDeployments: true });
            });

            it('should be able to fetch and send observations', async () => {
              await strategyJob['work(bytes32,uint8)'](poolSalt, TIME_TRIGGER);

              const lastPoolNonce = (await dataFeed.lastPoolStateObserved(poolSalt)).poolNonce;
              const evtFilter = dataFeed.filters.PoolObserved(poolSalt, lastPoolNonce);
              const queryResults = await dataFeed.queryFilter(evtFilter);

              const fetchData = dataFeed.interface.decodeEventLog('PoolObserved', queryResults[0].data);

              const RANDOM_CHAIN_ID = 11155111;

              await expect(
                strategyJob['work(uint32,bytes32,uint24,(uint32,int24)[])'](
                  RANDOM_CHAIN_ID,
                  poolSalt,
                  lastPoolNonce,
                  fetchData._observationsData
                )
              ).not.to.be.reverted;

              const oracleAddress = await oracleFactory['getPool(address,address,uint24)'](tokenA.address, tokenB.address, TEST_FEE);
              oracleSidechain = (await ethers.getContractAt('OracleSidechain', oracleAddress)) as Type.OracleSidechain;

              expect((await oracleSidechain.slot0()).observationCardinality).to.eq(144);
            });

            it('should work with send-test-observation fixture', async () => {
              await deployments.fixture(['send-test-observation'], { keepExistingDeployments: true });
            });
          });

          describe('when connext adapter is default', () => {
            beforeEach(async () => {
              await deployments.fixture(['setup-connext-default'], { keepExistingDeployments: true });
            });

            it('should be able to fetch and send observations', async () => {
              await strategyJob['work(bytes32,uint8)'](poolSalt, TIME_TRIGGER);
              const lastPoolNonce = (await dataFeed.lastPoolStateObserved(poolSalt)).poolNonce;
              const evtFilter = dataFeed.filters.PoolObserved(poolSalt, lastPoolNonce);
              const queryResults = await dataFeed.queryFilter(evtFilter);

              const fetchData = dataFeed.interface.decodeEventLog('PoolObserved', queryResults[0].data);

              const REAL_CHAIN_ID = 11155420;

              await expect(
                strategyJob['work(uint32,bytes32,uint24,(uint32,int24)[])'](REAL_CHAIN_ID, poolSalt, lastPoolNonce, fetchData._observationsData)
              ).not.to.be.reverted;
            });

            it('should work with send-observation fixture', async () => {
              await deployments.fixture(['send-observation'], { keepExistingDeployments: true });
            });
          });

          describe('when adapters redeploy', () => {
            beforeEach(async () => {
              await deployments.fixture(['setup-connext-default'], { keepExistingDeployments: true });
            });

            it('should not redeploy the job', async () => {
              expect(strategyJob.address).to.eq((await getContractFromFixture('StrategyJob')).address);
            });
          });
        });
      });
    });
  });

  describe('production setup', () => {
    beforeEach(async () => {
      await deployments.fixture(['base-contracts']);
      await deployments.fixture(['connext-setup', 'pool-whitelisting'], { keepExistingDeployments: true });
      await evm.advanceTimeAndBlock(86400 * 5); // avoids !OLD error
    });

    it('should work with manual-send-test-observation', async () => {
      await deployments.fixture(['manual-send-test-observation'], { keepExistingDeployments: true });
    });

    describe('strategy job setup', () => {
      beforeEach(async () => {
        await deployments.fixture(['setup-keeper'], { keepExistingDeployments: true });
        strategyJob = (await getContractFromFixture('StrategyJob')) as Type.StrategyJob;

        await addCreditsToJob(strategyJob.address);
      });

      it('should work with work-job', async () => {
        await deployments.fixture(['work-job'], { keepExistingDeployments: true });
      });

      it('should work with dummy-work-job', async () => {
        await deployments.fixture(['dummy-work-job'], { keepExistingDeployments: true });
      });
    });

    describe('after observation was fetched', () => {
      beforeEach(async () => {
        await deployments.fixture(['fetch-observation'], { keepExistingDeployments: true });
      });

      it('should work with bridge-observation', async () => {
        await deployments.fixture(['bridge-observation'], { keepExistingDeployments: true });
      });
    });
  });
});

/* HELPER FUNCTIONS */

const addCreditsToJob = async (jobAddress: string) => {
  const keep3rContract = await getContractFromFixture('Keep3r', 'IKeep3r');
  let governorAddress: string;
  if ((await getFixtureChainId()) != 1) {
    // NOTE: Mainnet uses `governance` while Testnet `governor'
    governorAddress = await keep3rContract.provider.call({
      to: keep3rContract.address,
      data: '0x0c340a24',
    });
    governorAddress = ethers.utils.hexStripZeros(governorAddress);
  } else {
    governorAddress = await keep3rContract.governance();
  }

  const governor = await wallet.impersonate(governorAddress);

  await wallet.setBalance(governor._address, toUnit(10));
  await keep3rContract.connect(governor).forceLiquidityCreditsToJob(jobAddress, toUnit(100));
};
