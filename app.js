
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
		topic: appUtil.hostId,
		payload: `Last will: Host ${appUtil.hostId} is down from ${JSON.stringify(appUtil.ips)}`,
		qos: 2,
		retain: true
	}
})


function doReport() {
	let report = {
		host: appUtil.hostId,
		uptime: process.uptime(),
		sensor: tshark.getReport(),
	};
	clientMqtt.publish('devices/report', JSON.stringify(report))
}

clientMqtt.on('connect', function () {
	clientMqtt.subscribe('presence');
	clientMqtt.subscribe('ADMIN');
	clientMqtt.subscribe('devices');
	clientMqtt.subscribe(appUtil.hostId);

	clientMqtt.publish('presence', `Hello  ${appUtil.hostId}: got ips: ${JSON.stringify(appUtil.ips)}`)
})

clientMqtt.on('message', function (topic, message) {
	// message is Buffer
	console.log(message.toString());
	switch (topic.toString()){
		case 'devices':
			switch (message.toString()) {
				case 'report':
					doReport();
					break;
				default:
			}
			break;
		case 'ADMIN':
			switch (message.toString()) {
				case 'shutdown':
					shutdown();
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
		} catch (e){
			console.error('lost MQTT connection');
		}
	});
} catch (e) {
	clientMqtt.publish(appUtil.hostId , e.message);
	shutdown();
}

function shutdown(){
	console.log('Shutdown by remote call');
	try {
		tshark.shutdown();
	} catch (e){
		console.error(e.message + 'while app tshark shutdown');
	}
	try {
		clientMqtt.end();
		clientMqtt.publish('presence', util.hostId + ' is going down.');
	} catch (e){
		console.error(e.message + 'while app MQTT shutdown');
	}
}
