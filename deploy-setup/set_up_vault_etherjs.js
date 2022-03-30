const {ethers, providers, Contract, BigNumber} = require('ethers');
require('dotenv').config({path: '../.env'});
const VaultABI = require('../artifacts/contracts/compositevaults/vaults/Vault.sol/Vault.json').abi;
const ControllerABI = require('../artifacts/contracts/compositevaults/controllers/VaultController.sol/VaultController').abi;
const StrategyABI = require('../artifacts/contracts/compositevaults/strategies/StrategySushiMiniV2Lp.sol/StrategySushiMiniV2Lp.json').abi;
const ownerPrivateKey = process.env.MNEMONICCCC;
let wallet, overrides;
let vaultMasterAddress = '0x4036201071D148326c1F0D42AeCb8D265f28eCe0';

let baseToken = '0x664D417B404404268C4E571975B4eC77157B8aC4';
let vaultAddress = '0x793Bfc80abafe1Bb9A9478C512077008fd62447D';
let controllerAddress = '0xB11ae0458a10bC396F05953baF25c2bf744BDd35';
let strategyAddress = '0xdC1B0252aacdf17AfcBAFDDeBea6293CC6082aea';

let vaultName = 'Vault:SpookyFXMWFTM';
let vaultSymbol = 'vaultFXMWFTM';
let controllerName = 'VaultController:SpookyFXMWFTM';

const main = async () => {
    console.log('Run job', new Date());
    const provider = new providers.JsonRpcProvider('https://rpc.ankr.com/fantom');
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
            '0x664D417B404404268C4E571975B4eC77157B8aC4',
            ['0x132b56763C0e73F95BeCA9C452BadF89802ba05e'],
            '0x9c09eA872582bA02E0008C4853eAA5199bF8D0a7',
            0,
            '0x132b56763C0e73F95BeCA9C452BadF89802ba05e', //fxm
            '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83', //ftm
            '0x132b56763C0e73F95BeCA9C452BadF89802ba05e',
            '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83',
            controllerAddress,
            {nonce: nonce++}
        )
    );
    msgs.push('RECEIPT strategy init');

    txs.push(
        await strategyContract.populateTransaction.setFirebirdPairs(
            '0x132b56763C0e73F95BeCA9C452BadF89802ba05e',
            '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83',
            ['0x664D417B404404268C4E571975B4eC77157B8aC4'],
            {nonce: nonce++}
        )
    );
    msgs.push('RECEIPT strategy');

    // txs.push(
    //     await strategyContract.populateTransaction.setFirebirdPairs(
    //         '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83',
    //         '0x75Ab56F4eFE81598a78EF3079a331F1D0336765D',
    //         ['0x215c8E1452681be980Bce575cF719029581Ef263'],
    //         {nonce: nonce++}
    //     )
    // );
    // msgs.push('RECEIPT strategy');

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
