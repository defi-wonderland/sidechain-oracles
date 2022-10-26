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

  const fetchTx = await hre.deployments.execute('DataFeedKeeper', txSettings, 'work(bytes32,uint8)', salt, 0);

  const fetchData = (await hre.ethers.getContractAt('DataFeed', dataFeed.address)).interface.decodeEventLog(
    'PoolObserved',
    fetchTx.logs![1].data
  );

  const SEND_OBSERVATION_ARGS = [DUMMY_CHAIN_ID, salt, fetchData._poolNonce, fetchData._observationsData];
  await hre.deployments.execute('DataFeedKeeper', txSettings, 'work(uint16,bytes32,uint24,(uint32,int24)[])', ...SEND_OBSERVATION_ARGS);

  const IS_FIRST_OBSERVATION = fetchData._poolNonce == 1;
  if (IS_FIRST_OBSERVATION) {
    const DUMMY_ORACLE_ADDRESS = await hre.deployments.read('OracleFactory', 'getPool', tokenA, tokenB, TEST_FEE);
    await hre.deployments.save('DummyOracleSidechain', {
      abi: OracleSidechain.abi,
      address: DUMMY_ORACLE_ADDRESS,
    });
    await verifyContractByAddress(hre, DUMMY_ORACLE_ADDRESS);
    await hre.deployments.execute('DummyOracleSidechain', txSettings, 'initializePoolInfo', tokenA, tokenB, TEST_FEE);
  }
};

deployFunction.dependencies = ['dummy-keeper-setup'];
deployFunction.tags = ['send-test-observation'];
export default deployFunction;
