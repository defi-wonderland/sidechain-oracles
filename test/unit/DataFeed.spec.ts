import { ethers } from 'hardhat';
import { ContractTransaction } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { DataFeed, DataFeed__factory, IUniswapV3Pool, IConnextSenderAdapter } from '@typechained';
import { smock, MockContract, MockContractFactory, FakeContract } from '@defi-wonderland/smock';
import { evm, wallet } from '@utils';
import { readArgFromEvent } from '@utils/event-utils';
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

  describe('sendObservations(...)', () => {
    let secondsAgos: number[];
    let secondsAgo: number;
    let delta1: number;
    let delta2: number;
    let arithmeticMeanTick1: number;
    let arithmeticMeanTick2: number;

    before(async () => {
      secondsAgo = 30;
      delta1 = 20;
      delta2 = 10;
      secondsAgos = [secondsAgo, secondsAgo - delta1, secondsAgo - (delta1 + delta2)];
    });

    context('when the adapter is not whitelisted', () => {
      it('should revert', async () => {
        await expect(
          dataFeed.connect(randomUser).sendObservations(connextSenderAdapter.address, randomChainId, uniswapV3K3PR.address, secondsAgos)
        ).to.be.revertedWith('UnallowedAdapter()');
      });
    });

    context('when the adapter is whitelisted but the domain id is not set', () => {
      it('should revert', async () => {
        await dataFeed.connect(governance).whitelistAdapter(connextSenderAdapter.address, true);
        await expect(
          dataFeed.connect(randomUser).sendObservations(connextSenderAdapter.address, randomChainId, uniswapV3K3PR.address, secondsAgos)
        ).to.be.revertedWith('DestinationDomainIdNotSet()');
      });
    });

    context('when the adapter is whitelisted, the domain id is set, but the receiver is not set', () => {
      it('should revert', async () => {
        await dataFeed.connect(governance).whitelistAdapter(connextSenderAdapter.address, true);
        await dataFeed.connect(governance).setDestinationDomainId(connextSenderAdapter.address, randomChainId, randomDestinationDomainId);
        await expect(
          dataFeed.connect(randomUser).sendObservations(connextSenderAdapter.address, randomChainId, uniswapV3K3PR.address, secondsAgos)
        ).to.be.revertedWith('ReceiverNotSet()');
      });
    });

    context('when the adapter is whitelisted and the domain id and receiver are set', () => {
      beforeEach(async () => {
        await dataFeed.connect(governance).whitelistAdapter(connextSenderAdapter.address, true);
        await dataFeed.connect(governance).setDestinationDomainId(connextSenderAdapter.address, randomChainId, randomDestinationDomainId);
        await dataFeed.connect(governance).setReceiver(connextSenderAdapter.address, randomDestinationDomainId, randomDataReceiverAddress);
        connextSenderAdapter.bridgeObservations.reset();
      });

      it('should revert if _secondsAgos is invalid', async () => {
        let secondsAgos = [secondsAgo];
        await expect(
          dataFeed.sendObservations(connextSenderAdapter.address, randomChainId, uniswapV3K3PR.address, secondsAgos)
        ).to.be.revertedWith('InvalidSecondsAgos()');
      });

      it('should revert if _secondsAgos is unsorted', async () => {
        let secondsAgos = [secondsAgo - (delta1 + delta2), secondsAgo - delta1, secondsAgo];
        let tickCumulatives = [0, 0, 0];
        uniswapV3K3PR.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
        await expect(dataFeed.sendObservations(connextSenderAdapter.address, randomChainId, uniswapV3K3PR.address, secondsAgos)).to.be.reverted;
      });

      // arithmeticMeanTick = tickCumulativesDelta / delta
      context('when arithmeticMeanTick is truncated', () => {
        before(async () => {
          let tickCumulative = 3000;
          let tickCumulativesDelta1 = 2000;
          let tickCumulativesDelta2 = 1000;
          let tickCumulatives = [
            tickCumulative,
            tickCumulative + tickCumulativesDelta1,
            tickCumulative + (tickCumulativesDelta1 + tickCumulativesDelta2),
          ];
          arithmeticMeanTick1 = Math.floor(tickCumulativesDelta1 / delta1);
          arithmeticMeanTick2 = Math.floor(tickCumulativesDelta2 / delta2);
          uniswapV3K3PR.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
        });

        it('should call bridgeObservations with the correct arguments', async () => {
          let secondsNow = (await ethers.provider.getBlock('latest')).timestamp + 1;
          let arithmeticMeanBlockTimestamp1 = (secondsNow - secondsAgos[0] + (secondsNow - secondsAgos[1])) / 2;
          let observationData1 = [arithmeticMeanBlockTimestamp1, arithmeticMeanTick1];
          let arithmeticMeanBlockTimestamp2 = (secondsNow - secondsAgos[1] + (secondsNow - secondsAgos[2])) / 2;
          let observationData2 = [arithmeticMeanBlockTimestamp2, arithmeticMeanTick2];
          let observationsData = [observationData1, observationData2];
          await dataFeed.sendObservations(connextSenderAdapter.address, randomChainId, uniswapV3K3PR.address, secondsAgos);
          expect(connextSenderAdapter.bridgeObservations).to.have.been.calledOnceWith(
            randomDataReceiverAddress,
            randomDestinationDomainId,
            observationsData
          );
        });

        it('should emit an event', async () => {
          let secondsNow = (await ethers.provider.getBlock('latest')).timestamp + 1;
          let arithmeticMeanBlockTimestamp1 = (secondsNow - secondsAgos[0] + (secondsNow - secondsAgos[1])) / 2;
          let observationData1 = [arithmeticMeanBlockTimestamp1, arithmeticMeanTick1];
          let arithmeticMeanBlockTimestamp2 = (secondsNow - secondsAgos[1] + (secondsNow - secondsAgos[2])) / 2;
          let observationData2 = [arithmeticMeanBlockTimestamp2, arithmeticMeanTick2];
          let observationsData = [observationData1, observationData2];
          let tx = await dataFeed.sendObservations(connextSenderAdapter.address, randomChainId, uniswapV3K3PR.address, secondsAgos);
          let eventBridgeSenderAdapter = await readArgFromEvent(tx, 'DataSent', '_bridgeSenderAdapter');
          let eventDataReceiver = await readArgFromEvent(tx, 'DataSent', '_dataReceiver');
          let eventDestinationDomainId = await readArgFromEvent(tx, 'DataSent', '_destinationDomainId');
          let eventObservationsData = await readArgFromEvent(tx, 'DataSent', '_observationsData');
          expect(eventBridgeSenderAdapter).to.eq(connextSenderAdapter.address);
          expect(eventDataReceiver).to.eq(randomDataReceiverAddress);
          expect(eventDestinationDomainId).to.eq(randomDestinationDomainId);
          expect(eventObservationsData).to.eql(observationsData);
        });
      });

      // arithmeticMeanTick = tickCumulativesDelta / delta
      context('when arithmeticMeanTick is rounded to negative infinity', () => {
        before(async () => {
          let tickCumulative = 3000;
          let tickCumulativesDelta1 = -2001;
          let tickCumulativesDelta2 = -1002;
          let tickCumulatives = [
            tickCumulative,
            tickCumulative + tickCumulativesDelta1,
            tickCumulative + (tickCumulativesDelta1 + tickCumulativesDelta2),
          ];
          arithmeticMeanTick1 = Math.floor(tickCumulativesDelta1 / delta1);
          arithmeticMeanTick2 = Math.floor(tickCumulativesDelta2 / delta2);
          uniswapV3K3PR.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
        });

        it('should call bridgeObservations with the correct arguments', async () => {
          let secondsNow = (await ethers.provider.getBlock('latest')).timestamp + 1;
          let arithmeticMeanBlockTimestamp1 = (secondsNow - secondsAgos[0] + (secondsNow - secondsAgos[1])) / 2;
          let observationData1 = [arithmeticMeanBlockTimestamp1, arithmeticMeanTick1];
          let arithmeticMeanBlockTimestamp2 = (secondsNow - secondsAgos[1] + (secondsNow - secondsAgos[2])) / 2;
          let observationData2 = [arithmeticMeanBlockTimestamp2, arithmeticMeanTick2];
          let observationsData = [observationData1, observationData2];
          await dataFeed.sendObservations(connextSenderAdapter.address, randomChainId, uniswapV3K3PR.address, secondsAgos);
          expect(connextSenderAdapter.bridgeObservations).to.have.been.calledOnceWith(
            randomDataReceiverAddress,
            randomDestinationDomainId,
            observationsData
          );
        });

        it('should emit an event', async () => {
          let secondsNow = (await ethers.provider.getBlock('latest')).timestamp + 1;
          let arithmeticMeanBlockTimestamp1 = (secondsNow - secondsAgos[0] + (secondsNow - secondsAgos[1])) / 2;
          let observationData1 = [arithmeticMeanBlockTimestamp1, arithmeticMeanTick1];
          let arithmeticMeanBlockTimestamp2 = (secondsNow - secondsAgos[1] + (secondsNow - secondsAgos[2])) / 2;
          let observationData2 = [arithmeticMeanBlockTimestamp2, arithmeticMeanTick2];
          let observationsData = [observationData1, observationData2];
          let tx = await dataFeed.sendObservations(connextSenderAdapter.address, randomChainId, uniswapV3K3PR.address, secondsAgos);
          let eventBridgeSenderAdapter = await readArgFromEvent(tx, 'DataSent', '_bridgeSenderAdapter');
          let eventDataReceiver = await readArgFromEvent(tx, 'DataSent', '_dataReceiver');
          let eventDestinationDomainId = await readArgFromEvent(tx, 'DataSent', '_destinationDomainId');
          let eventObservationsData = await readArgFromEvent(tx, 'DataSent', '_observationsData');
          expect(eventBridgeSenderAdapter).to.eq(connextSenderAdapter.address);
          expect(eventDataReceiver).to.eq(randomDataReceiverAddress);
          expect(eventDestinationDomainId).to.eq(randomDestinationDomainId);
          expect(eventObservationsData).to.eql(observationsData);
        });
      });
    });
  });

  describe('fetchObservations(...)', () => {
    let secondsAgos: number[];
    let secondsAgo: number;
    let delta1: number;
    let delta2: number;
    let arithmeticMeanTick1: number;
    let arithmeticMeanTick2: number;

    before(async () => {
      secondsAgo = 30;
      delta1 = 20;
      delta2 = 10;
      secondsAgos = [secondsAgo, secondsAgo - delta1, secondsAgo - (delta1 + delta2)];
    });

    it('should revert if _secondsAgos is invalid', async () => {
      let secondsAgos = [secondsAgo];
      await expect(dataFeed.fetchObservations(uniswapV3K3PR.address, secondsAgos)).to.be.revertedWith('InvalidSecondsAgos()');
    });

    it('should revert if _secondsAgos is unsorted', async () => {
      let secondsAgos = [secondsAgo - (delta1 + delta2), secondsAgo - delta1, secondsAgo];
      let tickCumulatives = [0, 0, 0];
      uniswapV3K3PR.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
      await expect(dataFeed.fetchObservations(uniswapV3K3PR.address, secondsAgos)).to.be.reverted;
    });

    // arithmeticMeanTick = tickCumulativesDelta / delta
    context('when arithmeticMeanTick is truncated', () => {
      before(async () => {
        let tickCumulative = 3000;
        let tickCumulativesDelta1 = 2000;
        let tickCumulativesDelta2 = 1000;
        let tickCumulatives = [
          tickCumulative,
          tickCumulative + tickCumulativesDelta1,
          tickCumulative + (tickCumulativesDelta1 + tickCumulativesDelta2),
        ];
        arithmeticMeanTick1 = Math.floor(tickCumulativesDelta1 / delta1);
        arithmeticMeanTick2 = Math.floor(tickCumulativesDelta2 / delta2);
        uniswapV3K3PR.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
      });

      it('should return the requested observations', async () => {
        let secondsNow = (await ethers.provider.getBlock('latest')).timestamp;
        let arithmeticMeanBlockTimestamp1 = (secondsNow - secondsAgos[0] + (secondsNow - secondsAgos[1])) / 2;
        let observationData1 = [arithmeticMeanBlockTimestamp1, arithmeticMeanTick1];
        let arithmeticMeanBlockTimestamp2 = (secondsNow - secondsAgos[1] + (secondsNow - secondsAgos[2])) / 2;
        let observationData2 = [arithmeticMeanBlockTimestamp2, arithmeticMeanTick2];
        let expectedObservationsData = [observationData1, observationData2];
        let observationsData = await dataFeed.fetchObservations(uniswapV3K3PR.address, secondsAgos);
        expect(observationsData).to.eql(expectedObservationsData);
      });
    });

    // arithmeticMeanTick = tickCumulativesDelta / delta
    context('when arithmeticMeanTick is rounded to negative infinity', () => {
      before(async () => {
        let tickCumulative = 3000;
        let tickCumulativesDelta1 = -2001;
        let tickCumulativesDelta2 = -1002;
        let tickCumulatives = [
          tickCumulative,
          tickCumulative + tickCumulativesDelta1,
          tickCumulative + (tickCumulativesDelta1 + tickCumulativesDelta2),
        ];
        arithmeticMeanTick1 = Math.floor(tickCumulativesDelta1 / delta1);
        arithmeticMeanTick2 = Math.floor(tickCumulativesDelta2 / delta2);
        uniswapV3K3PR.observe.whenCalledWith(secondsAgos).returns([tickCumulatives, []]);
      });

      it('should return the requested observations', async () => {
        let secondsNow = (await ethers.provider.getBlock('latest')).timestamp;
        let arithmeticMeanBlockTimestamp1 = (secondsNow - secondsAgos[0] + (secondsNow - secondsAgos[1])) / 2;
        let observationData1 = [arithmeticMeanBlockTimestamp1, arithmeticMeanTick1];
        let arithmeticMeanBlockTimestamp2 = (secondsNow - secondsAgos[1] + (secondsNow - secondsAgos[2])) / 2;
        let observationData2 = [arithmeticMeanBlockTimestamp2, arithmeticMeanTick2];
        let expectedObservationsData = [observationData1, observationData2];
        let observationsData = await dataFeed.fetchObservations(uniswapV3K3PR.address, secondsAgos);
        expect(observationsData).to.eql(expectedObservationsData);
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

    it('should emit an event when adapter is whitelisted', async () => {
      await expect(await dataFeed.connect(governance).whitelistAdapter(connextSenderAdapter.address, true))
        .to.emit(dataFeed, 'AdapterWhitelisted')
        .withArgs(connextSenderAdapter.address, true);
    });

    it('should emit an event when adapter whitelist is revoked', async () => {
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

    it('should emit an event when a receiver is set', async () => {
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

    it('should emit an event when a destination domain id is set', async () => {
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
