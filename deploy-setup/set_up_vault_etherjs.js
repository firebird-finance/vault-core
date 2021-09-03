const {ethers, providers, Contract, BigNumber} = require('ethers');
require('dotenv').config();
const VaultABI = require('../artifacts/contracts/compositevaults/vaults/Vault.sol/Vault.json').abi;
const ControllerABI = require('../artifacts/contracts/compositevaults/controllers/VaultController.sol/VaultController').abi;
const StrategyABI = require('../artifacts/contracts/compositevaults/strategies/StrategyPolycatLp.sol/StrategyPolycatLp.json').abi;
const ownerPrivateKey = process.env.MNEMONICC;
let wallet, overrides;
let vaultMasterAddress = '0x439392419b8bEEe085A3Fd913eF04e116cE99870';

let baseToken = '0xDfde5ffA34D86088508482629b3C76fDF6B7cC2A';
let vaultAddress = '0xa3E36e49bDb88310f27Ce31284a600748F763B1a';
let controllerAddress = '0x307f68cA993B36030298d4487EE9558dBc2aF297';
let strategyAddress = '0x35F5489236a92B99Bf748B59298add3c81811121';

let vaultName = 'Vault:PolycatHOPEPAW';
let vaultSymbol = 'vaultHOPEPAW';
let controllerName = 'VaultController:PolycatHOPEPAW';

const main = async () => {
    console.log('Run job', new Date());
    const provider = new providers.JsonRpcProvider(process.env.RPC_URL);
    wallet = new ethers.Wallet(ownerPrivateKey, provider);
    const maxUint256 = BigNumber.from('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

    let [gasPrice] = await Promise.all([wallet.getGasPrice()]);
    gasPrice = gasPrice.mul(66);
    if (gasPrice.gt(BigNumber.from(5e11))) gasPrice = BigNumber.from(3e11);
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
            '0xDfde5ffA34D86088508482629b3C76fDF6B7cC2A',
            '0xbc5b59ea1b6f8da8258615ee38d40e999ec5d74f',
            '0x4ce9ae2f5983e19aebf5b8bae4460f2b9ece811a',
            20,
            '0xbc5b59ea1b6f8da8258615ee38d40e999ec5d74f',
            '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', //usdc
            '0xd78c475133731cd54dadcb430f7aae4f03c1e660',
            '0xbc5b59ea1b6f8da8258615ee38d40e999ec5d74f',
            controllerAddress,
            {nonce: nonce++}
        )
    );
    msgs.push('RECEIPT strategy init');

    txs.push(
        await strategyContract.populateTransaction.setFirebirdPairs(
            '0xbc5b59ea1b6f8da8258615ee38d40e999ec5d74f',
            '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
            ['0x4Cd2b8b7E00ac8EB544c51c4B1F0Bd39868A89dF'],
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
