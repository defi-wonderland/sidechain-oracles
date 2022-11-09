import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { TEST_FEE } from '../../utils/constants';
import { calculateSalt } from '../../test/utils/misc';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, tokenA, tokenB } = await hre.getNamedAccounts();
  const salt = calculateSalt(tokenA, tokenB, TEST_FEE);

  const txSettings = {
    from: deployer,
    log: true,
  };

  const DUMMY_CHAIN_ID = await hre.getChainId();

  const dataFeed = await hre.deployments.get('DataFeed');
  const dummyAdapter = await hre.deployments.get('DummyAdapterForTest');

  const SECONDS_AGOS = [10, 5, 0];
  const FETCH_OBSERVATION_ARGS = [salt, SECONDS_AGOS];
  const fetchTx = await hre.deployments.execute('DataFeed', txSettings, 'fetchObservations(bytes32,uint32[])', ...FETCH_OBSERVATION_ARGS);

  const dataFeedContract = await hre.ethers.getContractAt('DataFeed', dataFeed.address);
  const fetchData = dataFeedContract.interface.decodeEventLog('PoolObserved', fetchTx.logs![0].data);
  const SEND_OBSERVATION_ARGS = [dummyAdapter.address, DUMMY_CHAIN_ID, salt, fetchData._poolNonce, fetchData._observationsData];
  await hre.deployments.execute('DataFeed', txSettings, 'sendObservations', ...SEND_OBSERVATION_ARGS);

  // TODO: read event and log bridge txID for tracking
  // XCalled topic = 0x9ff13ab44d4ea07af1c3b3ffb93494b9e0e32bb1564d8ba56e62e7ee9b7489d3
  // console.log(event.data.transferId)
};

deployFunction.dependencies = ['dummy-test-setup', 'setup-manual-strategy'];
deployFunction.tags = ['manual-send-test-observation'];
export default deployFunction;
