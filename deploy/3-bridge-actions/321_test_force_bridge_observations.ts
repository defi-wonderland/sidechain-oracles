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

  const RANDOM_CHAIN_ID = 42; // doesn't matter for dummy adapter

  const txSettings = {
    from: deployer,
    gasLimit: 10e6,
    log: true,
  };

  const dataFeed = await hre.deployments.get('DataFeed');

  const BLOCK_TIMESTAMP = (await hre.ethers.provider.getBlock('latest')).timestamp;
  const fetchTx = await hre.deployments.execute('DataFeedKeeper', txSettings, 'forceWork(bytes32,uint32)', salt, BLOCK_TIMESTAMP - 86400);

  const fetchData = (await hre.ethers.getContractAt('DataFeed', dataFeed.address)).interface.decodeEventLog(
    'PoolObserved',
    fetchTx.logs![0].data
  );

  const dummyAdapter = await hre.deployments.get('DummyAdapterForTest');
  const dataReceiver = await hre.deployments.get('DataReceiver');

  const SEND_OBSERVATION_ARGS = [dummyAdapter.address, RANDOM_CHAIN_ID, salt, fetchData._poolNonce, fetchData._observationsData];

  /* HEALTH CHECKS */

  const IS_DUMMY_ADAPTER_WHITELISTED = await hre.deployments.read('DataFeed', 'whitelistedAdapters', dummyAdapter.address);
  const SET_RECEIVER = await hre.deployments.read('DataFeed', 'receivers', dummyAdapter.address, RANDOM_CHAIN_ID);
  const SET_DESTINATION_DOMAIN_ID = await hre.deployments.read('DataFeed', 'destinationDomainIds', dummyAdapter.address, RANDOM_CHAIN_ID);

  const IS_RECEIVER_SET = SET_RECEIVER === dataReceiver.address;
  const IS_DESTINATION_DOMAIN_ID_SET = SET_DESTINATION_DOMAIN_ID === RANDOM_CHAIN_ID;

  const IS_FIRST_OBSERVATION = fetchData._poolNonce == bn.toBN(1);

  /* SEND OBSERVATIONS */

  if (IS_DUMMY_ADAPTER_WHITELISTED && IS_RECEIVER_SET && IS_DESTINATION_DOMAIN_ID_SET) {
    await hre.deployments.execute('DataFeed', txSettings, 'sendObservations', ...SEND_OBSERVATION_ARGS);
  } else {
    throw new Error('🚧 Setters not properly set. Skipping sending the observation');
  }

  const DUMMY_ORACLE_ADDRESS = await hre.deployments.read('OracleFactory', 'getPool', tokenA, tokenB, TEST_FEE);

  if (IS_FIRST_OBSERVATION) {
    await hre.deployments.save('DummyOracleSidechain', {
      abi: OracleSidechain.abi,
      address: DUMMY_ORACLE_ADDRESS,
    });

    await verifyContractByAddress(hre, DUMMY_ORACLE_ADDRESS);

    await hre.deployments.execute('DummyOracleSidechain', txSettings, 'initializePoolInfo', tokenA, tokenB, TEST_FEE);
  }
};

deployFunction.dependencies = ['dummy-test-setup'];
deployFunction.tags = ['send-force-test-observation', 'test'];
export default deployFunction;
