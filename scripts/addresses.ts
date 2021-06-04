import {deployments, ethers} from "hardhat";

async function logContractAddress(name: string, title: string = name) {
    console.log(title + " : " + (await ethers.getContract(name)).address);
}

async function main() {
    // console.log('DEBUG_LOG==>>: ok', {ok : await deployments.all()});
    let contracts = await deployments.all();
    for (let name in contracts) {
        console.log(name + " " + contracts[name].address);
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
