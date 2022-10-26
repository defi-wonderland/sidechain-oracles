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
        // setup: mumbai bridges to goerli and goerli uses dummy adapter
        goerli: {
          url: env.getNodeUrl('goerli'),
          accounts: env.getAccounts('test'),
          chainId: 5,
          companionNetworks: {
            receiver: 'goerli',
          },
        },
        mumbai: {
          url: 'https://rpc-mumbai.maticvigil.com/',
          accounts: env.getAccounts('test'),
          chainId: 80001,
          companionNetworks: {
            receiver: 'goerli',
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
    apiKey: env.getEtherscanAPIKeys(['ethereum', 'goerli']),
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
