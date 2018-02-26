#!/usr/bin/env node

let yargs = require("yargs")
let serial = require("serialport")
let fs = require("fs")
let { join } = require("path")
let glob = require("glob")
let blessed = require("blessed")
let contrib = require('blessed-contrib')

function getPorts() {
	let files = glob.sync("/dev/tty.usbmodem*")
	return files.map((file) => file.split("/dev/tty.usbmodem")[1])
}

//let ports = getPorts()

function begin(outfile, portFile) {
	if (!portFile) {
		if (ports.length == 1) {
			portFile = ports[0]
		} else if (ports.length == 0) {
			console.error("No arduino found");
			return;
		} else {
			console.error(`Multiple serial ports found: ${ports}`)
			return;
		}
	}
	let port = new serial("/dev/tty.usbmodem" + portFile);
	let stream = fs.open(join(__dirname, outfile), "w+", (err, fd) => {
		if (err) {
			console.error(err)
			return;
		}
		port.on("data", (d) => {
			fs.write(fd, d.toString(), () => true)
		})
	})
}

function loadStatus() {
	const width = process.stdout.columns;
	const height = process.stdout.rows;

	let act = (st, ...elts) => {
		let string = elts.reduce((a, _, i) => a + elts[i] + st[i+1], st[0]);
		return () => process.stdout.write(string);
	}

	const reset = act`\x1B[0;0f`;
	const save = act`\x1B[0s`;
	const reload = act`\x1B[0u`;
	const clear = n => act`\x1B[${width};${n}H\x1B[1J`;

	reset();
	save();
	clear(20);
	reload();

	let displayStatus = () => {
		save();
		reset();
		let screen = new Array((width + 1) * Math.floor(height / 2));
		let lHeight = Math.floor(height/2);

		let output = Array.from(screen, ((_, i) => {
			let x = i % width + 1;
			let y = Math.floor(i/width) + 1;

			if (x === 1 && y === 1) return '\u250c';
			if (x === width && y === 1) return '\u2510';
			if (x === 1 && y === lHeight) return '\u2514';
			if (x === width && y === lHeight) return '\u2518';
			if (x === width || x === 1) return '\u2502'; 
			if (y === 1 || y === lHeight) return '\u2500';

			if (x === width + 1) return '\n';

			return ' ';
		}));
		
		process.stdout.write(output.join(""));
		reload();
	}

	displayStatus();
	return displayStatus;

}

class BlessedScreen {
	constructor() {
		let screen = blessed.screen({
			smartCSR: true
		})

		screen.title="SousTech"
		var notifs = contrib.log({
			scrollable: true,
			top: '0',
			left: '0',
			width: '40%',
			height: '50%',
			tags: true,
			border: {
				type: 'line'
			},
			label: "Notifications",
			style: {
				fg: 'white',
				border: {
					fg: '#f0f0f0'
				},
			}
		});
		this.notifs = notifs;

		screen.append(notifs);


		// Quit on Escape, q, or Control-C.
		screen.key(['escape', 'q', 'C-c'], function(ch, key) {
			return process.exit(0);
		});

		// Focus our element.
		notifs.focus();

		// Render the screen.
		screen.render();

		this.screen = screen;

		let barData = contrib.bar({
			label: "Sensor Data",
			width: '60%',
			height: '50%',
			tags: true,
			barWidth: 8,
			barSpacing: 11,
			border: {
				type: 'line',
			},
			top: '0',
			left: '40%',
			maxHeight: 1024,
		})

		this.barData = barData;

		screen.append(barData);

		barData.setData({
			titles: ["CH4", "LPG", "H2", "Alcohol", "Solvent"],
			data: [0, 0, 0, 0, 0],
		})

		let actions = blessed.list({
			label: "Actions",
			width: '50%',
			height: '50%',
			tags: true,
			border: {
				type: 'line',
			},
			top: '50%',
			left: '0%',
			mouse: true,
			items: [
				'start',
				'stop',
				'exit',
				'analyze',
			]
		})

		screen.append(actions);
			
	}

	log(d) {
		this.notifs.log(`  {green-fg}${d}{/green-fg}`);
		this.screen.render();
	}

	info(d) {
		this.notifs.log(`  {blue-fg}${d}{/blue-fg}`);
		this.screen.render();
	}

	error(d) {
		this.notifs.log(`  {red-fg}{bold}${d}{/red-fg}{/bold}`);
		this.screen.render();
	}

	data (d) {
		let data = d.split(", ").map((d) => parseInt(d));
		let titles = ["CH4", "LPG", "H2", "Alcohol", "Solvent"];
		this.barData.setData({ data, titles });
		this.screen.render();
	}
}

function repl() {

	let screen = new BlessedScreen();

	let ports = getPorts();
	let portFile;
	if (ports.length === 0) {
		screen.error("No arduinos found");
		return;
	} else if (ports.length === 1) {
		portFile = Promise.resolve(ports[0]);
	} else {
		portFile = prompter()
	}

	
	let rec = (action, state) => {
		if (action !== null) {
			switch (action.value) {
				case "cat":

			}
		}
		let promise = mainPrompt()
		return promise.then(rec)
	}

	return portFile.then(port => {
		screen.log(`Connected to ${port}`);
		let state = {
			port : new serial("/dev/tty.usbmodem" + port),
			readBuffer : new Buffer([]),
			dataHandler: () => {}
		}

		state.port.on('data', (b) => {
			state.readBuffer = Buffer.concat([state.readBuffer, b]);
			if (b.indexOf(0x0a) >= 0) {
				let vals = b.toString().split("\n");
				state.readBuffer = new Buffer(vals.splice(-1));

				for (let val of vals) {
					let [type, data] = val.split(":");
					if (type === "I") {
						screen.info(data);
					} else if (type === "E") {
						screen.error(data);
					} else if (type === "D") {
						screen.data(data);
					} else {
						screen.error(`Invalid data type ${type}`)
					}

				}
			}
		})

		state.port.on("open", () => {
			state.port.write('P\n');
			state.port.write('D\n');
		})

		return rec(null, state)
	})
}

repl();

/*
yargs.usage("capture <cmd> [args]")
	.command("run [file]", "Start listening for data", (yargs) => {
		yargs.positional("file", {
			type: "string",
			default: "data.csv",
			describe: "the location for data storage"
		})
	}, (argv) => begin(argv.file, argv.port))
	.argv
*/
