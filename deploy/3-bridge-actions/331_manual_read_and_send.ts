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

  const RECEIVER_CHAIN_ID = await hre.getChainId();

  const dataFeed = await hre.deployments.get('DataFeed');
  const senderAdapter = await hre.deployments.get('DummyAdapterForTest');

  const FETCH_TX_HASH = '0xfe0dc1752c4dc455f418615bc20006e9280984ee2af4191fefb5639c9060b16d';
  const fetchTx = await (await hre.ethers.provider.getTransaction(FETCH_TX_HASH)).wait();

  console.log(fetchTx.logs!);

  const fetchData = (await hre.ethers.getContractAt('DataFeed', dataFeed.address)).interface.decodeEventLog(
    'PoolObserved',
    fetchTx.logs![0].data
  );
  const SEND_OBSERVATION_ARGS = [senderAdapter.address, RECEIVER_CHAIN_ID, salt, fetchData._poolNonce, fetchData._observationsData];
  await hre.deployments.execute('DataFeed', txSettings, 'sendObservations', ...SEND_OBSERVATION_ARGS);

  // TODO: read event and log bridge txID for tracking
  // XCalled topic = 0x9ff13ab44d4ea07af1c3b3ffb93494b9e0e32bb1564d8ba56e62e7ee9b7489d3
  // console.log(event.data.transferId)
};

deployFunction.dependencies = ['dummy-test-setup', 'setup-manual-keeper'];
deployFunction.tags = ['manual-read-observation'];
export default deployFunction;
