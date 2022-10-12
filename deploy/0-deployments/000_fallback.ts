import { DeployFunction } from 'hardhat-deploy/types';
const deployFunction: DeployFunction = async function () {
  // Avoids being run without a tag
  console.log('⚠️  Please add a deployment tag "--tags dummy-test-setup"');
  return process.exit(1);
};
deployFunction.tags = [];
export default deployFunction;
