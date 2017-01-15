
const os = require('os');

const hostId = os.userInfo().username + '@' + os.hostname();
let ips = [];

let ifaces = os.networkInterfaces();

Object.keys(ifaces).forEach(function (ifname) {
	let alias = 0;

	ifaces[ifname].forEach(function (iface) {
		if (iface.internal === true){
			// skip loopbacks
			return;
		}
		
		// save IP for later
		ips.push(iface.address);
		
		if (alias >= 1) {
			// this single interface has multiple ipv4 addresses
			console.log(ifname + ':' + alias, iface.address);
		} else {
			// this interface has only one ipv4 adress
			console.log(ifname, iface.address);
		}
		++alias;
	});
});

/* ----------------------------------------------------------------------- */

let csv = require("fast-csv");
let devices = new Array();

function Device(mac){
	this.mac = mac;
	this.rssHistory = new Array();
	this.ssidHistory = new Array();
	client.publish(hostId + '', `Got new device with MAC ${JSON.stringify(mac)}`);
	return this;
}

let csvStream = csv()
	.on("data", function(data){
		let mac = data[0];
		let rss = data[1];
		let ssid = data[2];
		let curTime = new Date();
		if (!devices[mac]){
			devices[mac] = new Device(mac);
		}
		devices[mac].rssHistory[curTime] = rss;
		devices[mac].ssidHistory[ssid] = curTime;
	})
	.on("end", function(){
		console.log("done with tshark");
	});

/* ----------------------------------------------------------------------- */
// processs startup
function spawnTshark(childPacketCount = 1000){
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
			'-Y', 'wlan.sa',
			'-c', childPacketCount
		]);
	tsharkChild.stdout.setEncoding('utf8');
	return tsharkChild;
}

let tsharkChild = spawnTshark();

tsharkChild.stderr.on('data', (data) => {
	/* for future use */
	console.error(`stderr: ${data}`);
});

tsharkChild.on('close', (code) => {
	console.log(`child process exited with code ${code}`);
	client.end();
});



tsharkChild.stdout.pipe(csvStream);

/* ----------------------------------------------------------------------- */

const mqtt = require('mqtt');
let client	= mqtt.connect('mqtt://200.145.148.226', {
	will: {
		topic: hostId,
		payload: `Last will: Host ${hostId} is down from ${JSON.stringify(ips)}`,
		qos: 2,
		retain: true
	}
})

function shutdown(){
	client.end();
	process.stdin.unpipe(csvStream);
	csvStream.end();
	console.log('Shutdown by remote call');
}

client.on('connect', function () {
	client.subscribe('presence')
	client.subscribe(hostId);

	client.publish('presence', `Hello mqtt from ${hostId}`)
	client.publish('presence', `${hostId}: got ips: ${JSON.stringify(ips)}`)
})

client.on('message', function (topic, message) {
	// message is Buffer
	console.log(message.toString());
	switch (topic){
		case hostId:
			let jsonMsg = {};
			try {
				jsonMsg = JSON.parse(message);
			} catch (e) {
				console.log("No json in topic " + topic);
				break;
			}
			if (jsonMsg['config'] == 'shutdown'){
				shutdown();
			}
			break;
		default:
			console.log("no action for topic " + topic);
	}
})
