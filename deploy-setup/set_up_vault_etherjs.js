const {ethers, providers, Contract, BigNumber} = require('ethers');
require('dotenv').config();
const VaultABI = require('../artifacts/contracts/compositevaults/vaults/Vault.sol/Vault.json').abi;
const ControllerABI = require('../artifacts/contracts/compositevaults/controllers/VaultController.sol/VaultController').abi;
const StrategyABI = require('../artifacts/contracts/compositevaults/strategies/StrategyPairWeightLp.sol/StrategyPairWeightLp.json').abi;
const ownerPrivateKey = process.env.MNEMONICCC;
let wallet, overrides;
let vaultMasterAddress = '0x439392419b8bEEe085A3Fd913eF04e116cE99870';

let baseToken = '0xD70f14f13ef3590e537bBd225754248965A3593c';
let vaultAddress = '0xd356E7f81c0cb55F6e05653906D2c49115cf5DCF';
let controllerAddress = '0x8aA3A30A6b7c23B604b0122D1576B1e0475109F0';
let strategyAddress = '0xA56e8948DFBc208f4Faa38CC4fD0A3a8Fba4e2Ca';

let vaultName = 'Vault:FirebirdTOWERUSDC';
let vaultSymbol = 'vaultTOWERUSDC';
let controllerName = 'VaultController:FirebirdTOWERUSDC';

const main = async () => {
    console.log('Run job', new Date());
    const provider = new providers.JsonRpcProvider(process.env.RPC_URL);
    wallet = new ethers.Wallet(ownerPrivateKey, provider);
    const maxUint256 = BigNumber.from('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

    let [gasPrice] = await Promise.all([wallet.getGasPrice()]);
    gasPrice = gasPrice.mul(3);
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
            '0xD70f14f13ef3590e537bBd225754248965A3593c',
            '0x88a3aCAc5C48F93121d4d7771A068A1FCDE078BC',
            '0x4696B1A198407BFb8bB8dd59030Bf30FaC258f1D',
            0,
            '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', //usdc
            '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', //usdc
            50,
            '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
            '0x8201532917e55ba29674ef4e88ffe0b775f1bae8',
            controllerAddress,
            {nonce: nonce++}
        )
    );
    msgs.push('RECEIPT strategy init');

    txs.push(
        await strategyContract.populateTransaction.setFirebirdPairs(
            '0x88a3aCAc5C48F93121d4d7771A068A1FCDE078BC',
            '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
            ['0x10995233Ef7b3abd1a2706a86FFeA456ebae8796'],
            {nonce: nonce++}
        )
    );
    msgs.push('RECEIPT strategy');

    txs.push(
        await strategyContract.populateTransaction.setFirebirdPairs(
            '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
            '0x8201532917e55ba29674ef4e88ffe0b775f1bae8',
            ['0xD70f14f13ef3590e537bBd225754248965A3593c'],
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
