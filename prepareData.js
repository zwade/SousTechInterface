let seedrandom = require("seedrandom");
let glob       = require("glob");

let fs         = require("fs/promises");
let { join }   = require("path");

seedrandom("15400", {global: true});

const p = 0.75;

let classes = [
	"bell_pepper",
	"boiling_water",
	"tomato_sauce",
	"potato",
	"serrano",
];

let allData = {};
let trainingData = [];
let testingData = [];

let saveAsARFF = async(data, name) => {
	let path = join(__dirname, "training", `${name}.arff`);
	let fd = await fs.open(path, "w+");
	await fs.write(fd, `
@RELATION sous

@ATTRIBUTE ch4 INTEGER
@ATTRIBUTE lpg INTEGER
@ATTRIBUTE h2 INTEGER
@ATTRIBUTE alcohol INTEGER
@ATTRIBUTE solvent INTEGER
@ATTRIBUTE objecttemp REAL
@ATTRIBUTE ambienttemp REAL
@ATTRIBUTE class {${classes.join(",")}}

@DATA
`)
	for (let datum of data) {
		if (datum.length !== 8) continue;
		await fs.write(fd, datum.join(",") + "\n");
	}
}

let main = async () => {
	for (let label of classes) {
		allData[label] = [];
		let dir = join(__dirname, "data", label);
		let files = glob.sync(`${dir}/*.csv`);
		for (let file of files) {
			let contents = await fs.readFile(file);
			let entries = contents.toString().split(/\r?\n/).slice(1);
			entries = entries.map((line) => {
				let [_timestamp, ...res] = line.split(/,\ */);
				res.push(label);
				return res;
			})
			allData[label] = allData[label].concat(entries);
			trainingData = trainingData.concat(entries);
		}
	}

	for (let label of classes) {
		for (let line of allData[label]) {
			if (Math.random() < p) {
				//trainingData.push(line);
			} else {
				//testingData.push(line);
			}
		}
	}
	
	await saveAsARFF(trainingData, "training");
	await saveAsARFF(testingData, "testing");
}

main();

