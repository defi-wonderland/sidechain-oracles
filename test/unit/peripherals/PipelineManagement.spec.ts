import { ethers } from 'hardhat';
import { ContractTransaction } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { DataFeed, DataFeed__factory, IConnextSenderAdapter } from '@typechained';
import { smock, MockContract, MockContractFactory, FakeContract } from '@defi-wonderland/smock';
import { evm, wallet } from '@utils';
import { VALID_POOL_SALT } from '@utils/constants';
import { onlyGovernor } from '@utils/behaviours';
import { getRandomBytes32 } from '@utils/misc';
import chai, { expect } from 'chai';

chai.use(smock.matchers);

describe('PipelineManagement.sol', () => {
  let governor: SignerWithAddress;
  let keeper: SignerWithAddress;
  let dataFeed: MockContract<DataFeed>;
  let dataFeedFactory: MockContractFactory<DataFeed__factory>;
  let connextSenderAdapter: FakeContract<IConnextSenderAdapter>;
  let fakeAdapter: FakeContract<IConnextSenderAdapter>;
  let tx: ContractTransaction;
  let snapshotId: string;

  const randomDataReceiverAddress = wallet.generateRandomAddress();
  const randomDataReceiverAddress2 = wallet.generateRandomAddress();
  const randomDestinationDomainId = 3;
  const randomDestinationDomainId2 = 34;
  const randomChainId = 32;
  const randomChainId2 = 22;
  const randomSalt = VALID_POOL_SALT;
  const randomSalt2 = getRandomBytes32();

  before(async () => {
    [, governor, keeper] = await ethers.getSigners();

    connextSenderAdapter = await smock.fake('IConnextSenderAdapter');
    fakeAdapter = await smock.fake('IConnextSenderAdapter');

    dataFeedFactory = await smock.mock('DataFeed');
    dataFeed = await dataFeedFactory.deploy(governor.address, keeper.address);

    snapshotId = await evm.snapshot.take();
  });

  beforeEach(async () => {
    await evm.snapshot.revert(snapshotId);
  });

  describe('whitelistPipeline(...)', () => {
    const lastPoolNonceObserved = 2;

    beforeEach(async () => {
      await dataFeed.setVariable('lastPoolStateObserved', { [randomSalt]: { poolNonce: lastPoolNonceObserved } });
    });

    onlyGovernor(
      () => dataFeed,
      'whitelistPipeline',
      () => governor,
      () => [randomChainId, randomSalt]
    );

    it('should revert if the pipeline has already been whitelisted', async () => {
      await dataFeed.connect(governor).whitelistPipeline(randomChainId, randomSalt);
      await expect(dataFeed.connect(governor).whitelistPipeline(randomChainId, randomSalt)).to.be.revertedWith('AlreadyAllowedPipeline()');
    });

    it('should whitelist the next pool nonce to be observed', async () => {
      await dataFeed.connect(governor).whitelistPipeline(randomChainId, randomSalt);
      expect(await dataFeed.whitelistedNonces(randomChainId, randomSalt)).to.eq(lastPoolNonceObserved + 1);
    });

    it('should whitelist the pool', async () => {
      await dataFeed.connect(governor).whitelistPipeline(randomChainId, randomSalt);
      expect(await dataFeed.isWhitelistedPool(randomSalt)).to.eq(true);
    });

    it('should emit an event when a pipeline is whitelisted', async () => {
      await expect(await dataFeed.connect(governor).whitelistPipeline(randomChainId, randomSalt))
        .to.emit(dataFeed, 'PipelineWhitelisted')
        .withArgs(randomChainId, randomSalt, lastPoolNonceObserved + 1);
    });
  });

  describe('whitelistPipelines(...)', () => {
    let validArgs: [number[], string[]];
    const lastPoolNonceObserved = 2;
    const lastPoolNonceObserved2 = 4;

    before(() => {
      validArgs = [
        [randomChainId, randomChainId2],
        [randomSalt, randomSalt2],
      ];
    });

    beforeEach(async () => {
      await dataFeed.setVariable('lastPoolStateObserved', { [randomSalt]: { poolNonce: lastPoolNonceObserved } });
      await dataFeed.setVariable('lastPoolStateObserved', { [randomSalt2]: { poolNonce: lastPoolNonceObserved2 } });
    });

    onlyGovernor(
      () => dataFeed,
      'whitelistPipelines',
      () => governor,
      () => [
        [randomChainId, randomChainId2],
        [randomSalt, randomSalt2],
      ]
    );

    it('should revert if the lengths of the arguments do not match', async () => {
      const mismatchedArgs = [[randomChainId, randomChainId2], [randomSalt]];
      const mismatchedArgs2 = [[randomChainId], [randomSalt, randomSalt2]];

      await expect(dataFeed.connect(governor).whitelistPipelines(...mismatchedArgs)).to.be.revertedWith('LengthMismatch()');
      await expect(dataFeed.connect(governor).whitelistPipelines(...mismatchedArgs2)).to.be.revertedWith('LengthMismatch()');
    });

    it('should revert if the pipelines have already been whitelisted', async () => {
      await dataFeed.connect(governor).whitelistPipelines(...validArgs);
      await expect(dataFeed.connect(governor).whitelistPipelines(...validArgs)).to.be.revertedWith('AlreadyAllowedPipeline()');
    });

    it('should whitelist the next pool nonces to be observed', async () => {
      await dataFeed.connect(governor).whitelistPipelines(...validArgs);
      expect(await dataFeed.whitelistedNonces(randomChainId, randomSalt)).to.eq(lastPoolNonceObserved + 1);
      expect(await dataFeed.whitelistedNonces(randomChainId2, randomSalt2)).to.eq(lastPoolNonceObserved2 + 1);
    });

    it('should whitelist the pools', async () => {
      await dataFeed.connect(governor).whitelistPipelines(...validArgs);
      expect(await dataFeed.isWhitelistedPool(randomSalt)).to.eq(true);
      expect(await dataFeed.isWhitelistedPool(randomSalt2)).to.eq(true);
    });

    it('should emit n events when n pipelines are whitelisted', async () => {
      tx = await dataFeed.connect(governor).whitelistPipelines(...validArgs);
      await expect(tx)
        .to.emit(dataFeed, 'PipelineWhitelisted')
        .withArgs(randomChainId, randomSalt, lastPoolNonceObserved + 1);

      await expect(tx)
        .to.emit(dataFeed, 'PipelineWhitelisted')
        .withArgs(randomChainId2, randomSalt2, lastPoolNonceObserved2 + 1);
    });
  });

  describe('whitelistAdapter(...)', () => {
    onlyGovernor(
      () => dataFeed,
      'whitelistAdapter',
      () => governor,
      () => [connextSenderAdapter.address, true]
    );

    it('should whitelist the connext adapter', async () => {
      await dataFeed.connect(governor).whitelistAdapter(connextSenderAdapter.address, true);
      expect(await dataFeed.whitelistedAdapters(connextSenderAdapter.address)).to.eq(true);
    });

    it('should remove whitelist from the connext adapter', async () => {
      await dataFeed.connect(governor).whitelistAdapter(connextSenderAdapter.address, true);
      await dataFeed.connect(governor).whitelistAdapter(connextSenderAdapter.address, false);
      expect(await dataFeed.whitelistedAdapters(connextSenderAdapter.address)).to.eq(false);
    });

    it('should emit an event when adapter is whitelisted', async () => {
      await expect(await dataFeed.connect(governor).whitelistAdapter(connextSenderAdapter.address, true))
        .to.emit(dataFeed, 'AdapterWhitelisted')
        .withArgs(connextSenderAdapter.address, true);
    });

    it('should emit an event when adapter whitelist is revoked', async () => {
      await dataFeed.connect(governor).whitelistAdapter(connextSenderAdapter.address, true);
      await expect(await dataFeed.connect(governor).whitelistAdapter(connextSenderAdapter.address, false))
        .to.emit(dataFeed, 'AdapterWhitelisted')
        .withArgs(connextSenderAdapter.address, false);
    });
  });

  describe('whitelistAdapters(...)', () => {
    onlyGovernor(
      () => dataFeed,
      'whitelistAdapters',
      () => governor,
      () => [
        [connextSenderAdapter.address, fakeAdapter.address],
        [true, true],
      ]
    );

    it('should revert if the lengths of the arguments do not match', async () => {
      await expect(dataFeed.connect(governor).whitelistAdapters([connextSenderAdapter.address, fakeAdapter.address], [true])).to.be.revertedWith(
        'LengthMismatch()'
      );

      await expect(dataFeed.connect(governor).whitelistAdapters([connextSenderAdapter.address], [true, true])).to.be.revertedWith(
        'LengthMismatch()'
      );
    });

    it('should whitelist the adapters', async () => {
      await dataFeed.connect(governor).whitelistAdapters([connextSenderAdapter.address, fakeAdapter.address], [true, true]);
      expect(await dataFeed.whitelistedAdapters(connextSenderAdapter.address)).to.eq(true);
      expect(await dataFeed.whitelistedAdapters(fakeAdapter.address)).to.eq(true);
    });

    it('should remove whitelist from the adapters', async () => {
      await dataFeed.connect(governor).whitelistAdapters([connextSenderAdapter.address, fakeAdapter.address], [true, true]);
      await dataFeed.connect(governor).whitelistAdapters([connextSenderAdapter.address, fakeAdapter.address], [false, false]);
      expect(await dataFeed.whitelistedAdapters(connextSenderAdapter.address)).to.eq(false);
      expect(await dataFeed.whitelistedAdapters(fakeAdapter.address)).to.eq(false);
    });

    it('should emit n events when n adapters are whitelisted', async () => {
      tx = await dataFeed.connect(governor).whitelistAdapters([connextSenderAdapter.address, fakeAdapter.address], [true, true]);
      await expect(tx).to.emit(dataFeed, 'AdapterWhitelisted').withArgs(connextSenderAdapter.address, true);

      await expect(tx).to.emit(dataFeed, 'AdapterWhitelisted').withArgs(fakeAdapter.address, true);
    });

    it('should emit n events when n adapters whitelists are revoked', async () => {
      tx = await dataFeed.connect(governor).whitelistAdapters([connextSenderAdapter.address, fakeAdapter.address], [false, false]);

      await dataFeed.connect(governor).whitelistAdapters([connextSenderAdapter.address, fakeAdapter.address], [true, true]);
      await expect(tx).to.emit(dataFeed, 'AdapterWhitelisted').withArgs(connextSenderAdapter.address, false);

      await expect(tx).to.emit(dataFeed, 'AdapterWhitelisted').withArgs(fakeAdapter.address, false);
    });
  });

  describe('setDestinationDomainId(...)', () => {
    onlyGovernor(
      () => dataFeed,
      'setDestinationDomainId',
      () => governor,
      () => [connextSenderAdapter.address, randomChainId, randomDestinationDomainId]
    );

    it('should set a destination domain id', async () => {
      await dataFeed.connect(governor).setDestinationDomainId(connextSenderAdapter.address, randomChainId, randomDestinationDomainId);
      expect(await dataFeed.destinationDomainIds(connextSenderAdapter.address, randomChainId)).to.eq(randomDestinationDomainId);
    });

    it('should emit an event when a destination domain id is set', async () => {
      await expect(
        await dataFeed.connect(governor).setDestinationDomainId(connextSenderAdapter.address, randomChainId, randomDestinationDomainId)
      )
        .to.emit(dataFeed, 'DestinationDomainIdSet')
        .withArgs(connextSenderAdapter.address, randomChainId, randomDestinationDomainId);
    });
  });

  describe('setDestinationDomainIds(...)', () => {
    let validArgs: [string[], number[], number[]];

    before(async () => {
      validArgs = [
        [connextSenderAdapter.address, fakeAdapter.address],
        [randomChainId, randomChainId2],
        [randomDestinationDomainId, randomDestinationDomainId2],
      ];
    });

    onlyGovernor(
      () => dataFeed,
      'setDestinationDomainIds',
      () => governor,
      () => [
        [connextSenderAdapter.address, fakeAdapter.address],
        [randomChainId, randomChainId2],
        [randomDestinationDomainId, randomDestinationDomainId2],
      ]
    );

    it('should revert if the lengths of the arguments do not match', async () => {
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

      await expect(dataFeed.connect(governor).setDestinationDomainIds(...mismatchedArgs)).to.be.revertedWith('LengthMismatch()');
      await expect(dataFeed.connect(governor).setDestinationDomainIds(...mismatchedArgs2)).to.be.revertedWith('LengthMismatch()');
      await expect(dataFeed.connect(governor).setDestinationDomainIds(...mismatchedArgs3)).to.be.revertedWith('LengthMismatch()');
    });

    it('should set the destination domain ids', async () => {
      await dataFeed.connect(governor).setDestinationDomainIds(...validArgs);
      expect(await dataFeed.destinationDomainIds(connextSenderAdapter.address, randomChainId)).to.eq(randomDestinationDomainId);
      expect(await dataFeed.destinationDomainIds(fakeAdapter.address, randomChainId2)).to.eq(randomDestinationDomainId2);
    });

    it('should emit n events when n destination domains are set', async () => {
      tx = await dataFeed.connect(governor).setDestinationDomainIds(...validArgs);
      await expect(tx)
        .to.emit(dataFeed, 'DestinationDomainIdSet')
        .withArgs(connextSenderAdapter.address, randomChainId, randomDestinationDomainId);

      await expect(tx).to.emit(dataFeed, 'DestinationDomainIdSet').withArgs(fakeAdapter.address, randomChainId2, randomDestinationDomainId2);
    });
  });

  describe('setReceiver(...)', () => {
    onlyGovernor(
      () => dataFeed,
      'setReceiver',
      () => governor,
      () => [connextSenderAdapter.address, randomDestinationDomainId, randomDataReceiverAddress]
    );

    it('should set a receiver', async () => {
      await dataFeed.connect(governor).setReceiver(connextSenderAdapter.address, randomDestinationDomainId, randomDataReceiverAddress);
      expect(await dataFeed.receivers(connextSenderAdapter.address, randomDestinationDomainId)).to.eq(randomDataReceiverAddress);
    });

    it('should emit an event when a receiver is set', async () => {
      await expect(
        await dataFeed.connect(governor).setReceiver(connextSenderAdapter.address, randomDestinationDomainId, randomDataReceiverAddress)
      )
        .to.emit(dataFeed, 'ReceiverSet')
        .withArgs(connextSenderAdapter.address, randomDestinationDomainId, randomDataReceiverAddress);
    });
  });

  describe('setReceivers(...)', () => {
    let validArgs: [string[], number[], string[]];

    before(() => {
      validArgs = [
        [connextSenderAdapter.address, fakeAdapter.address],
        [randomDestinationDomainId, randomDestinationDomainId2],
        [randomDataReceiverAddress, randomDataReceiverAddress2],
      ];
    });

    onlyGovernor(
      () => dataFeed,
      'setReceivers',
      () => governor,
      () => [
        [connextSenderAdapter.address, fakeAdapter.address],
        [randomDestinationDomainId, randomDestinationDomainId2],
        [randomDataReceiverAddress, randomDataReceiverAddress2],
      ]
    );

    it('should revert if the lengths of the arguments do not match', async () => {
      const mismatchedArgs = [
        [connextSenderAdapter.address, fakeAdapter.address],
        [randomDestinationDomainId, randomDestinationDomainId2],
        [randomDataReceiverAddress],
      ];
      const mismatchedArgs2 = [
        [connextSenderAdapter.address, fakeAdapter.address],
        [randomDestinationDomainId],
        [randomDataReceiverAddress, randomDataReceiverAddress2],
      ];
      const mismatchedArgs3 = [
        [connextSenderAdapter.address],
        [randomDestinationDomainId, randomDestinationDomainId2],
        [randomDataReceiverAddress, randomDataReceiverAddress2],
      ];

      await expect(dataFeed.connect(governor).setReceivers(...mismatchedArgs)).to.be.revertedWith('LengthMismatch()');
      await expect(dataFeed.connect(governor).setReceivers(...mismatchedArgs2)).to.be.revertedWith('LengthMismatch()');
      await expect(dataFeed.connect(governor).setReceivers(...mismatchedArgs3)).to.be.revertedWith('LengthMismatch()');
    });

    it('should set the receivers', async () => {
      await dataFeed.connect(governor).setReceivers(...validArgs);
      expect(await dataFeed.receivers(connextSenderAdapter.address, randomDestinationDomainId)).to.eq(randomDataReceiverAddress);
      expect(await dataFeed.receivers(fakeAdapter.address, randomDestinationDomainId2)).to.eq(randomDataReceiverAddress2);
    });

    it('should emit n events when n receivers are set', async () => {
      tx = await dataFeed.connect(governor).setReceivers(...validArgs);
      await expect(tx)
        .to.emit(dataFeed, 'ReceiverSet')
        .withArgs(connextSenderAdapter.address, randomDestinationDomainId, randomDataReceiverAddress);

      await expect(tx).to.emit(dataFeed, 'ReceiverSet').withArgs(fakeAdapter.address, randomDestinationDomainId2, randomDataReceiverAddress2);
    });
  });

  describe('whitelistedPools()', () => {
    beforeEach(async () => {
      await dataFeed.connect(governor).whitelistPipeline(randomChainId, randomSalt);
      await dataFeed.connect(governor).whitelistPipeline(randomChainId2, randomSalt);
      await dataFeed.connect(governor).whitelistPipeline(randomChainId, randomSalt2);
    });

    it('should return the whitelisted pools', async () => {
      let expectedWhitelistedPools = [randomSalt, randomSalt2];
      expect(await dataFeed.whitelistedPools()).to.eql(expectedWhitelistedPools);
    });
  });

  describe('isWhitelistedPool(...)', () => {
    beforeEach(async () => {
      await dataFeed.connect(governor).whitelistPipeline(randomChainId, randomSalt);
    });

    it('should return true if the pool is whitelisted', async () => {
      expect(await dataFeed.isWhitelistedPool(randomSalt)).to.eq(true);
    });

    it('should return false if the pool is not whitelisted', async () => {
      expect(await dataFeed.isWhitelistedPool(randomSalt2)).to.eq(false);
    });
  });

  describe('isWhitelistedPipeline(...)', () => {
    beforeEach(async () => {
      await dataFeed.connect(governor).whitelistPipeline(randomChainId, randomSalt);
    });

    it('should return true if the pipeline is whitelisted', async () => {
      expect(await dataFeed.isWhitelistedPipeline(randomChainId, randomSalt)).to.eq(true);
    });

    it('should return false if the pipeline is not whitelisted', async () => {
      expect(await dataFeed.isWhitelistedPipeline(randomChainId2, randomSalt)).to.eq(false);
      expect(await dataFeed.isWhitelistedPipeline(randomChainId, randomSalt2)).to.eq(false);
      expect(await dataFeed.isWhitelistedPipeline(randomChainId2, randomSalt2)).to.eq(false);
    });
  });

  describe('validateSenderAdapter(...)', () => {
    context('when the adapter is not whitelisted', () => {
      it('should revert', async () => {
        await expect(dataFeed.validateSenderAdapter(connextSenderAdapter.address, randomChainId)).to.be.revertedWith('UnallowedAdapter');
      });
    });

    context('when the adapter is whitelisted but the domain id is not set', () => {
      it('should revert', async () => {
        await dataFeed.connect(governor).whitelistAdapter(connextSenderAdapter.address, true);
        await expect(dataFeed.validateSenderAdapter(connextSenderAdapter.address, randomChainId)).to.be.revertedWith(
          'DestinationDomainIdNotSet'
        );
      });
    });

    context('when the adapter is whitelisted, the domain id is set, but the receiver is not set', () => {
      it('should revert', async () => {
        await dataFeed.connect(governor).whitelistAdapter(connextSenderAdapter.address, true);
        await dataFeed.connect(governor).setDestinationDomainId(connextSenderAdapter.address, randomChainId, randomDestinationDomainId);
        await expect(dataFeed.validateSenderAdapter(connextSenderAdapter.address, randomChainId)).to.be.revertedWith('ReceiverNotSet');
      });
    });

    context('when the adapter is whitelisted and the domain id and receiver are set', () => {
      beforeEach(async () => {
        await dataFeed.connect(governor).whitelistAdapter(connextSenderAdapter.address, true);
        await dataFeed.connect(governor).setDestinationDomainId(connextSenderAdapter.address, randomChainId, randomDestinationDomainId);
        await dataFeed.connect(governor).setReceiver(connextSenderAdapter.address, randomDestinationDomainId, randomDataReceiverAddress);
      });

      it('should return the queried values', async () => {
        expect(await dataFeed.validateSenderAdapter(connextSenderAdapter.address, randomChainId)).to.eql([
          randomDestinationDomainId,
          randomDataReceiverAddress,
        ]);
      });
    });
  });
});
