import OracleSidechain from '../../artifacts/solidity/contracts/OracleSidechain.sol/OracleSidechain.json';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { TEST_FEE } from '../../utils/constants';
import { verifyContractByAddress } from '../../utils/deploy';
import { calculateSalt } from '../../test/utils/misc';
import { bn } from '../../test/utils';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, tokenA, tokenB } = await hre.getNamedAccounts();
  const salt = calculateSalt(tokenA, tokenB, TEST_FEE);

  const txSettings = {
    from: deployer,
    log: true,
  };

  const DUMB_CHAIN_ID = await hre.getChainId();

  const dataFeed = await hre.deployments.get('DataFeed');
  const dummyAdapter = await hre.deployments.get('DummyAdapterForTest');

  const BLOCK_TIMESTAMP = (await hre.ethers.provider.getBlock('latest')).timestamp;
  const FETCH_OBSERVATION_ARGS = [salt, BLOCK_TIMESTAMP - 86400];
  const fetchTx = await hre.deployments.execute('DataFeedStrategy', txSettings, 'forceWork(bytes32,uint32)', salt, ...FETCH_OBSERVATION_ARGS);

  const fetchData = (await hre.ethers.getContractAt('DataFeed', dataFeed.address)).interface.decodeEventLog(
    'PoolObserved',
    fetchTx.logs![0].data
  );

  const SEND_OBSERVATION_ARGS = [dummyAdapter.address, DUMB_CHAIN_ID, salt, fetchData._poolNonce, fetchData._observationsData];
  await hre.deployments.execute('DataFeed', txSettings, 'sendObservations', ...SEND_OBSERVATION_ARGS);

  const IS_FIRST_OBSERVATION = fetchData._poolNonce == bn.toBN(1);
  if (IS_FIRST_OBSERVATION) {
    const DUMMY_ORACLE_ADDRESS = await hre.companionNetworks['receiver'].deployments.read('OracleFactory', 'getPool', tokenA, tokenB, TEST_FEE);
    await hre.deployments.save('DummyOracleSidechain', {
      abi: OracleSidechain.abi,
      address: DUMMY_ORACLE_ADDRESS,
    });
    await verifyContractByAddress(hre, DUMMY_ORACLE_ADDRESS);
    await hre.deployments.execute('DummyOracleSidechain', txSettings, 'initializePoolInfo', tokenA, tokenB, TEST_FEE);
  }
};

deployFunction.dependencies = ['dummy-test-setup'];
deployFunction.tags = ['send-force-test-observation'];
export default deployFunction;
