
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

const Tshark = require('./tshark.js');
let tshark;
try {
	let tshark = Tshark();
	tshark.emitterInstance.on('newDevice', (device) => {
		try {
			clientMqtt.publish(appUtil.hostId, `Got new device with MAC ${JSON.stringify(device.mac)}`);
		} catch (e){
			console.error('lost MQTT connection');
		}
	})
} catch (e){
	clientMqtt.publish(appUtil.hostId , e.message);
	shutdown();
}

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

clientMqtt.on('connect', function () {
	clientMqtt.subscribe('presence');
	clientMqtt.subscribe('ADMIN');
	clientMqtt.subscribe(appUtil.hostId);

	clientMqtt.publish('presence', `Hello  ${appUtil.hostId}: got ips: ${JSON.stringify(appUtil.ips)}`)
})

clientMqtt.on('message', function (topic, message) {
	// message is Buffer
	console.log(message.toString());
	switch (topic){
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


function shutdown(){
	console.log('Shutdown by remote call');
	try {
		tshark.shutdown();
	} catch (e){
		console.error(e.message);
	}
	try {
		clientMqtt.end();
	} catch (e){
		console.error(e.message);
	}
}
