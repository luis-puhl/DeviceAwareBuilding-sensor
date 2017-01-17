
const appUtil = require('./util.js');

appUtil.autoUpdate();

process.on('SIGINT', () => {
	console.log('Received SIGINT.');
	shutdown();
});
process.on('SIGTERM', () => {
	console.log('Received SIGTERM.');
	shutdown();
});

/* ----------------------------------------------------------------------- */

const mqtt = require('mqtt');
let clientMqtt	= mqtt.connect('mqtt://200.145.148.226', {
	will: {
		topic		: appUtil.hostId,
		payload		: `Last will: Host ${appUtil.hostId} is down from ${JSON.stringify(appUtil.ips)}`,
		qos			: 2,
		retain		: true
	}
})


function doReport() {
	let report = {
		host		: appUtil.hostId,
		uptime		: process.uptime(),
		sensor		: tshark.getReport(),
	};
	clientMqtt.publish('devices/report', JSON.stringify(report));
}

function doDeiviceReport(macAddress) {
	let report = {
		host		: appUtil.hostId,
		uptime		: process.uptime(),
		sensor		: tshark.getDeviceReport(macAddress),
	};
	clientMqtt.publish('devices/report', JSON.stringify(report));
}

function doList() {
	let report = {
		host		: appUtil.hostId,
		uptime		: process.uptime(),
		sensor		: tshark.getDevices(),
	};
	clientMqtt.publish('devices/report', JSON.stringify(report));
}

clientMqtt.on('connect', function () {
	clientMqtt.subscribe('ADMIN');
	clientMqtt.subscribe('devices');

	clientMqtt.publish('ADMIN', `Hello  ${appUtil.hostId}: got ips: ${JSON.stringify(appUtil.ips)}`)
})

clientMqtt.on('message', function (topic, message) {
	// message is Buffer
	console.log(message.toString());
	switch (topic.toString()){
		case 'devices':
			switch (message.toString()) {
				case 'list':
					doList();
					break;
				case 'report':
					doReport();
					break;
				default:
					doDeiviceReport(message.toString());
			}
			break;
		case 'ADMIN':
			switch (message.toString()) {
				case 'shutdown':
					shutdown();
					break;
				case 'echo':
					clientMqtt.publish(topic, appUtil.hostId + ' ack');
					break;
				default:
			}
			break;
		default:
	}
})

/* ----------------------------------------------------------------------- */

const Tshark = require('./tshark.js');
let tshark;
try {
	tshark = Tshark();
	tshark.emitterInstance.on('newDevice', (device) => {
		try {
			clientMqtt.publish(appUtil.hostId, `Got new device with MAC ${JSON.stringify(device)}`);
			console.log(`Got new device with MAC ${JSON.stringify(device)}`);
		} catch (e){
			console.error('lost MQTT connection');
			console.error(e);
		}
	});
} catch (e) {
	clientMqtt.publish('ADMIN' , e.message);
	console.error('Error while strating tshark.js');
	console.error(e);
	shutdown();
}

function shutdown(){
	console.log('Shutdown');
	try {
		clientMqtt.end();
		clientMqtt.publish('ADMIN', appUtil.hostId + ' is going down.');
	} catch (e){
		console.error('Error while app MQTT shutdown');
		console.error(e);
	}
	try {
		tshark.shutdown();
	} catch (e){
		console.error('Error while app tshark shutdown');
		console.error(e);
	}
}
