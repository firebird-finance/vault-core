const {ethers, providers, Contract, BigNumber} = require('ethers');
require('dotenv').config();
const VaultABI = require('../artifacts/contracts/compositevaults/vaults/Vault.sol/Vault.json').abi;
const ControllerABI = require('../artifacts/contracts/compositevaults/controllers/VaultController.sol/VaultController').abi;
const StrategyABI = require('../artifacts/contracts/compositevaults/strategies/StrategySushiLp.sol/StrategySushiLp.json').abi;
const ownerPrivateKey = process.env.MNEMONICCCC;
let wallet, overrides;
let vaultMasterAddress = '0x4036201071D148326c1F0D42AeCb8D265f28eCe0';

let baseToken = '0x78e70eF4eE5cc72FC25A8bDA4519c45594CcD8d4';
let vaultAddress = '0xbE61A50a628f906eB5271c9b56858C71aB599f55';
let controllerAddress = '0xb8EC7eeCCac23e5Aa20820b5E39F524576c98Cd8';
let strategyAddress = '0x9cc8d9E813Fb0ed6c1c3B4AbDff7A37fcf2E7cb8';

let vaultName = 'Vault:SpiritSCARABWFTM';
let vaultSymbol = 'vaultSCARABWFTM';
let controllerName = 'VaultController:SpiritSCARABWFTM';

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
            '0x78e70eF4eE5cc72FC25A8bDA4519c45594CcD8d4',
            '0x6ab5660f0B1f174CFA84e9977c15645e4848F5D6',
            '0xc88690163b10521d5fB86c2ECB293261F7771525',
            0,
            '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83', //wftm
            '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83',
            '0x2e79205648b85485731cfe3025d66cf2d3b059c4',
            '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83',
            controllerAddress,
            {nonce: nonce++}
        )
    );
    msgs.push('RECEIPT strategy init');

    txs.push(
        await strategyContract.populateTransaction.setFirebirdPairs(
            '0x6ab5660f0B1f174CFA84e9977c15645e4848F5D6',
            '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83',
            ['0x27228140D72a7186F70eD3052C3318f2D55c404d'],
            {nonce: nonce++}
        )
    );
    msgs.push('RECEIPT strategy');

    txs.push(
        await strategyContract.populateTransaction.setFirebirdPairs(
            '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83',
            '0x2e79205648b85485731cfe3025d66cf2d3b059c4',
            ['0x78e70eF4eE5cc72FC25A8bDA4519c45594CcD8d4'],
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
