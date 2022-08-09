import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { getAddressFromAbi, getChainId, getDataFromChainId, getReceiverChainId } from 'utils/deploy';
import { TEST_FEE } from '../utils/constants';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const CHAIN_ID = await getChainId(hre);
  const SENDER_UNI_V3_POOL = await getAddressFromAbi('deployments', 'sender', 'UniV3Pool.json');
  if (!SENDER_UNI_V3_POOL.exists) {
    return console.log('UniV3 Pool does not exist, please deploy');
  }

  const { domainIdDestination } = await getDataFromChainId(CHAIN_ID);

  const RECEIVER_CHAIN_ID = await getReceiverChainId('deployments', 'receiver', '.chainId');
  if (RECEIVER_CHAIN_ID.chainId === CHAIN_ID) {
    throw new Error(
      'Observation is being sent from the receiver, make sure you are running this script from the sender. Instructions in README'
    );
  }

  const CONNEXT_SENDER = await getAddressFromAbi('deployments', 'sender', 'ConnextSenderAdapter.json');
  const CONNEXT_RECEIVER = await getAddressFromAbi('deployments', 'receiver', 'ConnextReceiverAdapter.json');

  // check to make sure we skip this deployment script if the chain is wrong, or if the contracts have not been yet deploy in both chains
  if (!CONNEXT_SENDER.exists || !CONNEXT_RECEIVER.exists) {
    return console.log(
      'Make sure this script is being run on the sender chain id and that ConnextSenderAdapter and ConnextSenderReceiver are deployed'
    );
  }

  // TODO: do we want some specific value?
  const RANDOM_SECONDS_AGO = [10, 5, 0];

  const txSettings = {
    from: deployer,
    gasLimit: 10e6,
    log: true,
  };

  const tokenA = await hre.deployments.get('TokenA');
  const tokenB = await hre.deployments.get('TokenB');

  const SEND_OBSERVATION_ARGS = [
    CONNEXT_SENDER.address,
    RECEIVER_CHAIN_ID.chainId,
    tokenA.address,
    tokenB.address,
    TEST_FEE,
    RANDOM_SECONDS_AGO,
  ];

  const IS_CONNEXT_SENDER_WHITELISTED = await hre.deployments.read('DataFeed', 'whitelistedAdapters', CONNEXT_SENDER.address);
  const SET_RECEIVER = await hre.deployments.read('DataFeed', 'receivers', CONNEXT_SENDER.address, domainIdDestination);
  const SET_DESTINATION_DOMAIN_ID = await hre.deployments.read(
    'DataFeed',
    'destinationDomainIds',
    CONNEXT_SENDER.address,
    RECEIVER_CHAIN_ID.chainId
  );

  const IS_RECEIVER_SET = SET_RECEIVER === CONNEXT_RECEIVER.address;
  const IS_DESTINATION_DOMAIN_ID_SET = SET_DESTINATION_DOMAIN_ID === domainIdDestination;

  if (IS_CONNEXT_SENDER_WHITELISTED && IS_RECEIVER_SET && IS_DESTINATION_DOMAIN_ID_SET) {
    await hre.deployments.execute('DataFeed', txSettings, 'sendObservations', ...SEND_OBSERVATION_ARGS);
    // TODO: read event and log bridge txID for tracking
    // XCalled topic = 0x9ff13ab44d4ea07af1c3b3ffb93494b9e0e32bb1564d8ba56e62e7ee9b7489d3
    // console.log(event.data.transferId)
  } else {
    throw new Error('🚧 Setters not properly set. Skipping sending the observation');
  }
};

deployFunction.dependencies = ['sender-stage-2', 'token-actions'];
deployFunction.tags = ['execute', 'send-observation', 'mainnet'];
export default deployFunction;
