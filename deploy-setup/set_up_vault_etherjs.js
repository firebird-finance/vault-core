const {ethers, providers, Contract, BigNumber} = require('ethers');
require('dotenv').config();
const VaultABI = require('../artifacts/contracts/compositevaults/vaults/Vault.sol/Vault.json').abi;
const ControllerABI = require('../artifacts/contracts/compositevaults/controllers/VaultController.sol/VaultController').abi;
const StrategyABI = require('../artifacts/contracts/compositevaults/strategies/StrategyFairLaunchKyberDMMLp.sol/StrategyFairLaunchKyberDMMLp.json').abi;
const ownerPrivateKey = process.env.MNEMONICCC;
let wallet, overrides;
let vaultMasterAddress = '0x412b30F7c14527a7cEab3aC07945Eb14faA201c7';

let baseToken = '0x6170B6d96167346896169b35e1E9585feAB873bb';
let vaultAddress = '0x28683C97aA3Dd26882317B030b040c7Db96814a8';
let controllerAddress = '0xbeE2d3E765efDa6c5D4b51E22Fd315bD53BA14B8';
let strategyAddress = '0x89c70E2319704CDC388AC6773cC12d79895F3261';

let vaultName = 'Vault:KyberDMMWBNBKNC';
let vaultSymbol = 'vaultWBNBKNC';
let controllerName = 'VaultController:KyberDMMWBNBKNC';

const main = async () => {
    console.log('Run job', new Date());
    const provider = new providers.JsonRpcProvider(`https://bsc-dataseed.binance.org/`);
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
            '0x6170B6d96167346896169b35e1E9585feAB873bb',
            '0x31de05f28568e3d3d612bfa6a78b356676367470',
            0,
            '0xfe56d5892bdffc7bf58f2e84be1b2c32d21c308b',
            '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
            '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
            '0xfe56d5892bdffc7bf58f2e84be1b2c32d21c308b',
            controllerAddress,
            {nonce: nonce++}
        )
    );
    msgs.push('RECEIPT strategy init');

    txs.push(
        await strategyContract.populateTransaction.setKyberPaths(
            '0xfe56d5892bdffc7bf58f2e84be1b2c32d21c308b',
            '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
            ['0x6170B6d96167346896169b35e1E9585feAB873bb'],
            ['0xfe56d5892bdffc7bf58f2e84be1b2c32d21c308b', '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'],
            {nonce: nonce++}
        )
    );
    msgs.push('RECEIPT strategy');

    txs.push(
        await strategyContract.populateTransaction.setFirebirdPairs(
            '0xbc5b59ea1b6f8da8258615ee38d40e999ec5d74f',
            '0xd78c475133731cd54dadcb430f7aae4f03c1e660',
            ['0xDfde5ffA34D86088508482629b3C76fDF6B7cC2A'],
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
