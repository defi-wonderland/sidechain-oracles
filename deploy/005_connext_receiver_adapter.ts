import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getAddressFromAbi, getChainId, getDataFromChainId, verifyContractIfNeeded } from '../utils/deploy';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const CONNEXT_SENDER = await getAddressFromAbi('deployments', 'sender', 'ConnextSenderAdapter.json');
  if (!CONNEXT_SENDER.exists) {
    // TODO: does it fail like this? i'm getting "No deployment found for: ..."
    throw new Error(
      'Connext Sender has not been deployed. Make sure you are running the scripts in the correct order. Order is in the README.md file'
    );
  }

  const DATA_RECEIVER = (await hre.deployments.get('DataReceiver')).address;
  const CHAIN_ID = await getChainId(hre);

  const { connextHandler, domainIdOrigin } = await getDataFromChainId(CHAIN_ID);

  const CONSTRUCTOR_ARGS = [DATA_RECEIVER, CONNEXT_SENDER.address, domainIdOrigin, connextHandler];

  const deploy = await hre.deployments.deploy('ConnextReceiverAdapter', {
    contract: 'solidity/contracts/bridges/ConnextReceiverAdapter.sol:ConnextReceiverAdapter',
    from: deployer,
    log: true,
    args: CONSTRUCTOR_ARGS,
    gasLimit: 10e6,
  });

  await verifyContractIfNeeded(hre, deploy);
};

deployFunction.tags = ['deploy-connext-receiver-adapter', 'connext-receiver-adapter', 'receiver-stage-2'];

export default deployFunction;
