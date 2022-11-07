import OracleSidechain from '../../artifacts/solidity/contracts/OracleSidechain.sol/OracleSidechain.json';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { TEST_FEE } from '../../utils/constants';
import { verifyContractByAddress } from '../../utils/deploy';
import { calculateSalt } from '../../test/utils/misc';

/* DUMMY SETUP USES hre.getChainId() */

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, tokenA, tokenB } = await hre.getNamedAccounts();
  const salt = calculateSalt(tokenA, tokenB, TEST_FEE);

  const DUMMY_CHAIN_ID = await hre.getChainId();

  const txSettings = {
    from: deployer,
    log: true,
  };

  const dataFeed = await hre.deployments.get('DataFeed');
  const dummyAdapter = await hre.deployments.get('DummyAdapterForTest');

  const dataFeedContract = await hre.ethers.getContractAt('DataFeed', dataFeed.address);
  const filter = dataFeedContract.filters.PoolObserved();

  const blockNumber = (await hre.ethers.provider.getBlock('latest')).number;
  const events: any[] = await dataFeedContract.queryFilter(filter, blockNumber - 1000);
  const fetchData = events[events.length - 1].args;

  const SEND_OBSERVATION_ARGS = [dummyAdapter.address, DUMMY_CHAIN_ID, salt, fetchData._poolNonce, fetchData._observationsData];
  await hre.deployments.execute(
    'DataFeed',
    txSettings,
    'sendObservations(address,uint32,bytes32,uint24,(uint32,int24)[])',
    ...SEND_OBSERVATION_ARGS
  );

  const DUMMY_ORACLE_SIDECHAIN = await hre.deployments.getOrNull('DummyOracleSidechain');
  if (DUMMY_ORACLE_SIDECHAIN == null) {
    const DUMMY_ORACLE_ADDRESS = await hre.deployments.read('OracleFactory', 'getPool(address,address,uint24)', tokenA, tokenB, TEST_FEE);
    await hre.deployments.save('DummyOracleSidechain', {
      abi: OracleSidechain.abi,
      address: DUMMY_ORACLE_ADDRESS,
    });
    await verifyContractByAddress(hre, DUMMY_ORACLE_ADDRESS);
    await hre.deployments.execute('DummyOracleSidechain', txSettings, 'initializePoolInfo', tokenA, tokenB, TEST_FEE);
  }
};

deployFunction.dependencies = ['dummy-test-setup'];
deployFunction.tags = ['dummy-bridge-observation'];
export default deployFunction;
