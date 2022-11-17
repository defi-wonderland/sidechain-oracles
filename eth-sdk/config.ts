import { defineConfig } from '@dethcrypto/eth-sdk';

export default defineConfig({
  contracts: {
    mainnet: {
      kp3r: '0x1cEB5cB57C4D4E2b2433641b95Dd330A33185A44',
      weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      uniswapV3Factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      uniswapV3Pool: '0x8f8EF111B67C04Eb1641f5ff19EE54Cda062f163',
      uniswapV3SwapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      keep3rV2: '0xeb02addCfD8B773A5FFA6B9d1FE99c566f8c44CC',
    },
  },
});
