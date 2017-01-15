
const csv = require("fast-csv");
const EventEmitter = require("events");

let devices = new Array();

const emitterInstance = new EventEmitter();

class Device {
	constructor(mac, macResolved){
		this.mac = mac;
		this.macResolved = macResolved;
		this.rssHistory = new Array();
		this.ssidHistory = new Array();
		emitterInstance.emit('newDevice', this);
	}
}

function getReport(){
	var rssDevices = [];
	for (let device of devices){
		var rssArray = [];
		for (let rss of device.rssHistory){
			var number = Regex.Match(rss, @"\d+").Value; //get first integer from each Rss string on rssHistory
			rssArray.push(number); //list of rss for a device
			rssDevices.push(number); //list of rss from all devices
		}
		//statistics for a device
		var avg = arrayAvg(rssArray);
		var variance = arrayVariance(rssArray);
		var std = STD(variance);
	}
	//statistics for all devices
	var avgDevices = arrayAvg(rssDevices);
	var varianceDevices = arrayVariance(rssDevices);
	var std = STD(varianceDevices);
	 
	return {
		devicesCout: devices.length,
	}
}
/*Math functions -------------------------------------------------------------*/
function arrayAvg(array){ //Avg function
  var sum = 0;

  for(var i = 0; i < array.length; i++) {
   sum = sum + array[i];
   }

  var avg = sum / array.length;

  return avg;
}

function arrayVariance(array){//variance function
  var avg = arrayAvg(array);
  var sum = 0;
  for(var i = 0; i < array.length; i++){
    sum = sum + Math.pow((array[i]-avg),2);
  }
  var variance = sum / (array.length - 1);

  return variance;

}

function STD(variance){

  var std = Math.sqrt(variance);

  return std;

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
		let macResolved =  data[3];
		let curTime = new Date();
		if (!devices[mac]){
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
		getDevices: () => Array.from(devices),
		emitterInstance: emitterInstance,
		shutdown: shutdown,
		getReport: getReport,
	};
}
