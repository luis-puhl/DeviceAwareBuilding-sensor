const csv = require("fast-csv");
const EventEmitter = require("events");

let devices = {};	// lista indexada de dispositivos

const emitterInstance = new EventEmitter();

/* ----------------------------------------------------------------------- */

class Device {
	constructor(mac, macResolved){
		this.mac = mac;
		this.macResolved = macResolved;
		this.rssHistory = [];
		this.ssidHistory = {};
		this.taHistory = {};
	}
	get rssStatistics(){
		let sum = 0;
		let avg = 0;
		let variance = 0;
		let stdDeviation = 0;
		if (this.rssHistory.length > 0){
			for (let rss of this.rssHistory){
				sum += rss;
			}
			avg = sum / this.rssHistory.length;

			sum = 0;
			for (let rss of this.rssHistory){
				sum += Math.pow(( rss - avg ), 2);
			}
			variance = sum / (this.rssHistory.length - 1);
			stdDeviation = Math.sqrt(variance);
		}
		return {
			size			: this.rssHistory.length,
			avg				: avg,
			variance		: variance,
			stdDeviation	: stdDeviation,
			time			: ( new Date() ).toISOString(),
		};
	}
	toJSON() {
		let ssidHistory = {};
		for (let ssid in this.ssidHistory){
			ssidHistory[ssid] = this.ssidHistory[ssid];
		}
		let taHistory = {};
		for (let ta in this.taHistory){
			taHistory[ta] = this.taHistory[ta];
		}
		return {
			mac				: this.mac,
			macResolved		: this.macResolved,
			rssHistory		: this.rssHistory,
			ssidHistory		: ssidHistory,
			taHistory		: taHistory,
			rssStatistics	: this.rssStatistics,
		};
	}
	appendPacket(packet){
		let rss = packet.radiotap.dbm_antsignal;
		let number = parseInt( rss.split(",")[0].split('-')[1] );
		this.rssHistory.push(number);

		let curTime = ( new Date() ).toISOString();
		this.ssidHistory[packet.wlan_mgt.ssid] = curTime;
		this.taHistory[packet.wlan.ta] = {
			ta			: packet.wlan.ta,
			ta_resolved	: packet.wlan.ta_resolved,
		};
	}
}

/* ----------------------------------------------------------------------- */

class Packet {
	constructor(sa, sa_resolved, ta, ta_resolved, dbm_antsignal, ssid){
		this.wlan = {
			sa				: sa,				// sender address
			sa_resolved		: sa_resolved,		// sender address resolved
			ta				: ta, 				// transmitter address
			ta_resolved		: ta_resolved,		// transmitter address resolved
		};
		this.radiotap = {
			dbm_antsignal	: dbm_antsignal,	// potencia de sinal (rss)
		};
		this.wlan_mgt = {
			ssid			: ssid, 			// nome da rede no pacote Beacon
		};
	}
}

/* ----------------------------------------------------------------------- */

function processarPacote(packet) {
	let sa = packet.wlan.sa;
	if (! devices[sa]){
		devices[sa] = new Device(sa, packet.wlan.sa_resolved);
		emitterInstance.emit('newDevice', devices[sa]);
	}
	devices[sa].appendPacket(packet);
}

/* ----------------------------------------------------------------------- */

function getReport(){
	let devicesCout = 0;
	let totalRss = 0;
	let totalPackets = 0;

	for (let deviceKey in devices){
		let device = devices[deviceKey];
		devicesCout++;

		let deviceRss = device.rssStatistics;

		totalRss += deviceRss.size * deviceRss.avg;
		totalPackets += deviceRss.size;
	}
	//statistics for all devices
	let avgDevices = totalRss / totalPackets;
	return {
		devicesCout		: devicesCout,
		overallAverage	: avgDevices,
	}
}

/* ----------------------------------------------------------------------- */

function getSuitableInterfaces() {
	const execSync = require('child_process').execSync;
	const stdioConf = {stdio: ['ignore', 'pipe', 'ignore']};

	let iwConfList = "";
	try {
		iwConfList = execSync('iwconfig | grep wlan', stdioConf).toString().split('\n');
	} catch (e){
		console.error('No suitable interface was found');
		throw new Error('No suitable interface was found');
	}
	let iwFaces = [];
	for (let iwFace of iwConfList){
		let iface = iwFace.split('\t')[0].split(' ')[0];
		if (iface.length > 1){
			try {
				execSync(`sudo ifconfig ${iface} down`, stdioConf);
				execSync(`sudo iwconfig ${iface} mode monitor`, stdioConf);
				execSync(`sudo ifconfig ${iface} up`, stdioConf);
			} catch (e) {
				console.error(`iface ${iface} will not be used`);
				continue;
			}
			iwFaces.push( iface );
		}
	}

	console.log(JSON.stringify( iwFaces ));
	return iwFaces;
}

// processs startup
function spawnTshark(){
	let iwFaces = getSuitableInterfaces();

	if (iwFaces.length < 1){
		console.error('No suitable interface was found');
		throw new Error('No suitable interface was found');
	}

	let childIface = iwFaces[0];

	const spawn = require('child_process').spawn;
	const tsharkChild = spawn(
		'tshark', [
			'-I',
			'-i', childIface,
			'-T', 'fields',
			'-E', 'separator=,',
			'-E', 'quote=d',
			'-e', 'wlan.sa',
			'-e', 'wlan.sa_resolved',
			'-e', 'wlan.ta',
			'-e', 'wlan.ta_resolved',
			'-e', 'radiotap.dbm_antsignal',
			'-e', 'wlan_mgt.ssid',
			'-Y', 'wlan.sa'
		]);
	return tsharkChild;
}

/* ----------------------------------------------------------------------- */

let tsharkChild;
let csvStream;

function shutdown(){
	try {
		if (csvStream == undefined){
			console.error('csvStream == undefined while tshark.js shutdown');
		} else {
			tsharkChild.stdout.unpipe(csvStream);
			csvStream.end();
		}
		tsharkChild.kill();
	} catch (e){
		console.error('Error while tshark.js shutdown');
		console.error(e);
	}
}

module.exports = () => {

	csvStream = csv()
		.on("data", function(data){
			let packet = new Packet(
				data[0], // sender address
				data[1], // sender address resolved
				data[2], // transmitter address
				data[3], // transmitter address resolved
				data[4], // potencia de sinal (rss)
				data[5], // nome da rede no pacote Beacon
			);
			processarPacote(packet);
		})
		.on("end", function(){
			console.log("done with csv");
		});

	tsharkChild = spawnTshark();

	tsharkChild.stderr.on('data', (data) => {
		/* for future use */
		console.error(`stderr: ${data}`);
	});
	tsharkChild.on('close', (code) => {
		console.log(`child process exited with code ${code}`);
	});

	tsharkChild.stdout.setEncoding('utf8');
	tsharkChild.stdout.pipe(csvStream);

	return {
		emitterInstance		: emitterInstance,
		shutdown			: shutdown,
		getReport			: getReport,
		getDevices			: () => {return devices;},
		getDeviceReport		: (macAddress) => {return devices[macAddress];},
	};
}
