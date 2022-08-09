import OracleSidechain from '../artifacts/solidity/contracts/OracleSidechain.sol/OracleSidechain.json';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { TEST_FEE } from '../utils/constants';
import { verifyContractByAddress } from '../utils/deploy';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const RANDOM_CHAIN_ID = 42; // doesn't matter for dummy adapter

  const RANDOM_SECONDS_AGO = [3, 2, 1, 0];

  const txSettings = {
    from: deployer,
    gasLimit: 10e6,
    log: true,
  };

  const tokenA = await hre.deployments.get('TokenA');
  const tokenB = await hre.deployments.get('TokenB');

  const DUMMY_ADAPTER = (await hre.deployments.get('DummyAdapterForTest')).address;
  const DATA_RECEIVER = (await hre.deployments.get('DataReceiver')).address;

  const SEND_OBSERVATION_ARGS = [DUMMY_ADAPTER, RANDOM_CHAIN_ID, tokenA.address, tokenB.address, TEST_FEE, RANDOM_SECONDS_AGO];

  const IS_DUMMY_ADAPTER_WHITELISTED = await hre.deployments.read('DataFeed', 'whitelistedAdapters', DUMMY_ADAPTER);
  const SET_RECEIVER = await hre.deployments.read('DataFeed', 'receivers', DUMMY_ADAPTER, RANDOM_CHAIN_ID);
  const SET_DESTINATION_DOMAIN_ID = await hre.deployments.read('DataFeed', 'destinationDomainIds', DUMMY_ADAPTER, RANDOM_CHAIN_ID);

  const IS_RECEIVER_SET = SET_RECEIVER === DATA_RECEIVER;
  const IS_DESTINATION_DOMAIN_ID_SET = SET_DESTINATION_DOMAIN_ID === RANDOM_CHAIN_ID;

  const IS_FIRST_OBSERVATION = (await hre.deployments.read('DataFeed', 'lastPoolStateBridged')).blockTimestamp == 0;

  if (IS_DUMMY_ADAPTER_WHITELISTED && IS_RECEIVER_SET && IS_DESTINATION_DOMAIN_ID_SET) {
    await hre.deployments.execute('DataFeed', txSettings, 'sendObservations', ...SEND_OBSERVATION_ARGS);
  } else {
    throw new Error('🚧 Setters not properly set. Skipping sending the observation');
  }

  const dummyOracleAddress = await hre.deployments.read('OracleFactory', 'getPool', tokenA.address, tokenB.address, TEST_FEE);

  if (IS_FIRST_OBSERVATION) {
    await hre.deployments.save('DummyOracleSidechain', {
      abi: OracleSidechain.abi,
      address: dummyOracleAddress,
    });

    await verifyContractByAddress(hre, dummyOracleAddress);
  }
};

deployFunction.dependencies = ['make-swaps', 'dummy-test-setup'];
deployFunction.tags = ['send-test-observation', 'test'];
export default deployFunction;
