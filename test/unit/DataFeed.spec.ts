import { ethers } from 'hardhat';
import { ContractTransaction } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { DataFeed, DataFeed__factory, IConnextSenderAdapter, IUniswapV3Pool } from '@typechained';
import { smock, MockContract, MockContractFactory, FakeContract } from '@defi-wonderland/smock';
import { evm, wallet } from '@utils';
import { onlyGovernance } from '@utils/behaviours';
import chai, { expect } from 'chai';

chai.use(smock.matchers);

describe('DataFeed.sol', () => {
  let randomUser: SignerWithAddress;
  let governance: SignerWithAddress;
  let dataFeed: MockContract<DataFeed>;
  let dataFeedFactory: MockContractFactory<DataFeed__factory>;
  let connextSenderAdapter: FakeContract<IConnextSenderAdapter>;
  let fakeAdapter: FakeContract<IConnextSenderAdapter>;
  let uniswapV3K3PR: FakeContract<IUniswapV3Pool>;
  let tx: ContractTransaction;
  let snapshotId: string;

  const randomDataReceiverAddress = wallet.generateRandomAddress();
  const randomDataReceiverAddress2 = wallet.generateRandomAddress();
  const randomDestinationDomainId = 3;
  const randomDestinationDomainId2 = 34;
  const randomChainId = 32;
  const randomChainId2 = 22;

  before(async () => {
    [, randomUser, governance] = await ethers.getSigners();

    connextSenderAdapter = await smock.fake('IConnextSenderAdapter');
    fakeAdapter = await smock.fake('IConnextSenderAdapter');
    uniswapV3K3PR = await smock.fake('IUniswapV3Pool');

    dataFeedFactory = await smock.mock('DataFeed');
    dataFeed = await dataFeedFactory.deploy(governance.address);

    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('constructor(...)', () => {
    it('should initialize governance to the address passed to the constructor', async () => {
      expect(await dataFeed.governance()).to.eq(governance.address);
    });
  });

  describe('sendObservation(...)', () => {
    let secondsAgos: number[];
    let delta: number;
    let arithmeticMeanTick: number;

    before(async () => {
      let secondsAgo = 30;
      delta = 20;
      secondsAgos = [secondsAgo, secondsAgo - delta];
    });

    context('when the adapter is not whitelisted', () => {
      it('should revert', async () => {
        await expect(
          dataFeed.connect(randomUser).sendObservation(connextSenderAdapter.address, randomChainId, uniswapV3K3PR.address, secondsAgos)
        ).to.be.revertedWith('UnallowedAdapter()');
      });
    });

    context('when the adapter is whitelisted but the domain id is not set', () => {
      it('should revert', async () => {
        await dataFeed.connect(governance).whitelistAdapter(connextSenderAdapter.address, true);
        await expect(
          dataFeed.connect(randomUser).sendObservation(connextSenderAdapter.address, randomChainId, uniswapV3K3PR.address, secondsAgos)
        ).to.be.revertedWith('DestinationDomainIdNotSet()');
      });
    });

    context('when the adapter is whitelisted, the domain id is set, but the receiver is not set', () => {
      it('should revert', async () => {
        await dataFeed.connect(governance).whitelistAdapter(connextSenderAdapter.address, true);
        await dataFeed.connect(governance).setDestinationDomainId(connextSenderAdapter.address, randomChainId, randomDestinationDomainId);
        await expect(
          dataFeed.connect(randomUser).sendObservation(connextSenderAdapter.address, randomChainId, uniswapV3K3PR.address, secondsAgos)
        ).to.be.revertedWith('ReceiverNotSet()');
      });
    });

    context('when the adapter is whitelisted and the domain id and receiver are set', () => {
      beforeEach(async () => {
        await dataFeed.connect(governance).whitelistAdapter(connextSenderAdapter.address, true);
        await dataFeed.connect(governance).setDestinationDomainId(connextSenderAdapter.address, randomChainId, randomDestinationDomainId);
        await dataFeed.connect(governance).setReceiver(connextSenderAdapter.address, randomDestinationDomainId, randomDataReceiverAddress);
        connextSenderAdapter.bridgeObservation.reset();
      });

      // arithmeticMeanTick = tickCumulativesDelta / delta
      context('when arithmeticMeanTick is truncated', () => {
        before(async () => {
          let tickCumulative = 3000;
          let tickCumulativesDelta = 2000;
          let tickCumulatives = [tickCumulative, tickCumulative + tickCumulativesDelta];
          arithmeticMeanTick = Math.floor(tickCumulativesDelta / delta);
          uniswapV3K3PR.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
        });

        it('should call bridgeObservation with the correct arguments', async () => {
          let secondsNow = (await ethers.provider.getBlock('latest')).timestamp + 1;
          let arithmeticMeanBlockTimestamp = (secondsNow - secondsAgos[0] + (secondsNow - secondsAgos[1])) / 2;
          await dataFeed.sendObservation(connextSenderAdapter.address, randomChainId, uniswapV3K3PR.address, secondsAgos);
          expect(connextSenderAdapter.bridgeObservation).to.have.been.calledOnceWith(
            randomDataReceiverAddress,
            randomDestinationDomainId,
            arithmeticMeanBlockTimestamp,
            arithmeticMeanTick
          );
        });

        it('should emit an event', async () => {
          let secondsNow = (await ethers.provider.getBlock('latest')).timestamp + 1;
          let arithmeticMeanBlockTimestamp = (secondsNow - secondsAgos[0] + (secondsNow - secondsAgos[1])) / 2;
          await expect(dataFeed.sendObservation(connextSenderAdapter.address, randomChainId, uniswapV3K3PR.address, secondsAgos))
            .to.emit(dataFeed, 'DataSent')
            .withArgs(
              connextSenderAdapter.address,
              randomDataReceiverAddress,
              randomDestinationDomainId,
              arithmeticMeanBlockTimestamp,
              arithmeticMeanTick
            );
        });
      });

      // arithmeticMeanTick = tickCumulativesDelta / delta
      context('when arithmeticMeanTick is rounded to negative infinity', () => {
        before(async () => {
          let tickCumulative = 3000;
          let tickCumulativesDelta = -2001;
          let tickCumulatives = [tickCumulative, tickCumulative + tickCumulativesDelta];
          arithmeticMeanTick = Math.floor(tickCumulativesDelta / delta);
          uniswapV3K3PR.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
        });

        it('should call bridgeObservation with the correct arguments', async () => {
          let secondsNow = (await ethers.provider.getBlock('latest')).timestamp + 1;
          let arithmeticMeanBlockTimestamp = (secondsNow - secondsAgos[0] + (secondsNow - secondsAgos[1])) / 2;
          await dataFeed.sendObservation(connextSenderAdapter.address, randomChainId, uniswapV3K3PR.address, secondsAgos);
          expect(connextSenderAdapter.bridgeObservation).to.have.been.calledOnceWith(
            randomDataReceiverAddress,
            randomDestinationDomainId,
            arithmeticMeanBlockTimestamp,
            arithmeticMeanTick
          );
        });

        it('should emit an event', async () => {
          let secondsNow = (await ethers.provider.getBlock('latest')).timestamp + 1;
          let arithmeticMeanBlockTimestamp = (secondsNow - secondsAgos[0] + (secondsNow - secondsAgos[1])) / 2;
          await expect(dataFeed.sendObservation(connextSenderAdapter.address, randomChainId, uniswapV3K3PR.address, secondsAgos))
            .to.emit(dataFeed, 'DataSent')
            .withArgs(
              connextSenderAdapter.address,
              randomDataReceiverAddress,
              randomDestinationDomainId,
              arithmeticMeanBlockTimestamp,
              arithmeticMeanTick
            );
        });
      });
    });
  });

  describe('fetchObservation(...)', () => {
    let secondsAgos: number[];
    let delta: number;
    let expectedArithmeticMeanTick: number;

    before(async () => {
      let secondsAgo = 30;
      delta = 20;
      secondsAgos = [secondsAgo, secondsAgo - delta];
    });

    // arithmeticMeanTick = tickCumulativesDelta / delta
    context('when arithmeticMeanTick is truncated', () => {
      before(async () => {
        let tickCumulative = 3000;
        let tickCumulativesDelta = 2000;
        let tickCumulatives = [tickCumulative, tickCumulative + tickCumulativesDelta];
        expectedArithmeticMeanTick = Math.floor(tickCumulativesDelta / delta);
        uniswapV3K3PR.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
      });

      it('should return the requested observation', async () => {
        let secondsNow = (await ethers.provider.getBlock('latest')).timestamp;
        let expectedArithmeticMeanBlockTimestamp = (secondsNow - secondsAgos[0] + (secondsNow - secondsAgos[1])) / 2;
        let [arithmeticMeanBlockTimestamp, arithmeticMeanTick] = await dataFeed.fetchObservation(uniswapV3K3PR.address, secondsAgos);
        expect(arithmeticMeanBlockTimestamp).to.eq(expectedArithmeticMeanBlockTimestamp);
        expect(arithmeticMeanTick).to.eq(expectedArithmeticMeanTick);
      });
    });

    // arithmeticMeanTick = tickCumulativesDelta / delta
    context('when arithmeticMeanTick is rounded to negative infinity', () => {
      before(async () => {
        let tickCumulative = 3000;
        let tickCumulativesDelta = -2001;
        let tickCumulatives = [tickCumulative, tickCumulative + tickCumulativesDelta];
        expectedArithmeticMeanTick = Math.floor(tickCumulativesDelta / delta);
        uniswapV3K3PR.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
      });

      it('should return the requested observation', async () => {
        let secondsNow = (await ethers.provider.getBlock('latest')).timestamp;
        let expectedArithmeticMeanBlockTimestamp = (secondsNow - secondsAgos[0] + (secondsNow - secondsAgos[1])) / 2;
        let [arithmeticMeanBlockTimestamp, arithmeticMeanTick] = await dataFeed.fetchObservation(uniswapV3K3PR.address, secondsAgos);
        expect(arithmeticMeanBlockTimestamp).to.eq(expectedArithmeticMeanBlockTimestamp);
        expect(arithmeticMeanTick).to.eq(expectedArithmeticMeanTick);
      });
    });
  });

  describe('whitelistAdapter', () => {
    onlyGovernance(
      () => dataFeed,
      'whitelistAdapter',
      () => governance,
      () => [connextSenderAdapter.address, true]
    );
    it('should whitelist the connext adapter', async () => {
      await dataFeed.connect(governance).whitelistAdapter(connextSenderAdapter.address, true);
      expect(await dataFeed.whitelistedAdapters(connextSenderAdapter.address)).to.eq(true);
    });

    it('should remove whitelist from the connext adapter', async () => {
      await dataFeed.connect(governance).whitelistAdapter(connextSenderAdapter.address, true);
      await dataFeed.connect(governance).whitelistAdapter(connextSenderAdapter.address, false);
      expect(await dataFeed.whitelistedAdapters(connextSenderAdapter.address)).to.eq(false);
    });

    it('should emit an even when adapter is whitelisted', async () => {
      await expect(await dataFeed.connect(governance).whitelistAdapter(connextSenderAdapter.address, true))
        .to.emit(dataFeed, 'AdapterWhitelisted')
        .withArgs(connextSenderAdapter.address, true);
    });

    it('should emit an even when adapter whitelist is revoked', async () => {
      await dataFeed.connect(governance).whitelistAdapter(connextSenderAdapter.address, true);
      await expect(await dataFeed.connect(governance).whitelistAdapter(connextSenderAdapter.address, false))
        .to.emit(dataFeed, 'AdapterWhitelisted')
        .withArgs(connextSenderAdapter.address, false);
    });
  });

  describe('whitelistAdapters', () => {
    onlyGovernance(
      () => dataFeed,
      'whitelistAdapters',
      () => governance,
      () => [
        [connextSenderAdapter.address, fakeAdapter.address],
        [true, true],
      ]
    );

    it('should revert if the lengths of the arguments dont match', async () => {
      await expect(
        dataFeed.connect(governance).whitelistAdapters([connextSenderAdapter.address, fakeAdapter.address], [true])
      ).to.be.revertedWith('LengthMismatch()');

      await expect(dataFeed.connect(governance).whitelistAdapters([connextSenderAdapter.address], [true, true])).to.be.revertedWith(
        'LengthMismatch()'
      );
    });

    it('should whitelist the adapters', async () => {
      await dataFeed.connect(governance).whitelistAdapters([connextSenderAdapter.address, fakeAdapter.address], [true, true]);
      expect(await dataFeed.whitelistedAdapters(connextSenderAdapter.address)).to.eq(true);
      expect(await dataFeed.whitelistedAdapters(fakeAdapter.address)).to.eq(true);
    });

    it('should remove whitelist from the adapters', async () => {
      await dataFeed.connect(governance).whitelistAdapters([connextSenderAdapter.address, fakeAdapter.address], [true, true]);
      await dataFeed.connect(governance).whitelistAdapters([connextSenderAdapter.address, fakeAdapter.address], [false, false]);
      expect(await dataFeed.whitelistedAdapters(connextSenderAdapter.address)).to.eq(false);
      expect(await dataFeed.whitelistedAdapters(fakeAdapter.address)).to.eq(false);
    });

    it('should emit n events when n adapters are whitelisted', async () => {
      tx = await dataFeed.connect(governance).whitelistAdapters([connextSenderAdapter.address, fakeAdapter.address], [true, true]);
      await expect(tx).to.emit(dataFeed, 'AdapterWhitelisted').withArgs(connextSenderAdapter.address, true);

      await expect(tx).to.emit(dataFeed, 'AdapterWhitelisted').withArgs(fakeAdapter.address, true);
    });

    it('should emit n events when n adapters whitelists are revoked', async () => {
      tx = await dataFeed.connect(governance).whitelistAdapters([connextSenderAdapter.address, fakeAdapter.address], [false, false]);

      await dataFeed.connect(governance).whitelistAdapters([connextSenderAdapter.address, fakeAdapter.address], [true, true]);
      await expect(tx).to.emit(dataFeed, 'AdapterWhitelisted').withArgs(connextSenderAdapter.address, false);

      await expect(tx).to.emit(dataFeed, 'AdapterWhitelisted').withArgs(fakeAdapter.address, false);
    });
  });

  describe('setReceiver', () => {
    let bridgeDestinationId: string;

    onlyGovernance(
      () => dataFeed,
      'setReceiver',
      () => governance,
      () => [connextSenderAdapter.address, randomDestinationDomainId, randomDataReceiverAddress]
    );

    it('should set a receiver', async () => {
      await dataFeed.connect(governance).setReceiver(connextSenderAdapter.address, randomDestinationDomainId, randomDataReceiverAddress);
      expect(await dataFeed.receivers(connextSenderAdapter.address, randomDestinationDomainId)).to.eq(randomDataReceiverAddress);
    });

    it('should emit an even when a receiver is set', async () => {
      await expect(
        await dataFeed.connect(governance).setReceiver(connextSenderAdapter.address, randomDestinationDomainId, randomDataReceiverAddress)
      )
        .to.emit(dataFeed, 'ReceiverSet')
        .withArgs(connextSenderAdapter.address, randomDestinationDomainId, randomDataReceiverAddress);
    });
  });

  describe('setReceivers', () => {
    let validArgs: [string[], number[], string[]];

    before(() => {
      validArgs = [
        [connextSenderAdapter.address, fakeAdapter.address],
        [randomDestinationDomainId, randomDestinationDomainId],
        [randomDataReceiverAddress, randomDataReceiverAddress2],
      ];
    });

    onlyGovernance(
      () => dataFeed,
      'setReceivers',
      () => governance,
      () => [
        [connextSenderAdapter.address, fakeAdapter.address],
        [randomDestinationDomainId, randomDestinationDomainId],
        [randomDataReceiverAddress, randomDataReceiverAddress2],
      ]
    );

    it('should revert if the lengths of the arguments dont match', async () => {
      const mismatchedArgs = [
        [connextSenderAdapter.address, fakeAdapter.address],
        [randomDestinationDomainId, randomDestinationDomainId],
        [randomDataReceiverAddress],
      ];

      const mismatchedArgs2 = [
        [connextSenderAdapter.address, fakeAdapter.address],
        [randomDestinationDomainId],
        [randomDataReceiverAddress, randomDataReceiverAddress2],
      ];

      const mismatchedArgs3 = [
        [connextSenderAdapter.address],
        [randomDestinationDomainId, randomDestinationDomainId],
        [randomDataReceiverAddress, randomDataReceiverAddress2],
      ];

      await expect(dataFeed.connect(governance).setReceivers(...mismatchedArgs)).to.be.revertedWith('LengthMismatch()');

      await expect(dataFeed.connect(governance).setReceivers(...mismatchedArgs2)).to.be.revertedWith('LengthMismatch()');

      await expect(dataFeed.connect(governance).setReceivers(...mismatchedArgs3)).to.be.revertedWith('LengthMismatch()');
    });

    it('should set the receivers', async () => {
      await dataFeed.connect(governance).setReceivers(...validArgs);
      expect(await dataFeed.receivers(connextSenderAdapter.address, randomDestinationDomainId)).to.eq(randomDataReceiverAddress);
      expect(await dataFeed.receivers(fakeAdapter.address, randomDestinationDomainId)).to.eq(randomDataReceiverAddress2);
    });

    it('should emit n events when n receivers are set', async () => {
      tx = await dataFeed.connect(governance).setReceivers(...validArgs);
      await expect(tx)
        .to.emit(dataFeed, 'ReceiverSet')
        .withArgs(connextSenderAdapter.address, randomDestinationDomainId, randomDataReceiverAddress);

      await expect(tx).to.emit(dataFeed, 'ReceiverSet').withArgs(fakeAdapter.address, randomDestinationDomainId, randomDataReceiverAddress2);
    });
  });

  describe('setDestinationDomainId', () => {
    onlyGovernance(
      () => dataFeed,
      'setDestinationDomainId',
      () => governance,
      () => [connextSenderAdapter.address, randomChainId, randomDestinationDomainId]
    );

    it('should set a destination domain id', async () => {
      await dataFeed.connect(governance).setDestinationDomainId(connextSenderAdapter.address, randomChainId, randomDestinationDomainId);
      expect(await dataFeed.destinationDomainIds(connextSenderAdapter.address, randomChainId)).to.eq(randomDestinationDomainId);
    });

    it('should emit an even when a destination domain id is set', async () => {
      await expect(
        await dataFeed.connect(governance).setDestinationDomainId(connextSenderAdapter.address, randomChainId, randomDestinationDomainId)
      )
        .to.emit(dataFeed, 'DestinationDomainIdSet')
        .withArgs(connextSenderAdapter.address, randomChainId, randomDestinationDomainId);
    });
  });

  describe('setDestinationDomainIds', () => {
    let validArgs: [string[], number[], number[]];

    before(async () => {
      validArgs = [
        [connextSenderAdapter.address, fakeAdapter.address],
        [randomChainId, randomChainId2],
        [randomDestinationDomainId, randomDestinationDomainId2],
      ];
    });

    onlyGovernance(
      () => dataFeed,
      'setDestinationDomainIds',
      () => governance,
      () => [
        [connextSenderAdapter.address, fakeAdapter.address],
        [randomChainId, randomChainId2],
        [randomDestinationDomainId, randomDestinationDomainId2],
      ]
    );

    it('should revert if the lengths of the arguments dont match', async () => {
      const mismatchedArgs = [[connextSenderAdapter.address, fakeAdapter.address], [randomChainId, randomChainId2], [randomDestinationDomainId]];

      const mismatchedArgs2 = [
        [connextSenderAdapter.address, fakeAdapter.address],
        [randomChainId],
        [randomDestinationDomainId, randomDestinationDomainId2],
      ];

      const mismatchedArgs3 = [
        [connextSenderAdapter.address],
        [randomChainId, randomChainId2],
        [randomDestinationDomainId, randomDestinationDomainId2],
      ];

      await expect(dataFeed.connect(governance).setDestinationDomainIds(...mismatchedArgs)).to.be.revertedWith('LengthMismatch()');

      await expect(dataFeed.connect(governance).setDestinationDomainIds(...mismatchedArgs2)).to.be.revertedWith('LengthMismatch()');

      await expect(dataFeed.connect(governance).setDestinationDomainIds(...mismatchedArgs3)).to.be.revertedWith('LengthMismatch()');
    });

    it('should set the destination domain ids', async () => {
      await dataFeed.connect(governance).setDestinationDomainIds(...validArgs);
      expect(await dataFeed.destinationDomainIds(connextSenderAdapter.address, randomChainId)).to.eq(randomDestinationDomainId);
      expect(await dataFeed.destinationDomainIds(fakeAdapter.address, randomChainId2)).to.eq(randomDestinationDomainId2);
    });

    it('should emit n events when n destination domains are set', async () => {
      tx = await dataFeed.connect(governance).setDestinationDomainIds(...validArgs);
      await expect(tx)
        .to.emit(dataFeed, 'DestinationDomainIdSet')
        .withArgs(connextSenderAdapter.address, randomChainId, randomDestinationDomainId);

      await expect(tx).to.emit(dataFeed, 'DestinationDomainIdSet').withArgs(fakeAdapter.address, randomChainId2, randomDestinationDomainId2);
    });
  });
});
