const {ethers, providers, Contract, BigNumber} = require('ethers');
require('dotenv').config();
const VaultABI = require('../artifacts/contracts/compositevaults/vaults/Vault.sol/Vault.json').abi;
const ControllerABI = require('../artifacts/contracts/compositevaults/controllers/VaultController.sol/VaultController').abi;
const StrategyABI = require('../artifacts/contracts/compositevaults/strategies/StrategySushiLp.sol/StrategySushiLp.json').abi;
const ownerPrivateKey = process.env.MNEMONICC;
let wallet, overrides;
let vaultMasterAddress = '0x439392419b8bEEe085A3Fd913eF04e116cE99870';

let baseToken = '0x7C07CecD8cdd65C0daD449808cc5f9AD74C22bd1';
let vaultAddress = '0xf464c04A1cc31e2BEE28FdAEDeC1A37378DA2f69';
let controllerAddress = '0x1812aaD7fA21eEA9097e2aCf3214B680b39ABB10';
let strategyAddress = '0x3742b949bbbCE91637f39671D2dde998C80597c4';

let vaultName = 'Vault:SushiSFIWETH';
let vaultSymbol = 'vaultSFIWETH';
let controllerName = 'VaultController:SushiSFIWETH';

const main = async () => {
    console.log('Run job', new Date());
    const provider = new providers.JsonRpcProvider(process.env.RPC_URL);
    wallet = new ethers.Wallet(ownerPrivateKey, provider);
    const maxUint256 = BigNumber.from('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

    let [gasPrice] = await Promise.all([wallet.getGasPrice()]);
    gasPrice = gasPrice.mul(66);
    if (gasPrice.gt(BigNumber.from(5e11))) gasPrice = BigNumber.from(3e11);
    overrides = {gasLimit: 900000, gasPrice};

    let tx,
        txs = [],
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

    await processBatchTx(txs, msgs);
    txs = [];
    msgs = [];

    // strategy
    tx = await strategyContract.populateTransaction.initialize(
        '0x7C07CecD8cdd65C0daD449808cc5f9AD74C22bd1',
        '0xaa9654becca45b5bdfa5ac646c939c62b527d394',
        '0x1948abC5400Aa1d72223882958Da3bec643fb4E5',
        14,
        '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619', //eth
        '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619',
        '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619',
        '0x35b937583f04a24963eb685f728a542240f28dd8',
        controllerAddress,
        {nonce: nonce++}
    );
    await processTx(tx, 'RECEIPT strategy init');

    txs.push(
        await strategyContract.populateTransaction.setFirebirdPairs(
            '0xaa9654becca45b5bdfa5ac646c939c62b527d394',
            '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619',
            ['0x9f03309A588e33A239Bf49ed8D68b2D45C7A1F11'],
            {nonce: nonce++}
        )
    );
    msgs.push('RECEIPT strategy');

    txs.push(
        await strategyContract.populateTransaction.setFirebirdPairs(
            '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619',
            '0x35b937583f04a24963eb685f728a542240f28dd8',
            ['0x7C07CecD8cdd65C0daD449808cc5f9AD74C22bd1'],
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
    await wallet.estimateGas(tx);
    let receipt = await (await wallet.sendTransaction({...tx, ...overrides})).wait(2);
    console.log(...message, new Date(), receipt.transactionHash);
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
