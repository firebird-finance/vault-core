const {ethers, providers, Contract, BigNumber} = require('ethers');
require('dotenv').config();
const VaultABI = require('../artifacts/contracts/compositevaults/vaults/Vault.sol/Vault.json').abi;
const ControllerABI = require('../artifacts/contracts/compositevaults/controllers/VaultController.sol/VaultController').abi;
const StrategyABI = require('../artifacts/contracts/compositevaults/strategies/StrategyBalancerLp.sol/StrategyBalancerLp.json').abi;
const ownerPrivateKey = process.env.MNEMONICCCC;
let wallet, overrides;
let vaultMasterAddress = '0x4036201071D148326c1F0D42AeCb8D265f28eCe0';

let baseToken = '0xcdf68a4d525ba2e90fe959c74330430a5a6b8226';
let vaultAddress = '0xEEc4f61249d726Ae2c75B31D4050E6289D7460F6';
let controllerAddress = '0x7C1E1489092a8AebfAC1c3F0779D085b19667617';
let strategyAddress = '0x37fF16D4120de88D25C41B9F9B65Cd844c88E396';

let vaultName = 'Vault:BeetxwFTMUSDC';
let vaultSymbol = 'vaultwFTMUSDC';
let controllerName = 'VaultController:BeetxwFTMUSDC';

const main = async () => {
    console.log('Run job', new Date());
    const provider = new providers.JsonRpcProvider('https://rpcapi.fantom.network');
    wallet = new ethers.Wallet(ownerPrivateKey, provider);
    const maxUint256 = BigNumber.from('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

    let [gasPrice] = await Promise.all([wallet.getGasPrice()]);
    overrides = {gasLimit: 900000, gasPrice};

    let txs = [],
        msgs = [];
    let vaultContract = new Contract(vaultAddress, VaultABI, wallet);
    let controllerContract = new Contract(controllerAddress, ControllerABI, wallet);
    let strategyContract = new Contract(strategyAddress, StrategyABI, wallet);
    let nonce = await wallet.getTransactionCount();
    console.log('Current nonce', nonce, await wallet.getTransactionCount('pending'), gasPrice.div(1e9).toString(), 'Gwei');

    //vault
    txs.push(await vaultContract.populateTransaction.initialize(baseToken, vaultMasterAddress, vaultName, vaultSymbol, {nonce: nonce++}));
    msgs.push('RECEIPT vault init');

    //controller
    txs.push(await controllerContract.populateTransaction.initialize(vaultAddress, controllerName, {nonce: nonce++}));
    msgs.push('RECEIPT controller init');

    // strategy
    txs.push(
        await strategyContract.populateTransaction.initialize(
            '0xcdf68a4d525ba2e90fe959c74330430a5a6b8226',
            ['0xF24Bcf4d1e507740041C9cFd2DddB29585aDCe1e'],
            '0x8166994d9ebBe5829EC86Bd81258149B87faCfd3',
            8,
            '0x04068DA6C83AFCFA0e13ba15A6696662335D5B75', //usdc
            '0x04068DA6C83AFCFA0e13ba15A6696662335D5B75', //usdc
            '0x20dd72Ed959b6147912C2e529F0a0C651c33c9ce',
            controllerAddress,
            {nonce: nonce++}
        )
    );
    msgs.push('RECEIPT strategy init');

    txs.push(
        await strategyContract.populateTransaction.setBalancerPoolPaths(
            '0xF24Bcf4d1e507740041C9cFd2DddB29585aDCe1e',
            '0x04068DA6C83AFCFA0e13ba15A6696662335D5B75',
            '0x03c6b3f09d2504606936b1a4decefad204687890000200000000000000000015',
            {nonce: nonce++}
        )
    );
    msgs.push('RECEIPT strategy');

    // vault governance
    txs.push(await vaultContract.populateTransaction.setController(controllerAddress, {nonce: nonce++}));
    msgs.push('RECEIPT vault');

    // controller strategist
    txs.push(await controllerContract.populateTransaction.setUseSingleStrategy(strategyAddress, {nonce: nonce++}));
    msgs.push('RECEIPT controller');

    await processBatchTx(txs, msgs);

    console.log('--------Finished job', new Date());
};

const processTx = async (tx, ...message) => {
    // await wallet.estimateGas(tx);
    let receipt = await (await wallet.sendTransaction({...tx, ...overrides})).wait(2);
    console.log(...message, new Date(), receipt.transactionHash, receipt.status ? '' : 'FAILED!!!!');
};

const processBatchTx = async (txs, messages) => {
    await Promise.all(
        txs.map(async (tx, index) => {
            await processTx(tx, messages[index]);
        })
    );
};

main();

/**
 * Deploy vault step
 * (vault with withdrawal fee must be the last one to withdraw in sequence)
 * ------------------------
 Flat contract - Remove and add only single MIT - prettier
 Deploy vault, controller, strategy
 script set_up_vault (update ABI, address vault/controller/strategy, name, config for strategy ...)
 test deposit to vault, withdraw from vault
 test pending receive, withdrawAll, retireStrat, harvest in strategy
 check price per share in vault
 script update_governance (address vault/controller/strategy)

 * Migrate new strategy step
 * -------------------------
 Controller approveStrategy strategy
 Master addStrategy
 pause vault if have
 Set percent 1% old 9% new
 setstrategylength

 Get best strategy
 Deposit to new strategy
 Test withdraw all new strategy
 harvest new strategy

 harvestAllStrategy
 WithdrawAll controller to strategy old
 Set percent 0% old 10% new
 Setstrategylength
 unpause vault if have
 Check best strategy
 Call earn in vault
 */
