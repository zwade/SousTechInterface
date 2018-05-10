let fs = require("fs/promises");

let parser = async () => {
	let weka = await fs.readFile("weka.tree");
	weka = weka.toString();
	let inputLines = weka.split("\n");
	let condition = /((\|\ \ \ )*)([\w_]+)\ (>|<|<=|>=)\ ([0-9\.]+)(\ :\ ([\w_]+)\ .*)?$/;
	let prevIndentation = 0;
	let lines = []
	let varSet = new Set()
	for (let line of inputLines) {
		let match = condition.exec(line)
		if (match === null) {
			continue;
		}
		let indent = match[1].length / 4
		if (indent < prevIndentation) {
			for (let i = 0; i < prevIndentation - indent; i ++) {
				lines.push("\t".repeat(prevIndentation - i) + "}");
			}
		}
		prevIndentation = indent
		varSet.add(match[3]);
		if (match[7] !== undefined) {
			lines.push(`${"\t".repeat(indent + 1)}if (${match[3]} ${match[4]} ${match[5]}) return "${match[7]}"`)
		} else {
			lines.push(`${"\t".repeat(indent + 1)}if (${match[3]} ${match[4]} ${match[5]}) {`)
		}
	}
	for (let i = 0; i < prevIndentation; i ++) {
		lines.push("\t".repeat(prevIndentation - i) + "}");
	}
	
	let fd = await fs.open("wekaEval.js", "w+");
	await fs.write(fd, `module.exports = ({${[...varSet].join(", ")}}) => {\n`);

	for (let line of lines) {
		await fs.write(fd, `${line}\n`);
	}
	await fs.write(fd, "}");
	await fd.close();
}

let getData = async () => {
	await parser();
	return require("./wekaEval");
}

module.exports = getData;

