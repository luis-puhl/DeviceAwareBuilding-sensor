
const csv = require("fast-csv");
const EventEmitter = require("events");

let devices = [];

const emitterInstance = new EventEmitter();

class Device {
	constructor(mac, macResolved){
		this.mac = mac;
		this.macResolved = macResolved;
		this.rssHistory = new Array();
		this.ssidHistory = new Array();
		emitterInstance.emit('newDevice', this);
	}
	updateStatistics(size, avg, variance, stdDeviation){
		this.rssStatistics = {
			size			: size,
			avg				: avg,
			variance		: variance,
			stdDeviation	: stdDeviation,
			time			: new Date(),
		};
	}
}

function getReport(){
	let rssDevices = [];
	let devicesCout = 0;
	for (let deviceKey in devices){
		let device = devices[deviceKey];
		let rssArray = [];
		devicesCout++;
		for (let rssKey in device.rssHistory){
			let rss = device.rssHistory[rssKey];
			 //get first integer from each Rss string on rssHistory
			let number = parseInt(rss.split(",")[0].split('-')[1]);
			//list of rss for a device
			rssArray.push(number);
			//list of rss from all devices
			rssDevices.push(number);
		}
		//statistics for a device
		let avg = arrayAvg(rssArray);
		let variance = arrayVariance(rssArray, avg);
		let std = Math.sqrt(variance);
		device.updateStatistics(device.rssHistory.length, avg, variance, std);
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
			'-e', 'radiotap.dbm_antsignal',
			'-e', 'wlan_mgt.ssid',
			'-e', 'wlan.sa_resolved',
			'-Y', 'wlan.sa'
		]);
	tsharkChild.stdout.setEncoding('utf8');
	return tsharkChild;
}

/* ----------------------------------------------------------------------- */

let csvStream = csv()
	.on("data", function(data){
		let mac = data[0];
		let rss = data[1];
		let ssid = data[2];
		let macResolved =	data[3];
		let curTime = new Date();
		if (! devices[mac]){
			devices[mac] = new Device(mac, macResolved);
		}
		devices[mac].rssHistory[curTime] = rss;
		devices[mac].ssidHistory[ssid] = curTime;
	})
	.on("end", function(){
		console.log("done with tshark");
	});

/* ----------------------------------------------------------------------- */

let tsharkChild;
function shutdown(){
	try {
		process.stdin.unpipe(csvStream);
		csvStream.end();
		tsharkChild.kill();
	} catch (e){
		console.error(e.message + 'while tshark.js shutdown');
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
		getDevices			: () => Array.from(devices),
		emitterInstance		: emitterInstance,
		shutdown			: shutdown,
		getReport			: getReport,
		getDeviceReport		: getDeviceReport,
	};
}
