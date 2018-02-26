#!/usr/bin/env node

let yargs = require("yargs")
let serial = require("serialport")
let fs = require("fs")
let { join } = require("path")
let glob = require("glob")
let blessed = require("blessed")
let contrib = require('blessed-contrib')
let { inspect } = require("util")

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

class BlessedScreen {
	constructor(state) {
		this.state = state

		let screen = blessed.screen({
			smartCSR: true,
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

		let actionOpts = [
			"start",
			"stop",
			"ping",
			"analyze",
			"exit",
		]

		let actions = blessed.list({
			label: "Actions",
			width: '50%',
			height: '25%',
			tags: true,
			border: {
				type: 'line',
			},
			top: '50%',
			left: '0%',
			mouse: true,
			keys: true,
			style: {
				item: {
					fg: "blue",
				},
				selected: {
					bg: "blue",
					fg: "white"
				}
			},
			items: actionOpts.map(d => " - " + d) 
		})

		actions.on("select", (d,b,c) => { 
			switch(actionOpts[b]) {
				case "start": {
					state.port.write("D\n")
					break
				}
				case "stop": {
					state.port.write("C\n")
					break
				}
				case "ping": {
					state.port.write("P\n")
					break
				}
				case "exit": {
					process.exit(0)
				}
			}
		})

		actions.focus();

		screen.append(actions);

		let settingOpts = [
			["Show Graph", "graph", "boolean"],
			["Show Data",  "data",  "boolean"]
		]

		state.settings.graph = true
		state.settings.data  = false
		let getOpts = () => 
			settingOpts.map(([name, key, type, def]) => {
				if (type === "boolean") {
					return ` - ${name} [${state.settings[key] ? "X" : " "}]`
				} else {
					return ` - ${name}`
				}
			})

		let settings = blessed.list({
			label: "Settings",
			width: '50%',
			height: '25%',
			tags: true,
			border: {
				type: 'line',
			},
			top: '75%',
			left: '0%',
			mouse: true,
			keys: true,
			style: {
				item: {
					fg: "blue",
				},
				selected: {
					bg: "blue",
					fg: "white"
				}
			},
			items: getOpts()
		})

		settings.on("select", (d, v) => {
			let [name, key, type] = settingOpts[v]
			if (type === "boolean") {
				state.settings[key] = !state.settings[key]
			}

			settings.setItems(getOpts())
			screen.render()		
		})

		screen.append(settings)	
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
		if (this.state.settings.graph) {
			this.barData.setData({ data, titles });
		}
		if (this.state.settings.data) {
			this.notifs.log(`  {#FF7043-fg}${d}{/}`);
		}
		this.screen.render();
	}
}

function repl() {
	
	let state = {
		readBuffer : new Buffer([]),
		dataHandler: () => {},
		settings: {}
	}

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

	let screen = new BlessedScreen(state);

	return portFile.then(port => {
		state.port = new serial("/dev/tty.usbmodem" + port)
		screen.log(`Connected to ${port}`);

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
		})
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
