
const os = require('os');
const dns = require('dns');

var hostId = os.userInfo().username + '@' + os.hostname();
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
		console.log("done");
		console.log(devices);
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

client.on('connect', function () {
	client.subscribe('presence')
	client.publish('presence', `Hello mqtt from ${hostId}`)
	client.publish('presence', `${hostId}: got ips: ${JSON.stringify(ips)}`)
})

client.on('message', function (topic, message) {
	// message is Buffer
	console.log(message.toString())
	client.end()
})
