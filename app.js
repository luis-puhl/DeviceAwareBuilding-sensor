
const appUtil = require('./util.js');

appUtil.autoUpdate();

/* ----------------------------------------------------------------------- */

const Tshark = require('./tshark.js');
let tshark = Tshark();
tshark.emitterInstance.on('newDevice', (device) => {
	clientMqtt.publish(appUtil.hostId + '', `Got new device with MAC ${JSON.stringify(device.mac)}`);
})

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
	clientMqtt.subscribe('presence')
	clientMqtt.subscribe(appUtil.hostId);

	clientMqtt.publish('presence', `Hello  ${appUtil.hostId}: got ips: ${JSON.stringify(appUtil.ips)}`)
})

clientMqtt.on('message', function (topic, message) {
	// message is Buffer
	console.log(message.toString());
	switch (topic){
		case appUtil.hostId:
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


function shutdown(){
	console.log('Shutdown by remote call');
	tshark.shutdown();
	clientMqtt.end();
}
