const csv = require("fast-csv");
const EventEmitter = require("events");

let devices = {};

const emitterInstance = new EventEmitter();

class Device {
	constructor(mac, macResolved){
		this.mac = mac;
		this.macResolved = macResolved;
		this.rssHistory = {};
		this.ssidHistory = {};
		this.taHistory = [];
		emitterInstance.emit('newDevice', this);
	}
	updateRssStatistics(size, avg, variance, stdDeviation){
		this.rssStatistics = {
			size			: size,
			avg				: avg,
			variance		: variance,
			stdDeviation	: stdDeviation,
			time			: (new Date()).toISOString(),
		};
	}
	toJSON() {
		let rssHistory = {};
		for (let rss in this.rssHistory){
			rssHistory[rss] = this.rssHistory[rss];
		}
		let ssidHistory = {};
		for (let ssid in this.ssidHistory){
			ssidHistory[ssid] = this.ssidHistory[ssid];
		}
		return {
			"mac"			: this.mac,
			"macResolved"	: this.macResolved,
			"rssHistory"	: rssHistory,
			"ssidHistory"	: ssidHistory,
			"rssStatistics"	: this.rssStatistics,
		};
	}
}

function updedateDevices(data) {
	let wlan = {
		sa				: data[0], // sender address
		sa_resolved		: data[1], // sender address resolved
		ta				: data[2], // transmitter address
		ta_resolved		: data[3], // transmitter address resolved
	};
	let radiotap = {
		dbm_antsignal	: data[4],
	};
	let wlan_mgt = {
		ssid			: data[5],
	};

	if (wlan.sa != wlan.ta){
		console.log(`Got different transmitter and sender MAC: SA[${wlan.sa}] != TA[${wlan.ta}]`);
	}

	let curTime = (new Date()).toISOString();
	if (! devices[wlan.sa]){
		devices[wlan.sa] = new Device(wlan.sa, wlan.sa_resolved);
	}
	devices[wlan.sa].rssHistory[curTime] = radiotap.dbm_antsignal;
	devices[wlan.sa].ssidHistory[ssid] = curTime;
	devices[wlan.sa].taHistory.push({'ta': wlan.ta, 'ta_resolved': wlan.ta_resolved});
}

function getReport(){
	let rssDevices = [];
	let devicesCout = 0;
	for (let deviceKey in devices){
		let device = devices[deviceKey];
		let rssArray = [];
		let rssHistoryLength = 0;
		devicesCout++;
		for (let rssKey in device.rssHistory){
			let rss = device.rssHistory[rssKey];
			rssHistoryLength++;
			// get first integer from each Rss string on rssHistory
			let number = parseInt(rss.split(",")[0].split('-')[1]);
			// list of rss for a device
			rssArray.push(number);
			// list of rss from all devices
			rssDevices.push(number);
		}
		//statistics for a device
		let avg = arrayAvg(rssArray);
		let variance = arrayVariance(rssArray, avg);
		let std = Math.sqrt(variance);
		device.updateRssStatistics(rssHistoryLength, avg, variance, std);
	}
	//statistics for all devices
	let avgDevices = arrayAvg(rssDevices);
	let varianceDevices = arrayVariance(rssDevices, avgDevices);
	let std = Math.sqrt(varianceDevices);

	return {
		devicesCout					: devicesCout,
		overallAverage				: avgDevices,
		overallStandardDeviation	: std,
	}
}
function getDeviceReport(macAddress) {
	getReport();
	return devices[macAddress];
}
/*Math functions -------------------------------------------------------------*/
function arrayAvg(array){ //Avg function
	let sum = 0;
	for(let i = 0; i < array.length; i++) {
		sum += array[i];
	}
	return sum / array.length;
}
function arrayVariance(array, avg){//variance function
	let sum = 0;
	for(let i = 0; i < array.length; i++){
		sum += Math.pow(( array[i] - avg ), 2);
	}
	return sum / (array.length - 1);
}

/* ----------------------------------------------------------------------- */
// processs startup
function spawnTshark(){
	const execSync = require('child_process').execSync;
	const stdioConf = {stdio: ['ignore', 'pipe', 'ignore']};

	let iwConfList = execSync('iwconfig | grep wlan', stdioConf).toString().split('\n');
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
	tsharkChild.stdout.setEncoding('utf8');
	return tsharkChild;
}

/* ----------------------------------------------------------------------- */

let csvStream = csv()
	.on("data", function(data){
		updedateDevices(data);
	})
	.on("end", function(){
		console.log("done with tshark");
	});

/* ----------------------------------------------------------------------- */

let tsharkChild;
function shutdown(){
	try {
		if (csvStream == undefined){
			console.error('csvStream == undefined while tshark.js shutdown');
		}
		process.stdin.unpipe(csvStream);
		csvStream.end();
		tsharkChild.kill();
	} catch (e){
		console.error('Error while tshark.js shutdown');
		console.error(e);
	}
}

module.exports = () => {

	tsharkChild = spawnTshark();

	tsharkChild.stderr.on('data', (data) => {
		/* for future use */
		console.error(`stderr: ${data}`);
	});
	tsharkChild.on('close', (code) => {
		console.log(`child process exited with code ${code}`);
	});

	tsharkChild.stdout.pipe(csvStream);

	return {
		getDevices			: () => {return devices;},
		emitterInstance		: emitterInstance,
		shutdown			: shutdown,
		getReport			: getReport,
		getDeviceReport		: getDeviceReport,
	};
}
