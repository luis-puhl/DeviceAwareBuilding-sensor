
const os = require('os');
const dns = require('dns');

const hostId = os.userInfo().username + '@' + os.hostname();
var ips = [];

dns.lookup(os.hostname(), (err, addresses, family) => {
	ips.push(addresses);
});

/* ----------------------------------------------------------------------- */

var csv = require("fast-csv");
process.stdin.setEncoding('utf8');

var devices = new Array();

function Device(mac){
	this.mac = mac;
	this.rssHistory = new Array();
	this.ssidHistory = new Array();
	client.publish(hostId + '', `Got new device with MAC ${JSON.stringify(mac)}`);
	return this;
}

var csvStream = csv()
	.on("data", function(data){
		var mac = data[0];
		var rss = data[1];
		var ssid = data[2];
		var curTime = new Date();
		if (!devices[mac]){
			devices[mac] = new Device(mac);
		}
		devices[mac].rssHistory[curTime] = rss;
		devices[mac].ssidHistory[ssid] = curTime;
	})
	.on("end", function(){
		console.log("done with tshark");
	});

process.stdin.pipe(csvStream);

/* ----------------------------------------------------------------------- */

var mqtt = require('mqtt')
var client  = mqtt.connect('mqtt://200.145.148.226', {
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
			var jsonMsg = {};
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

