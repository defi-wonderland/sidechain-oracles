//SPDX-License-Identifier: MIT
pragma solidity >=0.8.8 <0.9.0;

import {IUniswapV3Factory} from '@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol';
import {ISwapRouter} from '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';

interface INFTPositionManager {
  struct MintParams {
    address token0;
    address token1;
    uint24 fee;
    int24 tickLower;
    int24 tickUpper;
    uint256 amount0Desired;
    uint256 amount1Desired;
    uint256 amount0Min;
    uint256 amount1Min;
    address recipient;
    uint256 deadline;
  }

  function mint(MintParams calldata _params)
    external
    payable
    returns (
      uint256 _tokenId,
      uint128 _liquidity,
      uint256 _amount0,
      uint256 _amount1
    );
}

// solhint-disable-next-line no-empty-blocks
contract UniswapV3Importer {

}
