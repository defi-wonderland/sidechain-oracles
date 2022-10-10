import OracleSidechain from '../artifacts/solidity/contracts/OracleSidechain.sol/OracleSidechain.json';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { TEST_FEE } from '../utils/constants';
import { verifyContractByAddress } from '../utils/deploy';
import { calculateSalt } from '../test/utils/misc';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const RANDOM_CHAIN_ID = 42; // doesn't matter for dummy adapter

  const txSettings = {
    from: deployer,
    gasLimit: 10e6,
    log: true,
  };

  const tokenA = await hre.deployments.get('TokenA');
  const tokenB = await hre.deployments.get('TokenB');
  const dataFeed = await hre.deployments.get('DataFeed');

  const salt = calculateSalt(tokenA.address, tokenB.address, TEST_FEE);

  const fetchTx = await hre.deployments.execute('DataFeedKeeper', txSettings, 'work(bytes32)', salt);

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

  const IS_FIRST_OBSERVATION = fetchData._poolNonce == 1;

  /* SEND OBSERVATIONS */

  if (IS_DUMMY_ADAPTER_WHITELISTED && IS_RECEIVER_SET && IS_DESTINATION_DOMAIN_ID_SET) {
    await hre.deployments.execute('DataFeed', txSettings, 'sendObservations', ...SEND_OBSERVATION_ARGS);
  } else {
    throw new Error('🚧 Setters not properly set. Skipping sending the observation');
  }

  const DUMMY_ORACLE_ADDRESS = await hre.deployments.read('OracleFactory', 'getPool', tokenA.address, tokenB.address, TEST_FEE);

  if (IS_FIRST_OBSERVATION) {
    await hre.deployments.save('DummyOracleSidechain', {
      abi: OracleSidechain.abi,
      address: DUMMY_ORACLE_ADDRESS,
    });

    await verifyContractByAddress(hre, DUMMY_ORACLE_ADDRESS);
  }
};

deployFunction.dependencies = ['dummy-test-setup'];
deployFunction.tags = ['send-test-observation', 'test'];
export default deployFunction;
