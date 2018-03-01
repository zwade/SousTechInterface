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

		let dataList = blessed.FileManager({
			label: "Collected Data",
			width: "50%",
			height: '35%',
			top: "50%",
			left: "50%",
			mouse: true,
			keys: true,
			border: {
				type: "line"
			},
			cwd: join(__dirname, "data")
		})

		screen.append(dataList)
		dataList.refresh()

		let actionOpts = [
			"start",
			"stop",
			"record",
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
				case "record": {
					let question = new blessed.Prompt({
						width: "30%",
						height: "30%",
						top: "center",
						left: "center",
						border: "line",

					})
					screen.append(question)
					question.input("Enter File Name", "", (err, name) => {
						state.port.write("D\n")
						fs.open(join(__dirname, "data", `${name}.csv`), "w+", (err, fd) => {
							dataList.refresh()
							state.active.file = fd
							state.active.time = Date.now() 
							fs.write(fd, "Time, CH4, LPG, H2, Alcohol, Solvent\n", () => 0)
						})
					})
					screen.render()
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
			["Show Data",  "data",  "boolean"],
			["Record Duration", "duration", "number"],
		]

		let getOpts = () => 
			settingOpts.map(([name, key, type]) => {
				if (type === "boolean") {
					return ` - ${name} [${state.settings[key] ? "X" : " "}]`
				} else if (type === "number") {
					return ` - ${name} (${state.settings[key]})`	
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
				settings.setItems(getOpts())
				screen.render()		
			}
			if (type === "number") {
				let prompt = blessed.prompt({
					width: "30%",
					height: "30%",
					left: "center",
					top: "center",
					border: "line",
				})
				screen.append(prompt)
				prompt.input(`Update ${name}`, "" + state.settings[key], (err, data) => {
					state.settings[key] = parseInt(data)
					settings.setItems(getOpts())
					screen.render()
				})
				screen.render()
			}
		})

		screen.append(settings)	

		let timer = contrib.lcd({
			segmentWidth: 0.09,
			segmentInterval: 0.03,
			strokeWidth: 0.01,
			elements: 5,
			display: "00-00",
			color: "green",
			border: "line",
			width: "50%",
			height: "15%",
			top: "85%",
		 	left: "50%",
			label: "Time Remaining"
		})

		screen.append(timer)

		setInterval(() => {
			if (!state.active || state.active.time <= 0) {
				timer.setDisplay("00-00")
				return
			}

			let leftPad = (s) => {
				s = "" + s
				if (s.length == 1) return "0" + s
				return s
			}

			let remaining = state.settings.duration - (Date.now() - state.active.time)/1000
			let minutes = Math.floor(remaining/60)
			let seconds = Math.floor(remaining % 60);

			timer.setDisplay(`${leftPad(minutes)}-${leftPad(seconds)}`) 
		}, 500)


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
		if (this.state.active.time > 0) {
			let time = Date.now() - this.state.active.time
			if (time / 1000 > this.state.settings.duration) {
				this.state.active = {time: 0}
			} else {
				fs.write(this.state.active.file, `${time}, ${d}\n`, () => 0)	
			}
		}
		this.screen.render();
	}
}

function repl() {
	
	let state = {
		readBuffer : new Buffer([]),
		dataHandler: () => {},
		active: {
			time: 0
		},
		settings: {
			graph: true,
			data: false,
			duration: 300,
		}
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
