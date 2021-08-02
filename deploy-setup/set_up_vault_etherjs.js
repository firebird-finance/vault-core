const {ethers, providers, Contract, BigNumber} = require('ethers');
require('dotenv').config();
const VaultABI = require('../artifacts/contracts/compositevaults/vaults/Vault.sol/Vault.json').abi;
const ControllerABI = require('../artifacts/contracts/compositevaults/controllers/VaultController.sol/VaultController').abi;
const StrategyABI = require('../artifacts/contracts/compositevaults/strategies/StrategySushiLp.sol/StrategySushiLp.json').abi;
const ownerPrivateKey = process.env.MNEMONICC;
let wallet, overrides;
let vaultMasterAddress = '0x439392419b8bEEe085A3Fd913eF04e116cE99870';

let baseToken = '0x9f03309A588e33A239Bf49ed8D68b2D45C7A1F11';
let vaultAddress = '0xF5D99B8405eD34Dea52321732191484020b34dA0';
let controllerAddress = '0xFC35561c7099737fAde5eF7E3352456Af0b92d97';
let strategyAddress = '0x8025C572851eb560513906DbE55B8fB30a62AB7a';

let vaultName = 'Vault:QuickDINOWETH';
let vaultSymbol = 'vaultDINOWETH';
let controllerName = 'VaultController:QuickDINOWETH';

const main = async () => {
    console.log('Run job', new Date());
    const provider = new providers.JsonRpcProvider(process.env.RPC_URL);
    wallet = new ethers.Wallet(ownerPrivateKey, provider);
    const maxUint256 = BigNumber.from('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

    let [gasPrice] = await Promise.all([wallet.getGasPrice()]);
    gasPrice = gasPrice.mul(120);
    overrides = {gasLimit: 900000, gasPrice};

    let tx;
    let vaultContract = new Contract(vaultAddress, VaultABI, wallet);
    let controllerContract = new Contract(controllerAddress, ControllerABI, wallet);
    let strategyContract = new Contract(strategyAddress, StrategyABI, wallet);
    console.log('Current nonce', await wallet.getTransactionCount(), await wallet.getTransactionCount('pending'), gasPrice.div(1e9).toString(), 'Gwei');

    //vault
    tx = await vaultContract.populateTransaction.initialize(baseToken, vaultMasterAddress, vaultName, vaultSymbol);
    await processTx(tx, 'RECEIPT vault init');

    //controller
    tx = await controllerContract.populateTransaction.initialize(vaultAddress, controllerName);
    await processTx(tx, 'RECEIPT controller init');

    // strategy
    tx = await strategyContract.populateTransaction.initialize(
        '0x9f03309A588e33A239Bf49ed8D68b2D45C7A1F11',
        '0xaa9654becca45b5bdfa5ac646c939c62b527d394',
        '0x1948abC5400Aa1d72223882958Da3bec643fb4E5',
        11,
        '0xaa9654becca45b5bdfa5ac646c939c62b527d394', //dino
        '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619', //eth
        '0xaa9654becca45b5bdfa5ac646c939c62b527d394',
        '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619',
        controllerAddress
    );
    await processTx(tx, 'RECEIPT strategy init');

    tx = await strategyContract.populateTransaction.setFirebirdPairs('0xaa9654becca45b5bdfa5ac646c939c62b527d394', '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619', [
        '0x9f03309A588e33A239Bf49ed8D68b2D45C7A1F11'
    ]);
    await processTx(tx, 'RECEIPT strategy');

    // tx = await strategyContract.populateTransaction.setFirebirdPairs('0xc2132d05d31c914a87c6611c10748aeb04b58e8f', '0x692597b009d13c4049a947cab2239b7d6517875f', [
    //     '0x39BEd7f1C412ab64443196A6fEcb2ac20C707224'
    // ]);
    // await processTx(tx, 'RECEIPT strategy');

    // vault governance
    tx = await vaultContract.populateTransaction.setController(controllerAddress);
    await processTx(tx, 'RECEIPT vault');

    // controller strategist
    tx = await controllerContract.populateTransaction.setUseSingleStrategy(strategyAddress);
    await processTx(tx, 'RECEIPT controller');

    console.log('--------Finished job', new Date());
};

const processTx = async (tx, message) => {
    await wallet.estimateGas(tx);
    let receipt = await (await wallet.sendTransaction({...tx, ...overrides})).wait(2);
    console.log(message, new Date(), receipt.transactionHash);
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
