import 'dotenv/config';
import '@nomiclabs/hardhat-waffle';
import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-etherscan';
import '@typechain/hardhat';
import '@typechain/hardhat/dist/type-extensions';
import 'hardhat-gas-reporter';
import 'hardhat-contract-sizer';
import 'hardhat-deploy';
import 'solidity-coverage';
import { HardhatUserConfig, NetworksUserConfig } from 'hardhat/types';
import * as env from './utils/env';
import 'tsconfig-paths/register';
import { addressRegistry } from 'utils/constants';

const networks: NetworksUserConfig =
  env.isHardhatCompile() || env.isHardhatClean() || env.isTestingLocal()
    ? {}
    : {
        hardhat: {
          forking: {
            enabled: process.env.FORK ? true : false,
            url: env.getNodeUrl('goerli'),
          },
          chainId: 5,
          companionNetworks: {
            sender: 'hardhat',
            receiver: 'hardhat',
          },
        },
        ethereum: {
          url: env.getNodeUrl('ethereum'),
          accounts: env.getAccounts('ethereum'),
          chainId: 1,
          companionNetworks: {
            receiver: 'goerli',
          },
        },
        singleton: {
          url: env.getNodeUrl('goerli'),
          accounts: env.getAccounts('goerli'),
          chainId: 5,
          companionNetworks: {
            sender: 'singleton',
            receiver: 'singleton',
          },
          gasPrice: 10e9,
        },
        sender: {
          url: env.getNodeUrl('goerli'),
          accounts: env.getAccounts('goerli'),
          chainId: 5,
          companionNetworks: {
            receiver: 'receiver',
          },
        },
        receiver: {
          url: env.getNodeUrl('op_goerli'),
          accounts: env.getAccounts('goerli'),
          chainId: 420,
          companionNetworks: {
            sender: 'sender',
          },
        },
      };

const config: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  namedAccounts: {
    deployer: {
      default: 0,
    },
    ...addressRegistry,
  },
  mocha: {
    timeout: process.env.MOCHA_TIMEOUT || 300000,
  },
  networks,
  solidity: {
    compilers: [
      {
        version: '0.8.15',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: '0.8.11',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: false,
    strict: true,
    only: ['solidity/contracts/'],
    except: ['solidity/contracts/for-test/'],
  },
  gasReporter: {
    currency: process.env.COINMARKETCAP_DEFAULT_CURRENCY || 'USD',
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    enabled: process.env.REPORT_GAS ? true : false,
    showMethodSig: true,
    onlyCalledMethods: false,
  },
  etherscan: {
    apiKey: env.getEtherscanAPIKeys(['ethereum', 'kovan', 'rinkeby', 'goerli']),
  },
  typechain: {
    outDir: 'typechained',
    target: 'ethers-v5',
  },
  paths: {
    sources: './solidity',
  },
};

export default config;
