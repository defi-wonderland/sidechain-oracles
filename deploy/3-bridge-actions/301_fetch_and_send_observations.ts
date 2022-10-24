import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { TEST_FEE, domainId } from '../../utils/constants';
import { calculateSalt } from '../../test/utils/misc';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, tokenA, tokenB } = await hre.getNamedAccounts();
  const salt = calculateSalt(tokenA, tokenB, TEST_FEE);

  const txSettings = {
    from: deployer,
    gasLimit: 10e6,
    log: true,
  };

  const RECEIVER_CHAIN_ID = await hre.companionNetworks['receiver'].getChainId();
  const DESTINATION_DOMAIN_ID = domainId[Number(RECEIVER_CHAIN_ID)];

  const senderAdapter = await hre.deployments.get('ConnextSenderAdapter');
  const receiverAdapter = await hre.companionNetworks['receiver'].deployments.get('ConnextReceiverAdapter');

  // TODO: deprecate token actions in favour of deployed pools
  // const tokenA = await hre.deployments.get('TokenA');
  // const tokenB = await hre.deployments.get('TokenB');

  const dataFeed = await hre.deployments.get('DataFeed');

  // TODO: replace 0 with Enum Reason
  const FETCH_OBSERVATION_ARGS = [salt, 0];
  const fetchTx = await hre.deployments.execute('DataFeedKeeper', txSettings, 'work(bytes32,uint8)', ...FETCH_OBSERVATION_ARGS);

  const fetchData = (await hre.ethers.getContractAt('DataFeed', dataFeed.address)).interface.decodeEventLog(
    'PoolObserved',
    fetchTx.logs![1].data
  );

  const SET_RECEIVER = await hre.deployments.read('DataFeed', 'receivers', senderAdapter.address, DESTINATION_DOMAIN_ID);
  const SET_DESTINATION_DOMAIN_ID = await hre.deployments.read('DataFeed', 'destinationDomainIds', senderAdapter.address, RECEIVER_CHAIN_ID);

  const IS_WHITELISTED_SENDER_ADAPTER = await hre.deployments.read('DataFeed', 'whitelistedAdapters', senderAdapter.address);
  const IS_RECEIVER_SET = SET_RECEIVER === receiverAdapter.address;
  const IS_DESTINATION_DOMAIN_ID_SET = SET_DESTINATION_DOMAIN_ID === DESTINATION_DOMAIN_ID;

  if (IS_WHITELISTED_SENDER_ADAPTER && IS_RECEIVER_SET && IS_DESTINATION_DOMAIN_ID_SET) {
    const SEND_OBSERVATION_ARGS = [RECEIVER_CHAIN_ID, salt, fetchData._poolNonce, fetchData._observationsData];
    await hre.deployments.execute('DataFeedKeeper', txSettings, 'work(uint16,bytes32,uint24,(uint32,int24)[])', ...SEND_OBSERVATION_ARGS);

    // TODO: read event and log bridge txID for tracking
    // XCalled topic = 0x9ff13ab44d4ea07af1c3b3ffb93494b9e0e32bb1564d8ba56e62e7ee9b7489d3
    // console.log(event.data.transferId)
  } else {
    throw new Error('🚧 Setters not properly set. Skipping sending the observation');
  }
};

deployFunction.dependencies = ['connext-setup', 'setup-test-keeper'];
deployFunction.tags = ['send-observation', 'mainnet'];
export default deployFunction;
