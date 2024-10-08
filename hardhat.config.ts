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
            url: env.getNodeUrl('sepolia'),
          },
          chainId: 11155111,
          companionNetworks: {
            receiver: 'hardhat',
          },
        },
        ethereum: {
          url: env.getNodeUrl('ethereum'),
          accounts: env.getAccounts('ethereum'),
          chainId: 1,
          companionNetworks: {
            receiver: 'optimism',
            // receiver: 'polygon', // Uncomment to select as sidechain
          },
        },
        optimism: {
          url: env.getNodeUrl('optimism'),
          accounts: env.getAccounts('ethereum'),
          chainId: 10,
          companionNetworks: { sender: 'ethereum' },
        },
        polygon: {
          url: env.getNodeUrl('polygon'),
          accounts: env.getAccounts('ethereum'),
          chainId: 137,
          companionNetworks: { sender: 'ethereum' },
        },
        sepolia: {
          url: env.getNodeUrl('sepolia'),
          accounts: env.getAccounts('test'),
          chainId: 11155111,
          companionNetworks: {
            receiver: 'optimisticSepolia',
          },
        },
        sepoliaDummy: {
          url: env.getNodeUrl('sepolia'),
          accounts: env.getAccounts('test'),
          chainId: 11155111,
          companionNetworks: {
            receiver: 'sepoliaDummy',
          },
        },
        optimisticSepolia: {
          url: env.getNodeUrl('optimisticSepolia'),
          accounts: env.getAccounts('test'),
          chainId: 11155420,
          companionNetworks: {
            sender: 'sepolia',
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
    apiKey: env.getEtherscanAPIKeys(['ethereum', 'optimisticEthereum', 'polygon', 'sepolia', 'optimisticSepolia']),
    customChains: [
      {
        network: 'optimisticSepolia',
        chainId: 11155420,
        urls: {
          apiURL: 'https://api-sepolia-optimistic.etherscan.io/api',
          browserURL: 'https://sepolia-optimism.etherscan.io',
        },
      },
    ],
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
