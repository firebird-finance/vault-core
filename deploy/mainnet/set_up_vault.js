const Web3 = require('web3');
require('dotenv').config();
const VaultABI = require('../../artifacts/contracts/compositevaults/vaults/Vault.sol/Vault.json').abi;
const ControllerABI = require('../../artifacts/contracts/compositevaults/controllers/VaultController.sol/VaultController').abi;
const StrategyABI = require('../../artifacts/contracts/compositevaults/strategies/StrategySushiLp.sol/StrategySushiLp.json').abi;
const ownerPrivateKey = process.env.MNEMONICC;
let vaultMasterAddress = '0x7376fC47863ceeD6bf3427CE4526ae29c4864A7D';

let baseToken = '0xAcCeD00820C2F4Ce8c8a6Ad5Ace32dc15B06e961';
let vaultAddress = '0x5FbDE3fEb70bDD38a933d786120eA3dF9F23ECba';
let controllerAddress = '0xc83DEc5AdD55e7B9Aa83F84cb7faddB329eD8dc4';
let strategyAddress = '0x3E2F27706396C098aFa9e1289FAE8158623c4dc8';

let vaultName = 'Vault:PancakeBGOVWBNB';
let vaultSymbol = 'vaultBGOVWBNB';
let controllerName = 'VaultController:PancakeBGOVWBNB';

const main = async () => {
    console.log('Run job', new Date());
    const HDWalletProvider = require('@truffle/hdwallet-provider');
    let provider = new HDWalletProvider(ownerPrivateKey, `https://bsc-dataseed2.ninicoin.io`);
    let web3 = new Web3(provider);
    const maxUint256 = web3.utils
        .toBN(2)
        .pow(web3.utils.toBN(256))
        .sub(web3.utils.toBN(1));

    const [[from], gasPrice] = await Promise.all([web3.eth.getAccounts(), web3.eth.getGasPrice()]);
    let method;
    let txReceipt;
    let vaultContract = new web3.eth.Contract(VaultABI, vaultAddress);
    let controllerContract = new web3.eth.Contract(ControllerABI, controllerAddress);
    let strategyContract = new web3.eth.Contract(StrategyABI, strategyAddress);

    //vault
    method = vaultContract.methods.initialize(baseToken, vaultMasterAddress, vaultName, vaultSymbol);
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 2000000, gasPrice});
    console.log('RECEIPT vault init', new Date(), txReceipt.transactionHash);

    //controller
    method = controllerContract.methods.initialize(vaultAddress, controllerName);
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 2000000, gasPrice});
    console.log('RECEIPT controller init', new Date(), txReceipt.transactionHash);

    // strategy
    method = strategyContract.methods.initialize(
        '0xAcCeD00820C2F4Ce8c8a6Ad5Ace32dc15B06e961',
        '0xf8e026dc4c0860771f691ecffbbdfe2fa51c77cf',
        '0x1FDCA2422668B961E162A8849dc0C2feaDb58915',
        9,
        '0xf8e026dc4c0860771f691ecffbbdfe2fa51c77cf', //bgov
        '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', //bnb
        '0xf8e026dc4c0860771f691ecffbbdfe2fa51c77cf',
        '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
        controllerAddress
    );
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 2000000, gasPrice});
    console.log('RECEIPT strategy init', new Date(), txReceipt.transactionHash);

    method = strategyContract.methods.setFirebirdPairs('0xa9c41a46a6b3531d28d5c32f6633dd2ff05dfb90', '0xe9e7cea3dedca5984780bafc599bd69add087d56', [
        '0xb4814f1ca673dBE9a2637C5dd4e94A4a0ED834C6',
        '0x522361C3aa0d81D1726Fa7d40aA14505d0e097C9'
    ]);
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 2000000, gasPrice});
    console.log('RECEIPT strategy', new Date(), txReceipt.transactionHash);

    method = strategyContract.methods.setFirebirdPairs('0xf8e026dc4c0860771f691ecffbbdfe2fa51c77cf', '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', ['0xAcCeD00820C2F4Ce8c8a6Ad5Ace32dc15B06e961']);
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 2000000, gasPrice});
    console.log('RECEIPT strategy', new Date(), txReceipt.transactionHash);

    // vault governance
    method = vaultContract.methods.setController(controllerAddress);
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 2000000, gasPrice});
    console.log('RECEIPT vault', new Date(), txReceipt.transactionHash);

    // controller strategist
    method = controllerContract.methods.approveStrategy(strategyAddress);
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 2000000, gasPrice});
    console.log('RECEIPT controller', new Date(), txReceipt.transactionHash);

    method = controllerContract.methods.setStrategyInfo('0', strategyAddress, maxUint256, '100');
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 2000000, gasPrice});
    console.log('RECEIPT controller', new Date(), txReceipt.transactionHash);

    method = controllerContract.methods.setStrategyLength('1');
    await method.estimateGas({from});
    txReceipt = await method.send({from, gas: 2000000, gasPrice});
    console.log('RECEIPT controller', new Date(), txReceipt.transactionHash);

    console.log('--------Finished job', new Date());
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
