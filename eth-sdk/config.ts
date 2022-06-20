import { defineConfig } from '@dethcrypto/eth-sdk';

export default defineConfig({
  contracts: {
    mainnet: {
      uniswapV3Factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      uniswapV3Pool: '0x8f8EF111B67C04Eb1641f5ff19EE54Cda062f163',
    },
  },
});
